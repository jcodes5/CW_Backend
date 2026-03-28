import { v4 as uuidv4 } from 'uuid'
import { query, queryOne, execute, withTransaction } from '@/config/database'

export interface CouponRow {
  id: string; code: string; type: 'percent' | 'fixed'
  value: number; min_order_amount: number | null; max_uses: number | null
  used_count: number; expires_at: Date | null; is_active: number
  created_at: Date
}

export interface CouponValidation {
  valid:        boolean
  coupon?:      CouponRow
  discount?:    number
  errorMessage?: string
}

// ── Validate a coupon code ────────────────────────────────────
export async function validateCoupon(
  code: string,
  userId: string,
  subtotal: number
): Promise<CouponValidation> {
  const coupon = await queryOne<CouponRow>(
    'SELECT * FROM coupons WHERE code = ? AND is_active = 1 LIMIT 1',
    [code.toUpperCase().trim()]
  )

  if (!coupon) {
    return { valid: false, errorMessage: 'Invalid coupon code' }
  }

  // Check expiry
  if (coupon.expires_at && new Date() > new Date(coupon.expires_at)) {
    return { valid: false, errorMessage: 'This coupon has expired' }
  }

  // Check max uses
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { valid: false, errorMessage: 'This coupon has reached its usage limit' }
  }

  // Check min order amount
  if (coupon.min_order_amount !== null && subtotal < Number(coupon.min_order_amount)) {
    return {
      valid: false,
      errorMessage: `Minimum order of ₦${Number(coupon.min_order_amount).toLocaleString()} required`,
    }
  }

  // Check if user already used this coupon
  const alreadyUsed = await queryOne<{ id: string }>(
    'SELECT id FROM coupon_usages WHERE coupon_id = ? AND user_id = ? LIMIT 1',
    [coupon.id, userId]
  )
  if (alreadyUsed) {
    return { valid: false, errorMessage: 'You have already used this coupon' }
  }

  // Calculate discount
  const discount = coupon.type === 'percent'
    ? Math.round(subtotal * (Number(coupon.value) / 100))
    : Math.min(Number(coupon.value), subtotal)

  return { valid: true, coupon, discount }
}

// ── Apply coupon to an order ──────────────────────────────────
export async function applyCoupon(
  couponId: string,
  userId: string,
  orderId: string
): Promise<void> {
  return withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO coupon_usages (id, coupon_id, user_id, order_id) VALUES (?, ?, ?, ?)`,
      [uuidv4(), couponId, userId, orderId]
    )
    await conn.execute(
      'UPDATE coupons SET used_count = used_count + 1 WHERE id = ?',
      [couponId]
    )
  })
}

// ── Admin: list coupons ───────────────────────────────────────
export async function listCoupons(page = 1, limit = 20): Promise<{ rows: CouponRow[]; total: number }> {
  const offset = (page - 1) * limit
  const [rows, count] = await Promise.all([
    query<CouponRow>(
      'SELECT * FROM coupons ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    ),
    query<{ total: number }>('SELECT COUNT(*) AS total FROM coupons'),
  ])
  return { rows, total: count[0]?.total ?? 0 }
}

// ── Admin: create coupon ──────────────────────────────────────
export async function createCoupon(data: {
  code: string; type: 'percent' | 'fixed'; value: number
  minOrderAmount?: number; maxUses?: number; expiresAt?: string
}): Promise<CouponRow> {
  const id = uuidv4()
  await execute(
    `INSERT INTO coupons (id, code, type, value, min_order_amount, max_uses, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id, data.code.toUpperCase().trim(), data.type, data.value,
      data.minOrderAmount ?? null, data.maxUses ?? null, data.expiresAt ?? null,
    ]
  )
  return queryOne<CouponRow>('SELECT * FROM coupons WHERE id = ?', [id]) as Promise<CouponRow>
}

// ── Admin: update coupon ──────────────────────────────────────
export async function updateCoupon(
  id: string,
  data: Partial<{ isActive: boolean; maxUses: number; expiresAt: string }>
): Promise<void> {
  const fields: string[] = []
  const values: unknown[] = []

  if (data.isActive !== undefined)  { fields.push('is_active = ?'); values.push(data.isActive ? 1 : 0) }
  if (data.maxUses !== undefined)   { fields.push('max_uses = ?'); values.push(data.maxUses) }
  if (data.expiresAt !== undefined) { fields.push('expires_at = ?'); values.push(data.expiresAt) }

  if (fields.length === 0) return
  values.push(id)
  await execute(`UPDATE coupons SET ${fields.join(', ')} WHERE id = ?`, values)
}

// ── Admin: delete coupon ──────────────────────────────────────
export async function deleteCoupon(id: string): Promise<void> {
  await execute('DELETE FROM coupons WHERE id = ?', [id])
}

// ── DTO ───────────────────────────────────────────────────────
export function toCouponDTO(coupon: CouponRow) {
  return {
    id:             coupon.id,
    code:           coupon.code,
    type:           coupon.type,
    value:          Number(coupon.value),
    minOrderAmount: coupon.min_order_amount ? Number(coupon.min_order_amount) : null,
    maxUses:        coupon.max_uses,
    usedCount:      coupon.used_count,
    expiresAt:      coupon.expires_at ?? null,
    isActive:       coupon.is_active === 1,
    createdAt:      coupon.created_at,
  }
}
