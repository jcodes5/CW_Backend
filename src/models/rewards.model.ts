import { v4 as uuidv4 } from 'uuid'
import { query, queryOne, execute, withTransaction } from '@/config/database'

// ── Points config ─────────────────────────────────────────────
export const POINTS_CONFIG = {
  // Points earned per ₦1,000 spent
  EARN_RATE: 10,
  // Points needed to unlock reward
  REWARD_THRESHOLD: 1000,
  // Value of reward when threshold reached
  CASHBACK_VALUE:   500,    // ₦500 cashback
  DISCOUNT_PERCENT: 10,     // 10% discount code
  // Tier thresholds (lifetime points)
  TIERS: {
    bronze:   0,
    silver:   2000,
    gold:     5000,
    platinum: 15000,
  },
  // Bonus multipliers per tier
  TIER_MULTIPLIERS: {
    bronze:   1.0,
    silver:   1.25,
    gold:     1.5,
    platinum: 2.0,
  },
}

export type RewardTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export interface UserRewards {
  id: string
  userId: string
  points: number
  tier: RewardTier
  lifetimePoints: number
  updatedAt: Date
}

export interface RewardTransaction {
  id: string
  userId: string
  orderId?: string
  type: 'earned' | 'redeemed' | 'expired' | 'bonus' | 'adjusted'
  points: number
  description: string
  expiresAt?: Date
  createdAt: Date
}

// ── Get or create rewards account ────────────────────────────
export async function getOrCreate(userId: string): Promise<UserRewards> {
  const existing = await queryOne<{
    id: string; user_id: string; points: number
    tier: RewardTier; lifetime_points: number; updated_at: Date
  }>('SELECT * FROM user_rewards WHERE user_id = ? LIMIT 1', [userId])

  if (existing) {
    return {
      id: existing.id, userId: existing.user_id, points: existing.points,
      tier: existing.tier, lifetimePoints: existing.lifetime_points, updatedAt: existing.updated_at,
    }
  }

  const id = uuidv4()
  await execute(
    'INSERT INTO user_rewards (id, user_id, points, tier, lifetime_points) VALUES (?, ?, 0, "bronze", 0)',
    [id, userId]
  )
  return { id, userId, points: 0, tier: 'bronze', lifetimePoints: 0, updatedAt: new Date() }
}

// ── Award points for an order ────────────────────────────────
export async function awardOrderPoints(
  userId: string,
  orderId: string,
  orderTotal: number
): Promise<{ pointsEarned: number; newTotal: number; newTier: RewardTier }> {
  return withTransaction(async (conn) => {
    // Get current rewards
    const rewards = await getOrCreate(userId)
    const tier    = rewards.tier

    // Calculate points with tier multiplier
    const basePoints    = Math.floor((orderTotal / 1000) * POINTS_CONFIG.EARN_RATE)
    const multiplier    = POINTS_CONFIG.TIER_MULTIPLIERS[tier]
    const pointsEarned  = Math.floor(basePoints * multiplier)

    if (pointsEarned <= 0) return { pointsEarned: 0, newTotal: rewards.points, newTier: tier }

    const newTotal        = rewards.points + pointsEarned
    const newLifetime     = rewards.lifetimePoints + pointsEarned
    const newTier         = getTierForPoints(newLifetime)

    // Update rewards balance
    await conn.execute(
      `UPDATE user_rewards
       SET points = ?, tier = ?, lifetime_points = ?
       WHERE user_id = ?`,
      [newTotal, newTier, newLifetime, userId]
    )

    // Record transaction
    await conn.execute(
      `INSERT INTO reward_transactions (id, user_id, order_id, type, points, description, expires_at)
       VALUES (?, ?, ?, 'earned', ?, ?, DATE_ADD(NOW(), INTERVAL 12 MONTH))`,
      [
        uuidv4(), userId, orderId, pointsEarned,
        `Earned ${pointsEarned} pts for order — ${multiplier > 1 ? `${tier} tier bonus applied` : 'standard rate'}`,
      ]
    )

    return { pointsEarned, newTotal, newTier }
  })
}

