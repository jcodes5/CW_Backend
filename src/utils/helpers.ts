import crypto from 'crypto'

// ── String sanitisation ───────────────────────────────────────
export function sanitiseString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/<[^>]*>/g, '') // strip HTML tags
}

export function sanitiseEmail(email: unknown): string {
  if (typeof email !== 'string') return ''
  return email.trim().toLowerCase()
}

// ── Validation ────────────────────────────────────────────────
export function isValidEmail(email: string): boolean {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)
}

export function isValidNigerianPhone(phone: string): boolean {
  return /^(\+234|0)[789][01]\d{8}$/.test(phone.trim())
}

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  )
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
}

// ── Slug generation ───────────────────────────────────────────
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ── Secure token generation ───────────────────────────────────
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex')
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// ── Pagination ────────────────────────────────────────────────
export function parsePagination(
  query: Record<string, unknown>,
  defaultLimit = 12,
  maxLimit = 100
): { page: number; limit: number; offset: number } {
  const page  = Math.max(1, parseInt(String(query.page  ?? 1),  10) || 1)
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(String(query.limit ?? defaultLimit), 10) || defaultLimit)
  )
  return { page, limit, offset: (page - 1) * limit }
}

// ── Order reference ───────────────────────────────────────────
export function generateOrderReference(): string {
  const ts   = Date.now().toString(36).toUpperCase()
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
  return `CWC-${ts}-${rand}`
}

// ── Nigerian delivery estimate ────────────────────────────────
export function getDeliveryEstimate(state: string): string {
  const fast = ['Lagos', 'Ogun']
  const mid  = ['Oyo', 'Osun', 'Ekiti', 'Ondo', 'FCT - Abuja', 'Rivers', 'Edo', 'Delta']
  const days = fast.includes(state) ? 2 : mid.includes(state) ? 4 : 7
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export function getDeliveryFee(state: string, subtotal: number): number {
  if (subtotal >= 25000) return 0
  const zone1 = ['Lagos']
  const zone2 = ['Ogun']
  const zone3 = ['Oyo', 'Osun', 'Ekiti', 'Ondo', 'FCT - Abuja']
  const zone4 = ['Rivers', 'Edo', 'Delta', 'Anambra', 'Enugu', 'Imo', 'Abia']
  const zone5 = ['Kano', 'Kaduna']
  if (zone1.includes(state)) return 2000
  if (zone2.includes(state)) return 2500
  if (zone3.includes(state)) return 3000
  if (zone4.includes(state)) return 3500
  if (zone5.includes(state)) return 4500
  return 5000
}
