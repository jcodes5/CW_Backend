import { connection as db } from '../config/database'
import type { UserPermissions, UserPermissionsRow } from '../types'

/**
 * Role & Permission Service
 * Handles role validation, permission checks, and role/permission management
 */

const SUPER_ADMIN_LIMIT = 1
const ADMIN_LIMIT = 5

/**
 * Validate that only one super_admin exists
 */
export async function validateSuperAdminCount(): Promise<boolean> {
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['super_admin'])
    const count = result[0][0]?.count || 0
    return count <= SUPER_ADMIN_LIMIT
  } catch (error) {
    console.error('Error validating super admin count:', error)
    throw error
  }
}

/**
 * Get current count of super_admin users
 */
export async function getSuperAdminCount(): Promise<number> {
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['super_admin'])
    return result[0][0]?.count || 0
  } catch (error) {
    console.error('Error getting super admin count:', error)
    throw error
  }
}

/**
 * Validate that admin count doesn't exceed limit
 */
export async function validateAdminCount(): Promise<boolean> {
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['admin'])
    const count = result[0][0]?.count || 0
    return count < ADMIN_LIMIT
  } catch (error) {
    console.error('Error validating admin count:', error)
    throw error
  }
}

/**
 * Get current count of admin users
 */
export async function getAdminCount(): Promise<number> {
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['admin'])
    return result[0][0]?.count || 0
  } catch (error) {
    console.error('Error getting admin count:', error)
    throw error
  }
}

/**
 * Get user permissions from database
 */
export async function getPermissions(userId: string): Promise<UserPermissions | null> {
  try {
    const result = await db.query(
      'SELECT * FROM user_permissions WHERE user_id = ?',
      [userId]
    )

    if (!result[0] || result[0].length === 0) {
      return null
    }

    const row = result[0][0] as UserPermissionsRow
    return {
      userId: row.user_id,
      canAddProducts: Boolean(row.can_add_products),
      canEditProducts: Boolean(row.can_edit_products),
      canViewStock: Boolean(row.can_view_stock),
      canManageTransactions: Boolean(row.can_manage_transactions),
      canManageOrders: Boolean(row.can_manage_orders),
      canManageUsers: Boolean(row.can_manage_users),
      canManageReviews: Boolean(row.can_manage_reviews),
      canManageCoupons: Boolean(row.can_manage_coupons),
      canManageDiy: Boolean(row.can_manage_diy),
      canManageHero: Boolean(row.can_manage_hero),
      isSuperAdminOverride: Boolean(row.is_super_admin_override),
    }
  } catch (error) {
    console.error('Error getting user permissions:', error)
    throw error
  }
}

/**
 * Check if user has specific permission
 */
export async function hasPermission(userId: string, permission: keyof Omit<UserPermissions, 'userId'>): Promise<boolean> {
  try {
    const perms = await getPermissions(userId)
    if (!perms) return false

    // If user has super_admin override, they have all permissions
    if (perms.isSuperAdminOverride) return true

    return perms[permission] || false
  } catch (error) {
    console.error('Error checking permission:', error)
    throw error
  }
}

/**
 * Assign a role to a user (converts existing role)
 * Validates constraints before assignment
 */
export async function assignRole(userId: string, newRole: 'super_admin' | 'admin' | 'customer' | 'vendor'): Promise<void> {
  try {
    // Validate constraints based on role being assigned
    if (newRole === 'super_admin') {
      // Check if super_admin already exists
      const superAdminCount = await getSuperAdminCount()
      if (superAdminCount >= SUPER_ADMIN_LIMIT) {
        throw new Error('Cannot create second super_admin. Only one super_admin is allowed.')
      }

      // Update user role
      await db.query('UPDATE users SET role = ? WHERE id = ?', [newRole, userId])

      // Initialize permissions with full access
      await initializeAdminPermissions(userId, true)
    } else if (newRole === 'admin') {
      // Check if admin limit is reached
      const adminCount = await getAdminCount()
      if (adminCount >= ADMIN_LIMIT) {
        throw new Error(`Cannot create more admins. Maximum of ${ADMIN_LIMIT} admins allowed.`)
      }

      // Update user role
      await db.query('UPDATE users SET role = ? WHERE id = ?', [newRole, userId])

      // Initialize permissions with restricted access
      await initializeAdminPermissions(userId, false)
    } else {
      // For customer or vendor, just update role
      await db.query('UPDATE users SET role = ? WHERE id = ?', [newRole, userId])

      // Delete permissions if not admin role
      if (newRole !== 'admin' && newRole !== 'super_admin') {
        await db.query('DELETE FROM user_permissions WHERE user_id = ?', [userId])
      }
    }
  } catch (error) {
    console.error('Error assigning role:', error)
    throw error
  }
}

/**
 * Initialize permissions for a user
 * isSuperAdmin=true gives full access, false gives restricted admin access
 */
