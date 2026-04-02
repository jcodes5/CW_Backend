import type { Request, Response, NextFunction } from 'express'
import type { AuthRequest, UserRole } from '@/types'
import { verifyAccessToken } from '@/utils/jwt'
import { unauthorized, forbidden } from '@/utils/response'

// ── Require valid JWT ─────────────────────────────────────────
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest
  const authHeader = authReq.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    unauthorized(res, 'No authentication token provided')
    return
  }

  const token = authHeader.slice(7)

  try {
    authReq.user = verifyAccessToken(token)
    next()
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      unauthorized(res, 'Token expired — please refresh')
    } else {
      unauthorized(res, 'Invalid authentication token')
    }
  }
}

// ── Optional auth — attaches user if token present, doesn't fail ─
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest
  const authHeader = authReq.headers.authorization

  if (authHeader?.startsWith('Bearer ')) {
    try {
      authReq.user = verifyAccessToken(authHeader.slice(7))
    } catch {
      // Silently ignore invalid/expired tokens for optional routes
    }
  }

  next()
}

// ── Require specific role(s) ──────────────────────────────────
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthRequest
    if (!authReq.user) {
      unauthorized(res)
      return
    }
    if (!roles.includes(authReq.user.role)) {
      forbidden(res, `Requires role: ${roles.join(' or ')}`)
      return
    }
    next()
  }
}

// ── Convenience role guards ───────────────────────────────────
export const requireAdmin  = requireRole('admin')
export const requireVendor = requireRole('admin', 'vendor')
