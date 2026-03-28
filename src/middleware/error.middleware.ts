import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express'
import { logger } from '@/utils/logger'

// ── Global error handler ──────────────────────────────────────
export const errorHandler: ErrorRequestHandler = (
  err: Error & { statusCode?: number; code?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // MySQL duplicate entry
  if (err.code === 'ER_DUP_ENTRY') {
    res.status(409).json({ success: false, message: 'A record with that value already exists' })
    return
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({ success: false, message: 'Invalid token' })
    return
  }
  if (err.name === 'TokenExpiredError') {
    res.status(401).json({ success: false, message: 'Token expired' })
    return
  }

  const statusCode = err.statusCode ?? 500
  const message    = statusCode < 500 ? err.message : 'Internal server error'

  if (statusCode >= 500) {
    logger.error('Unhandled error:', { message: err.message, stack: err.stack })
  }

  res.status(statusCode).json({ success: false, message })
}

// ── 404 handler ───────────────────────────────────────────────
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  })
}

// ── Async wrapper — removes try/catch boilerplate ─────────────
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next)
  }
}