export async function initializeAdminPermissions(userId: string, isSuperAdmin: boolean = false): Promise<void> {
  try {
    const permissions = {
      can_add_products: isSuperAdmin ? 1 : 1,
      can_edit_products: isSuperAdmin ? 1 : 1,
      can_view_stock: isSuperAdmin ? 1 : 1,
      can_manage_transactions: isSuperAdmin ? 1 : 0,
      can_manage_orders: isSuperAdmin ? 1 : 0,
      can_manage_users: isSuperAdmin ? 1 : 0,
      can_manage_reviews: isSuperAdmin ? 1 : 0,
      can_manage_coupons: isSuperAdmin ? 1 : 0,
      can_manage_diy: isSuperAdmin ? 1 : 0,
      can_manage_hero: isSuperAdmin ? 1 : 0,
      is_super_admin_override: isSuperAdmin ? 1 : 0,
    }

    await db.query(
      `INSERT INTO user_permissions (
        user_id,
        can_add_products,
        can_edit_products,
        can_view_stock,
        can_manage_transactions,
        can_manage_orders,
        can_manage_users,
        can_manage_reviews,
        can_manage_coupons,
        can_manage_diy,
        can_manage_hero,
        is_super_admin_override
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        can_add_products = VALUES(can_add_products),
        can_edit_products = VALUES(can_edit_products),
        can_view_stock = VALUES(can_view_stock),
        can_manage_transactions = VALUES(can_manage_transactions),
        can_manage_orders = VALUES(can_manage_orders),
        can_manage_users = VALUES(can_manage_users),
        can_manage_reviews = VALUES(can_manage_reviews),
        can_manage_coupons = VALUES(can_manage_coupons),
        can_manage_diy = VALUES(can_manage_diy),
        can_manage_hero = VALUES(can_manage_hero),
        is_super_admin_override = VALUES(is_super_admin_override)`,
      [
        userId,
        permissions.can_add_products,
        permissions.can_edit_products,
        permissions.can_view_stock,
        permissions.can_manage_transactions,
        permissions.can_manage_orders,
        permissions.can_manage_users,
        permissions.can_manage_reviews,
        permissions.can_manage_coupons,
        permissions.can_manage_diy,
        permissions.can_manage_hero,
        permissions.is_super_admin_override,
      ]
    )
  } catch (error) {
    console.error('Error initializing admin permissions:', error)
    throw error
  }
}

/**
 * Revoke admin role from a user (convert to customer)
 * Prevents revoking last super_admin
 */
export async function revokeAdminRole(userId: string): Promise<void> {
  try {
    // Get current user role
    const userResult = await db.query('SELECT role FROM users WHERE id = ?', [userId])
    if (!userResult[0] || userResult[0].length === 0) {
      throw new Error('User not found')
    }

    const currentRole = userResult[0][0].role

    // Prevent revoking last super_admin
    if (currentRole === 'super_admin') {
      const superAdminCount = await getSuperAdminCount()
      if (superAdminCount <= 1) {
        throw new Error('Cannot revoke the last super_admin. At least one super_admin must exist.')
      }
    }

    // Convert to customer
    await db.query('UPDATE users SET role = ? WHERE id = ?', ['customer', userId])

    // Delete permissions
    await db.query('DELETE FROM user_permissions WHERE user_id = ?', [userId])
  } catch (error) {
    console.error('Error revoking admin role:', error)
    throw error
  }
}

/**
 * Get all admin users (super_admin + admin)
 */
export async function getAllAdmins(): Promise<
  Array<{
    id: string
    firstName: string
    lastName: string
    email: string
    role: 'super_admin' | 'admin'
    isActive: number
    createdAt: string
  }>
> {
  try {
    const result = await db.query(
      `SELECT 
        id,
        first_name as firstName,
        last_name as lastName,
        email,
        role,
        is_active as isActive,
        created_at as createdAt
      FROM users 
      WHERE role IN ('super_admin', 'admin') 
      ORDER BY role DESC, created_at DESC`
    )

    if (!result[0]) return []

    return result[0].map((row: any) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt,
    }))
  } catch (error) {
    console.error('Error getting all admins:', error)
    throw error
  }
}

/**
 * Verify if user is super_admin
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  try {
    const result = await db.query('SELECT role FROM users WHERE id = ?', [userId])
    if (!result[0] || result[0].length === 0) return false
    return result[0][0].role === 'super_admin'
  } catch (error) {
    console.error('Error checking if user is super admin:', error)
    throw error
  }
}

/**
 * Verify if user is admin (either super_admin or admin)
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const result = await db.query('SELECT role FROM users WHERE id = ?', [userId])
    if (!result[0] || result[0].length === 0) return false
    const role = result[0][0].role
    return role === 'super_admin' || role === 'admin'
  } catch (error) {
    console.error('Error checking if user is admin:', error)
    throw error
  }
}
