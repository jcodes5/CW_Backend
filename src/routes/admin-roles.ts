import { Router } from 'express'
import type { AuthRequest } from '../types'
import { authenticate } from '../middleware/auth.middleware'
import { requireSuperAdmin } from '../middleware/role-permission.middleware'
import {
  getAdminCount,
  getSuperAdminCount,
  assignRole,
  revokeAdminRole,
  getAllAdmins,
  getPermissions,
  isSuperAdmin,
} from '../services/role-permission.service'
import { query } from '../config/database'
import { ok, created, badRequest, notFound, conflict, serverError } from '../utils/response'

const router = Router()

/**
 * GET /admin/roles
 * List all admin users (super_admin only)
 */
router.get('/', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const admins = await getAllAdmins()
    const adminCount = await getAdminCount()
    const superAdminCount = await getSuperAdminCount()

    return ok(res, {
      admins,
      counts: {
        admins: adminCount,
        superAdmins: superAdminCount,
        adminLimit: 5,
        superAdminLimit: 1,
      },
    }, 'Admin users retrieved')
  } catch (error) {
    console.error('Error listing admins:', error)
    return serverError(res, 'Failed to retrieve admin users')
  }
})

/**
 * POST /admin/roles
 * Create new admin user (super_admin only)
 * Body: { email, role: 'admin' | 'super_admin' }
 */
router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { email, role } = req.body

    // Validation
    if (!email || !role) {
      return badRequest(res, 'Email and role are required')
    }

    if (role !== 'admin' && role !== 'super_admin') {
      return badRequest(res, 'Invalid role. Must be "admin" or "super_admin"')
    }

    // Check if user exists
    const userResult = await query('SELECT id, role FROM users WHERE email = ?', [email])
    if (!userResult[0] || (userResult[0] as []).length === 0) {
      return notFound(res, 'User not found')
    }

    const userId = (userResult[0] as [{ id: string }])[0].id

    // Validate constraints
    if (role === 'super_admin') {
      const superAdminCount = await getSuperAdminCount()
      if (superAdminCount >= 1) {
        return conflict(res, 'Cannot create second super_admin. Only one super_admin is allowed.')
      }
    } else if (role === 'admin') {
      const adminCount = await getAdminCount()
      if (adminCount >= 5) {
        return conflict(res, 'Cannot create more admins. Maximum of 5 admins allowed.')
      }
    }

    // Assign role
    await assignRole(userId, role)

    // Fetch updated user data
    const updatedUserResult = await query(
      `SELECT 
        id,
        first_name as firstName,
        last_name as lastName,
        email,
        role,
        is_active as isActive,
        created_at as createdAt
      FROM users WHERE id = ?`,
      [userId]
    )

    const updatedUser = (updatedUserResult[0] as [any])[0]

    return created(res, {
      user: updatedUser,
      adminCount: await getAdminCount(),
      superAdminCount: await getSuperAdminCount(),
    }, `User promoted to ${role}`)
  } catch (error: any) {
    console.error('Error creating admin:', error)

    if (error.message?.includes('Cannot create second super_admin')) {
      return conflict(res, error.message)
    }
    if (error.message?.includes('Cannot create more admins')) {
      return conflict(res, error.message)
    }

    return serverError(res, 'Failed to create admin user')
  }
})

/**
 * DELETE /admin/roles/:userId
 * Revoke admin role from user (super_admin only)
 */
router.delete('/:userId', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const userId = typeof req.params.userId === 'string' ? req.params.userId : req.params.userId[0]

    if (!userId) {
      return badRequest(res, 'User ID is required')
    }

    // Check if user exists
    const userResult = await query('SELECT id, role, email FROM users WHERE id = ?', [userId])
    if (!userResult[0] || (userResult[0] as []).length === 0) {
      return notFound(res, 'User not found')
    }

    const user = (userResult[0] as [{ id: string; email: string; role: string }])[0]

    // Can't revoke own access
    if ((req as AuthRequest).user?.userId === userId) {
      return badRequest(res, 'Cannot revoke your own admin access')
    }

    // Prevent revoking last super_admin
    if (user.role === 'super_admin') {
      const superAdminCount = await getSuperAdminCount()
      if (superAdminCount <= 1) {
        return conflict(res, 'Cannot revoke the last super_admin. At least one super_admin must exist.')
      }
    }

    // Revoke role
    await revokeAdminRole(userId)

    return ok(res, {
      user: {
        id: user.id,
        email: user.email,
        newRole: 'customer',
      },
      adminCount: await getAdminCount(),
      superAdminCount: await getSuperAdminCount(),
    }, `Admin access revoked for ${user.email}`)
  } catch (error: any) {
    console.error('Error revoking admin role:', error)

    if (error.message?.includes('Cannot revoke the last super_admin')) {
      return conflict(res, error.message)
    }

    return serverError(res, 'Failed to revoke admin access')
  }
})

/**
 * GET /admin/roles/current
 * Get current user's role and permissions
 */
router.get('/current', authenticate, async (req, res) => {
  try {
    const authUser = (req as AuthRequest).user;
    if (!authUser) {
      return badRequest(res, 'Not authenticated')
    }

    const userResult = await query(
      `SELECT 
        id,
        first_name as firstName,
        last_name as lastName,
        email,
        role,
        is_active as isActive,
        created_at as createdAt
      FROM users WHERE id = ?`,
      [authUser.userId]
    )

    if (!userResult[0] || (userResult[0] as []).length === 0) {
      return notFound(res, 'User not found')
    }

    const user = (userResult[0] as [any])[0]
    const isSuper = await isSuperAdmin(authUser.userId)
    const permissions = await getPermissions(authUser.userId)

    return ok(res, {
      user,
      isSuperAdmin: isSuper,
      permissions,
    }, 'Current user role and permissions')
  } catch (error) {
    console.error('Error getting current user role:', error)
    return serverError(res, 'Failed to retrieve user role')
  }
})

export default router