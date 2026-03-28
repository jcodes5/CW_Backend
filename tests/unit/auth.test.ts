/**
 * Auth Controller Unit Tests
 * Tests the auth logic in isolation using mocked dependencies
 */

import { generateTokenPair, verifyAccessToken } from '../../src/utils/jwt'
import { hashToken, randomToken } from '../../src/utils/crypto'

describe('JWT Utilities', () => {
  const payload = { userId: 'test-uuid', email: 'test@example.com', role: 'customer' as const }

  it('should generate a valid access token', () => {
    const { accessToken } = generateTokenPair(payload)
    expect(accessToken).toBeTruthy()
    expect(typeof accessToken).toBe('string')
  })

  it('should verify a valid access token and return payload', () => {
    const { accessToken } = generateTokenPair(payload)
    const decoded = verifyAccessToken(accessToken)
    expect(decoded.userId).toBe(payload.userId)
    expect(decoded.email).toBe(payload.email)
    expect(decoded.role).toBe(payload.role)
  })

  it('should throw on invalid token', () => {
    expect(() => verifyAccessToken('invalid.token.here')).toThrow()
  })

  it('should generate a refresh token', () => {
    const { refreshToken } = generateTokenPair(payload)
    expect(refreshToken).toBeTruthy()
    expect(typeof refreshToken).toBe('string')
  })
})

describe('Crypto Utilities', () => {
  it('should generate a random hex token of correct length', () => {
    const token = randomToken(32)
    expect(token).toHaveLength(64) // 32 bytes = 64 hex chars
    expect(/^[a-f0-9]+$/.test(token)).toBe(true)
  })

  it('should produce consistent hash for same input', () => {
    const token = 'test-reset-token'
    expect(hashToken(token)).toBe(hashToken(token))
  })

  it('should produce different hashes for different inputs', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'))
  })
})

describe('Helper Utilities', () => {
  const { generateOrderReference } = require('../../src/utils/crypto')
  const { getPagination } = require('../../src/utils/crypto')
  const { getDeliveryFee } = require('../../src/utils/helpers')

  it('should generate a CWC-prefixed order reference', () => {
    const ref = generateOrderReference()
    expect(ref).toMatch(/^CWC-[A-Z0-9]+-[A-Z0-9]+$/)
  })

  it('should return correct pagination defaults', () => {
    const { page, limit, offset } = getPagination(undefined, undefined)
    expect(page).toBe(1)
    expect(limit).toBe(12)
    expect(offset).toBe(0)
  })

  it('should cap limit at maxLimit', () => {
    const { limit } = getPagination(1, 9999, 50)
    expect(limit).toBe(50)
  })

  it('should calculate offset correctly', () => {
    const { offset } = getPagination(3, 12)
    expect(offset).toBe(24)
  })

  it('should give free delivery for orders over ₦25,000', () => {
    expect(getDeliveryFee('Lagos', 30000)).toBe(0)
  })

  it('should charge Lagos delivery fee for orders under threshold', () => {
    expect(getDeliveryFee('Lagos', 10000)).toBe(2000)
  })

  it('should charge higher fee for distant states', () => {
    const lagosF = getDeliveryFee('Lagos', 10000)
    const zamF   = getDeliveryFee('Zamfara', 10000)
    expect(zamF).toBeGreaterThan(lagosF)
  })
})
