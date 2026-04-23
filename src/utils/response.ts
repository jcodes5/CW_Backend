import type { Response } from 'express'
import type { ApiResponse } from '@/types'

export function ok<T>(res: Response, data: T, message = 'Success', status = 200): Response {
  const body: ApiResponse<T> = { success: true, message, data }
  return res.status(status).json(body)
}

export function created<T>(res: Response, data: T, message = 'Created'): Response {
  return ok(res, data, message, 201)
}

export function noContent(res: Response, _p0: string): Response {
  return res.status(204).send()
}

export function paginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  message = 'Success'
): Response {
  const body: ApiResponse<T[]> = {
    success: true,
    message,
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  }
  return res.status(200).json(body)
}

export function badRequest(res: Response, message: string, errors?: Record<string, string[]>): Response {
  return res.status(400).json({ success: false, message, errors })
}

export function unauthorized(res: Response, message = 'Unauthorized'): Response {
  return res.status(401).json({ success: false, message })
}

export function forbidden(res: Response, message = 'Forbidden'): Response {
  return res.status(403).json({ success: false, message })
}

export function notFound(res: Response, message = 'Not found'): Response {
  return res.status(404).json({ success: false, message })
}

export function conflict(res: Response, message: string): Response {
  return res.status(409).json({ success: false, message })
}

export function serverError(res: Response, message = 'Internal server error'): Response {
  return res.status(500).json({ success: false, message })
}

export function sendResponse<T>(
  res: Response,
  statusCode: number,
  success: boolean,
  message: string,
  data?: T
): Response {
  const body: any = { success, message }
  if (data !== undefined) {
    body.data = data
  }
  return res.status(statusCode).json(body)
}
