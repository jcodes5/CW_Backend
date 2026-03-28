import jwt from 'jsonwebtoken'
import type { JWTPayload, TokenPair } from '@/types'

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  ?? 'dev_access_secret_change_in_prod'
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_change_in_prod'
const ACCESS_EXPIRES  = process.env.JWT_ACCESS_EXPIRES  ?? '15m'
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES ?? '7d'

export function generateTokenPair(payload: JWTPayload): TokenPair {
  const accessToken = jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES as jwt.SignOptions['expiresIn'],
    issuer: 'craftworldcentre',
    audience: 'craftworldcentre-client',
  })

  const refreshToken = jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES as jwt.SignOptions['expiresIn'],
    issuer: 'craftworldcentre',
    audience: 'craftworldcentre-client',
  })

  return { accessToken, refreshToken }
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, ACCESS_SECRET, {
    issuer: 'craftworldcentre',
    audience: 'craftworldcentre-client',
  }) as JWTPayload
}

export function verifyRefreshToken(token: string): JWTPayload {
  return jwt.verify(token, REFRESH_SECRET, {
    issuer: 'craftworldcentre',
    audience: 'craftworldcentre-client',
  }) as JWTPayload
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload
  } catch {
    return null
  }
}
