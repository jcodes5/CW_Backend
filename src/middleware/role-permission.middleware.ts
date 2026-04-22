import type { Request, Response, NextFunction } from 'express'
import { getPermissions, isSuperAdmin } from '../services/role-permission.service'
import { sendResponse } from '../utils/response'

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string
        email: string
        role: string
      }
      permissions?: {
        canAddProducts: boolean
        canEditProducts: boolean
        canViewStock: boolean
        canManageTransactions: boolean
        canManageOrders: boolean
        canManageUsers: boolean
        canManageReviews: boolean
        canManageCoupons: boolean
        canManageDiy: boolean
        canManageHero: boolean
        isSuperAdminOverride: boolean
      }
    }
  }
}

/**
 * Middleware to require super_admin role
 */
export const requireSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return sendResponse(res, 401, false, 'Unauthorized', { error: 'No authentication token' })
    }

    const isSuperAdminUser = await isSuperAdmin(req.user.userId)
    if (!isSuperAdminUser) {
      return sendResponse(res, 403, false, 'Forbidden', { error: 'Super admin access required' })
    }

    next()
  } catch (error) {
    console.error('Error in requireSuperAdmin middleware:', error)
    return sendResponse(res, 500, false, 'Internal server error')
  }
}

/**
 * Middleware to require admin role (super_admin or admin)
 */
export const requireAdminRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return sendResponse(res, 401, false, 'Unauthorized', { error: 'No authentication token' })
    }

    const userRole = req.user.role
    if (userRole !== 'super_admin' && userRole !== 'admin') {
      return sendResponse(res, 403, false, 'Forbidden', { error: 'Admin access required' })
    }

    // Attach permissions to request
    const perms = await getPermissions(req.user.userId)
    if (perms) {
      req.permissions = {
        canAddProducts: perms.canAddProducts,
        canEditProducts: perms.canEditProducts,
        canViewStock: perms.canViewStock,
        canManageTransactions: perms.canManageTransactions,
        canManageOrders: perms.canManageOrders,
        canManageUsers: perms.canManageUsers,
        canManageReviews: perms.canManageReviews,
        canManageCoupons: perms.canManageCoupons,
        canManageDiy: perms.canManageDiy,
        canManageHero: perms.canManageHero,
        isSuperAdminOverride: perms.isSuperAdminOverride,
      }
    }

    next()
  } catch (error) {
    console.error('Error in requireAdminRole middleware:', error)
    return sendResponse(res, 500, false, 'Internal server error')
  }
}

/**
 * Middleware factory to require specific permission
 * @param permission - The permission flag to check (e.g., 'canAddProducts')
 */
export const requirePermission = (permission: keyof any) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return sendResponse(res, 401, false, 'Unauthorized', { error: 'No authentication token' })
      }

      // Super admin always has all permissions
      if (req.user.role === 'super_admin') {
        return next()
      }

      // Check if user has the specific permission
      const perms = await getPermissions(req.user.userId)
      if (!perms || !perms[permission]) {
        return sendResponse(res, 403, false, 'Forbidden', {
          error: `Permission '${String(permission)}' required`,
        })
      }

      next()
    } catch (error) {
      console.error('Error in requirePermission middleware:', error)
      return sendResponse(res, 500, false, 'Internal server error')
    }
  }
}

/**
 * Middleware to load user permissions (optional)
 * Attaches permissions to request if user is admin
 */
export const loadPermissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next()
    }

    const userRole = req.user.role
    if (userRole !== 'super_admin' && userRole !== 'admin') {
      return next()
    }

    const perms = await getPermissions(req.user.userId)
    if (perms) {
      req.permissions = {
        canAddProducts: perms.canAddProducts,
        canEditProducts: perms.canEditProducts,
        canViewStock: perms.canViewStock,
        canManageTransactions: perms.canManageTransactions,
        canManageOrders: perms.canManageOrders,
        canManageUsers: perms.canManageUsers,
        canManageReviews: perms.canManageReviews,
        canManageCoupons: perms.canManageCoupons,
        canManageDiy: perms.canManageDiy,
        canManageHero: perms.canManageHero,
        isSuperAdminOverride: perms.isSuperAdminOverride,
      }
    }

    next()
  } catch (error) {
    console.error('Error in loadPermissions middleware:', error)
    next()
  }
}
