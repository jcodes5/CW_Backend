import { Router, type Request, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/auth.middleware'
import { requireSuperAdmin, requirePermission } from '../middleware/role-permission.middleware'
import {
  validateAdminCount,
  getAdminCount,
  getSuperAdminCount,
  assignRole,
  revokeAdminRole,
  getAllAdmins,
  getPermissions,
  isSuperAdmin,
} from '../services/role-permission.service'
import { connection as db } from '../config/database'
import { sendResponse } from '../utils/response'

const router = Router()

/**
 * GET /admin/roles
 * List all admin users (super_admin only)
 */
router.get('/', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const admins = await getAllAdmins()
    const adminCount = await getAdminCount()
    const superAdminCount = await getSuperAdminCount()

    return sendResponse(res, 200, true, 'Admin users retrieved', {
      admins,
      counts: {
        admins: adminCount,
        superAdmins: superAdminCount,
        adminLimit: 5,
        superAdminLimit: 1,
      },
    })
  } catch (error) {
    console.error('Error listing admins:', error)
    return sendResponse(res, 500, false, 'Failed to retrieve admin users')
  }
})

/**
 * POST /admin/roles
 * Create new admin user (super_admin only)
 * Body: { email, role: 'admin' | 'super_admin' }
 */
router.post('/', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body

    // Validation
    if (!email || !role) {
      return sendResponse(res, 400, false, 'Email and role are required')
    }

    if (role !== 'admin' && role !== 'super_admin') {
      return sendResponse(res, 400, false, 'Invalid role. Must be "admin" or "super_admin"')
    }

    // Check if user exists
    const userResult = await db.query('SELECT id, role FROM users WHERE email = ?', [email])
    if (!userResult[0] || userResult[0].length === 0) {
      return sendResponse(res, 404, false, 'User not found')
    }

    const userId = userResult[0][0].id
    const currentRole = userResult[0][0].role

    // Validate constraints
    if (role === 'super_admin') {
      const superAdminCount = await getSuperAdminCount()
      if (superAdminCount >= 1) {
        return sendResponse(res, 409, false, 'Cannot create second super_admin. Only one super_admin is allowed.', {
          current_super_admins: superAdminCount,
        })
      }
    } else if (role === 'admin') {
      const adminCount = await getAdminCount()
      if (adminCount >= 5) {
        return sendResponse(res, 409, false, 'Cannot create more admins. Maximum of 5 admins allowed.', {
          current_admins: adminCount,
          admin_limit: 5,
        })
      }
    }

    // Assign role
    await assignRole(userId, role)

    // Fetch updated user data
    const updatedUserResult = await db.query(
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

    const updatedUser = updatedUserResult[0][0]

    return sendResponse(res, 201, true, `User promoted to ${role}`, {
      user: updatedUser,
      adminCount: await getAdminCount(),
      superAdminCount: await getSuperAdminCount(),
    })
  } catch (error: any) {
    console.error('Error creating admin:', error)

    if (error.message?.includes('Cannot create second super_admin')) {
      return sendResponse(res, 409, false, error.message)
    }
    if (error.message?.includes('Cannot create more admins')) {
      return sendResponse(res, 409, false, error.message)
    }

    return sendResponse(res, 500, false, 'Failed to create admin user')
  }
})

/**
 * DELETE /admin/roles/:userId
 * Revoke admin role from user (super_admin only)
 */
router.delete('/:userId', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params

    if (!userId) {
      return sendResponse(res, 400, false, 'User ID is required')
    }

    // Check if user exists
    const userResult = await db.query('SELECT id, role, email FROM users WHERE id = ?', [userId])
    if (!userResult[0] || userResult[0].length === 0) {
      return sendResponse(res, 404, false, 'User not found')
    }

    const user = userResult[0][0]

    // Can't revoke own access
    if (req.user?.userId === userId) {
      return sendResponse(res, 400, false, 'Cannot revoke your own admin access')
    }

    // Prevent revoking last super_admin
    if (user.role === 'super_admin') {
      const superAdminCount = await getSuperAdminCount()
      if (superAdminCount <= 1) {
        return sendResponse(res, 409, false, 'Cannot revoke the last super_admin. At least one super_admin must exist.')
      }
    }

    // Revoke role
    await revokeAdminRole(userId)

    return sendResponse(res, 200, true, `Admin access revoked for ${user.email}`, {
      user: {
        id: user.id,
        email: user.email,
        newRole: 'customer',
      },
      adminCount: await getAdminCount(),
      superAdminCount: await getSuperAdminCount(),
    })
  } catch (error: any) {
    console.error('Error revoking admin role:', error)

    if (error.message?.includes('Cannot revoke the last super_admin')) {
      return sendResponse(res, 409, false, error.message)
    }

    return sendResponse(res, 500, false, 'Failed to revoke admin access')
  }
})

/**
 * GET /admin/roles/current
 * Get current user's role and permissions
 */
router.get('/current', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendResponse(res, 401, false, 'Not authenticated')
    }

    const userResult = await db.query(
      `SELECT 
        id,
        first_name as firstName,
        last_name as lastName,
        email,
        role,
        is_active as isActive,
        created_at as createdAt
      FROM users WHERE id = ?`,
      [req.user.userId]
    )

    if (!userResult[0] || userResult[0].length === 0) {
      return sendResponse(res, 404, false, 'User not found')
    }

    const user = userResult[0][0]
    const isSuper = await isSuperAdmin(req.user.userId)
    const permissions = await getPermissions(req.user.userId)

    return sendResponse(res, 200, true, 'Current user role and permissions', {
      user,
      isSuperAdmin: isSuper,
      permissions,
    })
  } catch (error) {
    console.error('Error getting current user role:', error)
    return sendResponse(res, 500, false, 'Failed to retrieve user role')
  }
})

export default router
