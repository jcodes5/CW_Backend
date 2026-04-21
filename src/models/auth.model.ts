import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { queryOne, execute } from '@/config/database'
import type { UserRow, RegisterBody } from '@/types'
import { hashToken, randomToken } from '@/utils/crypto'

// ── Find user by email ────────────────────────────────────────
export async function findByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    'SELECT * FROM users WHERE email = ? AND is_active = 1 LIMIT 1',
    [email.toLowerCase()]
  )
}

// ── Find user by OAuth provider ───────────────────────────────
export async function findByProvider(provider: 'google' | 'facebook', providerId: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    'SELECT * FROM users WHERE provider = ? AND provider_id = ? AND is_active = 1 LIMIT 1',
    [provider, providerId]
  )
}

// ── Find user by ID ───────────────────────────────────────────
export async function findById(id: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    'SELECT * FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
    [id]
  )
}

// ── Create user ───────────────────────────────────────────────
export async function createUser(data: RegisterBody): Promise<UserRow> {
  const id           = uuidv4()
  const passwordHash = await bcrypt.hash(data.password, parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10))
  const verifyToken  = randomToken(32)
  const verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  await execute(
    `INSERT INTO users (id, first_name, last_name, email, phone, password_hash, provider, role, is_active, is_verified, verify_token, verify_token_expires)
     VALUES (?, ?, ?, ?, ?, ?, 'local', 'customer', 1, 0, ?, ?)`,
    [id, data.firstName.trim(), data.lastName.trim(), data.email.toLowerCase(), data.phone ?? null, passwordHash, hashToken(verifyToken), verifyTokenExpires]
  )

  const user = await findById(id) as UserRow
  // Attach the plain token for email sending
  ;(user as any).verify_token = verifyToken
  return user
}

// ── Create OAuth user ──────────────────────────────────────────
export async function createOAuthUser(data: {
  firstName: string
  lastName: string
  email: string
  provider: 'google' | 'facebook'
  providerId: string
  avatar?: string
}): Promise<UserRow> {
  const id = uuidv4()

  await execute(
    `INSERT INTO users (id, first_name, last_name, email, avatar, password_hash, provider, provider_id, role, is_active, is_verified)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'customer', 1, 1)`,
    [id, data.firstName.trim(), data.lastName.trim(), data.email.toLowerCase(), data.avatar ?? null, data.provider, data.providerId]
  )

  return findById(id) as Promise<UserRow>
}

// ── Verify password ───────────────────────────────────────────
export async function verifyPassword(user: UserRow, password: string): Promise<boolean> {
  // OAuth users don't have passwords
  if (user.provider !== 'local' || !user.password_hash) {
    return false
  }
  return bcrypt.compare(password, user.password_hash)
}

// ── Store refresh token ───────────────────────────────────────
export async function storeRefreshToken(
  userId: string,
  token: string,
  expiresInDays = 7
): Promise<void> {
  const id        = uuidv4()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)

  // Clean up old tokens for this user (keep last 5)
  await execute(
    `DELETE FROM refresh_tokens
     WHERE user_id = ? AND id NOT IN (
       SELECT id FROM (
         SELECT id FROM refresh_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 4
       ) t
     )`,
    [userId, userId]
  )

  await execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [id, userId, tokenHash, expiresAt]
  )
}

// ── Validate and consume refresh token ───────────────────────
export async function consumeRefreshToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token)
  const row = await queryOne<{ user_id: string; expires_at: Date; revoked_at: Date | null }>(
    `SELECT user_id, expires_at, revoked_at
     FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
    [tokenHash]
  )

  if (!row || row.revoked_at || new Date() > new Date(row.expires_at)) {
    return null
  }

  // Rotate: revoke old token
  await execute(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?',
    [tokenHash]
  )

  return row.user_id
}

// ── Revoke all tokens for user (logout all devices) ───────────
export async function revokeAllTokens(userId: string): Promise<void> {
  await execute(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [userId]
  )
}

// ── Store password reset token ────────────────────────────────
export async function storeResetToken(userId: string, token: string): Promise<void> {
  const tokenHash = hashToken(token)
  const expires   = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await execute(
    'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
    [tokenHash, expires, userId]
  )
}

// ── Find user by reset token ──────────────────────────────────
export async function findByResetToken(token: string): Promise<UserRow | null> {
  const tokenHash = hashToken(token)
  return queryOne<UserRow>(
    `SELECT * FROM users
     WHERE reset_token = ? AND reset_token_expires > NOW() AND is_active = 1 LIMIT 1`,
    [tokenHash]
  )
}

// ── Reset password ────────────────────────────────────────────
export async function resetPassword(userId: string, newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10))
  await execute(
    `UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL
     WHERE id = ?`,
    [hash, userId]
  )
  await revokeAllTokens(userId)
}

// ── Update password ───────────────────────────────────────────
export async function updatePassword(userId: string, newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10))
  await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId])
}

// ── Update profile ────────────────────────────────────────────
export async function updateProfile(
  userId: string,
  data: { firstName?: string; lastName?: string; phone?: string; avatar?: string }
): Promise<UserRow | null> {
  const fields: string[] = []
  const values: unknown[] = []

  if (data.firstName) { fields.push('first_name = ?'); values.push(data.firstName.trim()) }
  if (data.lastName)  { fields.push('last_name = ?');  values.push(data.lastName.trim())  }
  if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone || null) }
  if (data.avatar !== undefined) { fields.push('avatar = ?'); values.push(data.avatar) }

  if (fields.length === 0) return findById(userId)

  values.push(userId)
  await execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values)
  return findById(userId)
}

// ── Update last login ─────────────────────────────────────────
export async function updateLastLogin(userId: string): Promise<void> {
  await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [userId])
}

// ── Find user by verification token ───────────────────────────
export async function findByVerifyToken(token: string): Promise<UserRow | null> {
  const tokenHash = hashToken(token)
  return queryOne<UserRow>(
    `SELECT * FROM users
     WHERE verify_token = ? AND verify_token_expires > NOW() AND is_active = 1 AND is_verified = 0 LIMIT 1`,
    [tokenHash]
  )
}

// ── Verify user email ─────────────────────────────────────────
export async function verifyUserEmail(userId: string): Promise<void> {
  await execute(
    'UPDATE users SET is_verified = 1, verify_token = NULL, verify_token_expires = NULL WHERE id = ?',
    [userId]
  )
}

// ── Store new verification token (for resend) ─────────────────
export async function storeVerifyToken(userId: string, token: string): Promise<void> {
  const tokenHash = hashToken(token)
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await execute(
    'UPDATE users SET verify_token = ?, verify_token_expires = ? WHERE id = ?',
    [tokenHash, expires, userId]
  )
}

// ── Map DB row to API shape ───────────────────────────────────
export function toUserDTO(row: UserRow) {
  return {
    id:         row.id,
    firstName:  row.first_name,
    lastName:   row.last_name,
    email:      row.email,
    phone:      row.phone ?? undefined,
    avatar:     row.avatar ?? undefined,
    role:       row.role,
    isVerified: row.is_verified === 1,
    isActive:   row.is_active === 1,
    provider:   row.provider,
    createdAt:  row.created_at,
  }
}
