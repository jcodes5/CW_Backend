import type { Request, Response, NextFunction } from 'express'
import type { AuthRequest, UserPermissions } from '../types'
import { getPermissions, isSuperAdmin } from '../services/role-permission.service'
import { sendResponse } from '../utils/response'

/**
 * Middleware to require super_admin role
 */
export const requireSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest
  try {
    if (!authReq.user) {
      return sendResponse(res, 401, false, 'Unauthorized', { error: 'No authentication token' })
    }

    const isSuperAdminUser = await isSuperAdmin(authReq.user.userId)
    if (!isSuperAdminUser) {
      return sendResponse(res, 403, false, 'Forbidden', { error: 'Super admin access required' })
    }

    return next()
  } catch (error) {
    console.error('Error in requireSuperAdmin middleware:', error)
    return sendResponse(res, 500, false, 'Internal server error')
  }
}

/**
 * Middleware to require admin role (super_admin or admin)
 */
export const requireAdminRole = async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest
  try {
    if (!authReq.user) {
      return sendResponse(res, 401, false, 'Unauthorized', { error: 'No authentication token' })
    }

    const userRole = authReq.user.role
    if (userRole !== 'super_admin' && userRole !== 'admin') {
      return sendResponse(res, 403, false, 'Forbidden', { error: 'Admin access required' })
    }

    // Attach permissions to request
    const perms = await getPermissions(authReq.user.userId)
    if (perms) {
      authReq.permissions = {
        userId: perms.userId,
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

    return next()
  } catch (error) {
    console.error('Error in requireAdminRole middleware:', error)
    return sendResponse(res, 500, false, 'Internal server error')
  }
}

/**
 * Middleware factory to require specific permission
 * @param permission - The permission flag to check (e.g., 'canAddProducts')
 */
export const requirePermission = (permission: keyof UserPermissions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest
    try {
      if (!authReq.user) {
        return sendResponse(res, 401, false, 'Unauthorized', { error: 'No authentication token' })
      }

      // Super admin always has all permissions
      if (authReq.user.role === 'super_admin') {
        return next()
      }

      // Check if user has the specific permission
      const perms = await getPermissions(authReq.user.userId)
      if (!perms || !(perms[permission])) {
        return sendResponse(res, 403, false, 'Forbidden', {
          error: `Permission '${String(permission)}' required`,
        })
      }

      return next()
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
export const loadPermissions = async (req: Request, _res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest
  try {
    if (!authReq.user) {
      return next()
    }

    const userRole = authReq.user.role
    if (userRole !== 'super_admin' && userRole !== 'admin') {
      return next()
    }

    const perms = await getPermissions(authReq.user.userId)
    if (perms) {
      authReq.permissions = {
        userId: perms.userId,
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