// ── Redeem points ─────────────────────────────────────────────
export async function redeemPoints(
  userId: string,
  redemptionType: 'cashback' | 'discount_code'
): Promise<{ couponCode: string; value: number; pointsUsed: number }> {
  return withTransaction(async (conn) => {
    const rewards = await getOrCreate(userId)

    if (rewards.points < POINTS_CONFIG.REWARD_THRESHOLD) {
      throw new Error(`Need ${POINTS_CONFIG.REWARD_THRESHOLD} points to redeem. You have ${rewards.points}.`)
    }

    const pointsUsed = POINTS_CONFIG.REWARD_THRESHOLD
    const value      = redemptionType === 'cashback'
      ? POINTS_CONFIG.CASHBACK_VALUE
      : POINTS_CONFIG.DISCOUNT_PERCENT

    // Generate a unique coupon code
    const code = `REWARD-${userId.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`

    // Create coupon
    const couponId = uuidv4()
    await conn.execute(
      `INSERT INTO coupons (id, code, type, value, min_order_amount, max_uses, expires_at, is_active)
       VALUES (?, ?, ?, ?, NULL, 1, DATE_ADD(NOW(), INTERVAL 30 DAY), 1)`,
      [couponId, code, redemptionType === 'cashback' ? 'fixed' : 'percent', value]
    )

    // Deduct points
    await conn.execute(
      'UPDATE user_rewards SET points = points - ? WHERE user_id = ?',
      [pointsUsed, userId]
    )

    // Record redemption transaction
    await conn.execute(
      `INSERT INTO reward_transactions (id, user_id, type, points, description)
       VALUES (?, ?, 'redeemed', ?, ?)`,
      [uuidv4(), userId, -pointsUsed, `Redeemed ${pointsUsed} pts for ${redemptionType === 'cashback' ? `₦${value} cashback` : `${value}% discount code`}`]
    )

    // Record redemption
    await conn.execute(
      `INSERT INTO reward_redemptions (id, user_id, type, points_used, value, coupon_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
      [uuidv4(), userId, redemptionType, pointsUsed, value, couponId]
    )

    return { couponCode: code, value, pointsUsed }
  })
}

// ── Get transaction history ────────────────────────────────────
export async function getHistory(userId: string, limit = 20): Promise<RewardTransaction[]> {
  const rows = await query<{
    id: string; user_id: string; order_id: string; type: string
    points: number; description: string; expires_at: Date; created_at: Date
  }>(
    `SELECT * FROM reward_transactions WHERE user_id = ?
     ORDER BY created_at DESC LIMIT ?`,
    [userId, limit]
  )
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, orderId: r.order_id ?? undefined,
    type: r.type as RewardTransaction['type'], points: r.points,
    description: r.description, expiresAt: r.expires_at ?? undefined, createdAt: r.created_at,
  }))
}

// ── Progress to next reward ───────────────────────────────────
export function getProgress(currentPoints: number): {
  progress: number         // 0–100 %
  pointsToReward: number
  canRedeem: boolean
} {
  const threshold    = POINTS_CONFIG.REWARD_THRESHOLD
  const progress     = Math.min(100, Math.round((currentPoints / threshold) * 100))
  const pointsToReward = Math.max(0, threshold - currentPoints)
  return { progress, pointsToReward, canRedeem: currentPoints >= threshold }
}

// ── Tier helper ───────────────────────────────────────────────
export function getTierForPoints(lifetimePoints: number): RewardTier {
  const { TIERS } = POINTS_CONFIG
  if (lifetimePoints >= TIERS.platinum) return 'platinum'
  if (lifetimePoints >= TIERS.gold)     return 'gold'
  if (lifetimePoints >= TIERS.silver)   return 'silver'
  return 'bronze'
}

// ── DTO ───────────────────────────────────────────────────────
export function toRewardsDTO(rewards: UserRewards) {
  const { progress, pointsToReward, canRedeem } = getProgress(rewards.points)
  return {
    points:           rewards.points,
    tier:             rewards.tier,
    lifetimePoints:   rewards.lifetimePoints,
    progress,
    pointsToReward,
    canRedeem,
    rewardThreshold:  POINTS_CONFIG.REWARD_THRESHOLD,
    cashbackValue:    POINTS_CONFIG.CASHBACK_VALUE,
    discountPercent:  POINTS_CONFIG.DISCOUNT_PERCENT,
    tierMultiplier:   POINTS_CONFIG.TIER_MULTIPLIERS[rewards.tier],
    nextTier:         getNextTier(rewards.tier),
    pointsToNextTier: getPointsToNextTier(rewards.lifetimePoints),
  }
}

function getNextTier(tier: RewardTier): RewardTier | null {
  const map: Record<RewardTier, RewardTier | null> = {
    bronze: 'silver', silver: 'gold', gold: 'platinum', platinum: null,
  }
  return map[tier]
}

function getPointsToNextTier(lifetimePoints: number): number {
  const { TIERS } = POINTS_CONFIG
  if (lifetimePoints >= TIERS.platinum) return 0
  if (lifetimePoints >= TIERS.gold)     return TIERS.platinum - lifetimePoints
  if (lifetimePoints >= TIERS.silver)   return TIERS.gold - lifetimePoints
  return TIERS.silver - lifetimePoints
}
