import type { Request } from 'express'

// ── Auth / User ───────────────────────────────────────────────
export type UserRole = 'customer' | 'admin' | 'super_admin' | 'vendor'

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  avatar?: string
  role: UserRole
  isVerified: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface UserRow {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  password_hash: string | null
  avatar: string | null
  role: UserRole
  is_verified: number
  is_active: number
  provider: 'local' | 'google' | 'facebook'
  provider_id: string | null
  created_at: Date
  updated_at: Date
}

export interface JWTPayload {
  userId: string
  email: string
  role: UserRole
}

// ── Permissions ───────────────────────────────────────────────
export interface UserPermissions {
  userId: string
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

export interface UserPermissionsRow {
  user_id: string
  can_add_products: number
  can_edit_products: number
  can_view_stock: number
  can_manage_transactions: number
  can_manage_orders: number
  can_manage_users: number
  can_manage_reviews: number
  can_manage_coupons: number
  can_manage_diy: number
  can_manage_hero: number
  is_super_admin_override: number
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface RegisterBody {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
  phone?: string
}

export interface LoginBody {
  email: string
  password: string
}

export interface AuthRequest extends Request {
  user?: JWTPayload
  permissions?: UserPermissions
}

// ── Product ───────────────────────────────────────────────────
export type BrandId = 'craftworld' | 'adulawo' | 'planet3r'

export interface ProductRow {
  id: string
  name: string
  slug: string
  description: string
  price: number
  compare_price: number | null
  images: string          // JSON array of URLs
  specifications: string // JSON object of specifications
  category_id: string
  brand_id: BrandId
  stock: number
  tags: string            // JSON array
  rating: number
  review_count: number
  is_new: number
  is_featured: number
  is_active: number
  created_at: Date
  updated_at: Date
  // joined fields
  category_name?: string
  category_slug?: string
  category_icon?: string
  brand_name?: string
  brand_color?: string
  brand_accent_color?: string
}

export interface ProductFilters {
  brand?: BrandId
  category?: string
  search?: string
  minPrice?: number
  maxPrice?: number
  filter?: 'new' | 'bestsellers' | 'featured'
  sort?: 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'rating'
  page?: number
  limit?: number
}

export interface CategoryRow {
  id: string
  name: string
  slug: string
  icon: string
  description: string | null
  is_active: number
  sort_order: number
  created_at: Date
}

export interface BrandRow {
  id: BrandId
  name: string
  tagline: string
  description: string
  color: string
  accent_color: string
  logo: string | null
  website: string | null
  founded: string | null
  focus: string            // JSON array
  is_active: number
}

// ── Order ─────────────────────────────────────────────────────
export type OrderStatus =
  | 'pending'
  | 'payment_pending'
  | 'payment_failed'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

export interface OrderRow {
  [x: string]: any
  webhook_event_id: any
  id: string
  reference: string
  user_id: string
  status: OrderStatus
  subtotal: number
  delivery_fee: number
  discount: number
  total: number
  payment_method: string
  payment_channel: string | null
  paystack_ref: string | null
  shipping_address: string    // JSON
  notes: string | null
  created_at: Date
  updated_at: Date
  estimated_delivery: string | null
}

export interface OrderItemRow {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price: number
  total_price: number
  snapshot: string            // JSON product snapshot
  created_at: Date
}

// ── Address ───────────────────────────────────────────────────
export interface AddressRow {
  id: string
  user_id: string
  label: string
  first_name: string
  last_name: string
  email: string
  phone: string
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  postal_code: string | null
  country: string
  is_default: number
  delivery_notes: string | null
  created_at: Date
  updated_at: Date
}

// ── Review ────────────────────────────────────────────────────
export interface ReviewRow {
  id: string
  product_id: string
  user_id: string
  rating: number
  title: string | null
  body: string
  is_verified: number
  created_at: Date
}

// ── Refresh Token ─────────────────────────────────────────────
export interface RefreshTokenRow {
  id: string
  user_id: string
  token_hash: string
  expires_at: Date
  created_at: Date
  revoked_at: Date | null
}

// ── Paystack ─────────────────────────────────────────────────
export interface PaystackVerifyResponse {
  status: boolean
  message: string
  data: {
    id: number
    reference: string
    amount: number
    currency: string
    status: 'success' | 'failed' | 'abandoned'
    channel: string
    paid_at: string
    customer: {
      email: string
      first_name: string
      last_name: string
    }
    metadata?: {
      custom_fields?: Array<{
        display_name: string
        variable_name: string
        value: string
      }>
    }
  }
}

export interface PaystackInitializeResponse {
  status: boolean
  message: string
  data: {
    authorization_url: string
    access_code: string
    reference: string
  }
}

// ── Newsletter ────────────────────────────────────────────────
export interface NewsletterRow {
  id: string
  email: string
  is_active: number
  subscribed_at: Date
}

// ── API Response ──────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean
  message: string
  data?: T
  errors?: Record<string, string[]>
  pagination?: {
    page: number
    limit: number
    total: number
    pages: number
  }
}
