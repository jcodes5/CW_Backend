import crypto from 'crypto'

// ── Secure random string ──────────────────────────────────────
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex')
}

// ── SHA-256 hash (for refresh token storage) ──────────────────
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// ── HMAC-SHA-512 (Paystack webhook signature) ─────────────────
export function hmacSha512(secret: string, data: string): string {
  return crypto.createHmac('sha512', secret).update(data).digest('hex')
}

// ── Constant-time comparison (prevents timing attacks) ────────
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

// ── Generate order reference ──────────────────────────────────
export function generateOrderReference(): string {
  const ts   = Date.now().toString(36).toUpperCase()
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
  return `CWC-${ts}-${rand}`
}

// ── Slugify ───────────────────────────────────────────────────
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
}

// ── Naira ↔ Kobo ──────────────────────────────────────────────
export const toKobo   = (naira: number): number => Math.round(naira * 100)
export const fromKobo = (kobo: number):  number => kobo / 100

// ── Pagination helper ─────────────────────────────────────────
export function getPagination(
  page: unknown,
  limit: unknown,
  maxLimit = 50
): { page: number; limit: number; offset: number } {
  const p = Math.max(1, parseInt(String(page ?? '1'), 10) || 1)
  const l = Math.min(maxLimit, Math.max(1, parseInt(String(limit ?? '12'), 10) || 12))
  return { page: p, limit: l, offset: (p - 1) * l }
}

// ── Sanitise object (remove undefined keys) ───────────────────
export function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ) as Partial<T>
}

// ── Format Nigerian phone to E.164 ────────────────────────────
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('234') && digits.length === 13) return `+${digits}`
  if (digits.startsWith('0')  && digits.length === 11)  return `+234${digits.slice(1)}`
  if (digits.length === 10) return `+234${digits}`
  return phone
}
