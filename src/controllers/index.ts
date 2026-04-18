/**
 * CraftworldCentre — Controllers
 * Each controller is a thin layer: validate request → call model/service → send response
 */

import type { Request, Response } from 'express'
import type { AuthRequest, JWTPayload } from '@/types'
import * as AuthModel    from '@/models/auth.model'
import * as ProductModel from '@/models/product.model'
import * as OrderModel   from '@/models/order.model'
import * as WalletModel  from '@/models/wallet.model'
import { query, queryOne, execute } from '@/config/database'
import { generateTokenPair, verifyRefreshToken } from '@/utils/jwt'
import { randomToken, getPagination } from '@/utils/crypto'
import {
  ok, created, paginated, badRequest, unauthorized,
  forbidden, notFound, conflict, serverError, noContent,
} from '@/utils/response'
import passport from '@/config/passport'
import {
  sendWelcomeEmail, sendPasswordResetEmail,
  sendOrderConfirmationEmail, sendOrderStatusEmail,
  sendNewsletterWelcomeEmail,
} from '@/services/email.service'
import { paystackService } from '@/services/paystack.service'
import { paymentService } from '@/services/payment.service'
import { cloudinaryService } from '@/services/cloudinary.service'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// Category color mapping
const CATEGORY_COLORS: Record<string, string> = {
  'home décor': '#1A7A8A',
  'home decor': '#1A7A8A',
  'fashion': '#8B6914',
  'furniture': '#3d6b2d',
  'accessories': '#6B4A8A',
  'stationery': '#4A6A8A',
  'jewelry': '#B8860B',
  'art': '#CD5C5C',
  'craft': '#20B2AA',
  'default': '#1A7A8A',
}

function getCategoryColor(category: string): string {
  const lower = category.toLowerCase()
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (lower.includes(key)) return color
  }
  return CATEGORY_COLORS.default
}

// ═══════════════════════════════════════════════════════════════
// AUTH CONTROLLERS
// ═══════════════════════════════════════════════════════════════

export const authController = {

  async register(req: Request, res: Response): Promise<void> {
    const { firstName, lastName, email, password, confirmPassword, phone } = req.body

    const existing = await AuthModel.findByEmail(email)
    if (existing) { conflict(res, 'An account with this email already exists'); return }

    const user   = await AuthModel.createUser({ firstName, lastName, email, password, confirmPassword, phone })
    const tokens = generateTokenPair({ userId: user.id, email: user.email, role: user.role })

    await AuthModel.storeRefreshToken(user.id, tokens.refreshToken)

    // Set HTTP-only refresh token cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    })

    // Send welcome email async (don't await)
    const verifyToken = (user as any).verify_token
    sendWelcomeEmail(user.email, user.first_name, verifyToken).catch(() => {})

    created(res, {
      user:        AuthModel.toUserDTO(user),
      accessToken: tokens.accessToken,
    }, 'Account created successfully. Please check your email to verify your account.')
  },

  async login(req: Request, res: Response): Promise<void> {
    const { email, password, rememberMe } = req.body

    const user = await AuthModel.findByEmail(email)
    if (!user) { unauthorized(res, 'Invalid email or password'); return }

    const valid = await AuthModel.verifyPassword(user, password)
    if (!valid)  { unauthorized(res, 'Invalid email or password'); return }

    if (!user.is_active) { forbidden(res, 'Account has been deactivated'); return }

    if (!user.is_verified) { unauthorized(res, 'Please verify your email before signing in. Check your inbox for a verification link.'); return }

    const refreshExpires = rememberMe ? '30d' : undefined
    const tokens = generateTokenPair({ userId: user.id, email: user.email, role: user.role }, refreshExpires)
    await AuthModel.storeRefreshToken(user.id, tokens.refreshToken)
    await AuthModel.updateLastLogin(user.id)

    const cookieMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: cookieMaxAge,
    })

    ok(res, {
      user:        AuthModel.toUserDTO(user),
      accessToken: tokens.accessToken,
    }, 'Login successful')
  },

  async logout(req: AuthRequest, res: Response): Promise<void> {
    const refreshToken = req.cookies?.refreshToken as string | undefined

    if (refreshToken) {
      const userId = await AuthModel.consumeRefreshToken(refreshToken)
      if (userId) await AuthModel.revokeAllTokens(userId)
    }

    res.clearCookie('refreshToken')
    ok(res, null, 'Logged out successfully')
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.refreshToken as string | undefined
    if (!token) { unauthorized(res, 'No refresh token'); return }

    let payload: JWTPayload
    try {
      payload = verifyRefreshToken(token)
    } catch {
      res.clearCookie('refreshToken')
      unauthorized(res, 'Invalid or expired refresh token')
      return
    }

    // Consume/rotate the refresh token in DB (revokes old token)
    const consumed = await AuthModel.consumeRefreshToken(token)
    if (!consumed) {
      res.clearCookie('refreshToken')
      unauthorized(res, 'Refresh token has been revoked')
      return
    }

    const userId = payload.userId
    const user = await AuthModel.findById(userId)
    if (!user) { unauthorized(res, 'User not found'); return }

    const tokens = generateTokenPair({ userId: user.id, email: user.email, role: user.role })
    await AuthModel.storeRefreshToken(user.id, tokens.refreshToken)

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    })

    ok(res, { accessToken: tokens.accessToken }, 'Token refreshed')
  },

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = req.body
    const user = await AuthModel.findByEmail(email)

    // Always return 200 — never reveal if email exists
    if (user) {
      const token = randomToken(32)
      await AuthModel.storeResetToken(user.id, token)
      sendPasswordResetEmail(user.email, user.first_name, token).catch(() => {})
    }

    ok(res, null, 'If that email exists, a reset link has been sent')
  },

  async resetPassword(req: Request, res: Response): Promise<void> {
    const { token, password } = req.body
    const user = await AuthModel.findByResetToken(token)
    if (!user) { badRequest(res, 'Invalid or expired reset token'); return }

    await AuthModel.resetPassword(user.id, password)
    res.clearCookie('refreshToken')
    ok(res, null, 'Password reset successfully. Please log in.')
  },

  // ── Email verification endpoints ────────────────────────────

  async verifyEmail(req: Request, res: Response): Promise<void> {
    const { token } = req.body
    if (!token) { badRequest(res, 'Verification token is required'); return }

    const user = await AuthModel.findByVerifyToken(token)
    if (!user) {
      // Return success to prevent enumeration, but don't verify
      ok(res, null, 'Email verification processed successfully.')
      return
    }

    await AuthModel.verifyUserEmail(user.id)
    ok(res, null, 'Email verified successfully! You can now log in.')
  },

  async resendVerification(req: Request, res: Response): Promise<void> {
    const { email } = req.body
    if (!email) { badRequest(res, 'Email is required'); return }

    const user = await AuthModel.findByEmail(email)
    if (!user) {
      // Always return success to prevent enumeration
      ok(res, null, 'If that email exists, a verification link has been sent.')
      return
    }

    if (user.is_verified) {
      ok(res, null, 'Account is already verified.')
      return
    }

    // Generate new token
    const verifyToken = randomToken(32)
    await AuthModel.storeVerifyToken(user.id, verifyToken)

    // Send verification email
    sendWelcomeEmail(user.email, user.first_name, verifyToken).catch(() => {})

    ok(res, null, 'Verification email sent successfully.')
  },

  async getMe(req: AuthRequest, res: Response): Promise<void> {
    const user = await AuthModel.findById(req.user!.userId)
    if (!user) { notFound(res, 'User not found'); return }
    ok(res, AuthModel.toUserDTO(user))
  },

  async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    const { firstName, lastName, phone } = req.body
    const user = await AuthModel.updateProfile(req.user!.userId, { firstName, lastName, phone })
    if (!user) { notFound(res, 'User not found'); return }
    ok(res, AuthModel.toUserDTO(user), 'Profile updated')
  },

  async changePassword(req: AuthRequest, res: Response): Promise<void> {
    const { currentPassword, newPassword } = req.body
    const user = await AuthModel.findById(req.user!.userId)
    if (!user) { notFound(res, 'User not found'); return }

    const valid = await AuthModel.verifyPassword(user, currentPassword)
    if (!valid) { badRequest(res, 'Current password is incorrect'); return }

    await AuthModel.updatePassword(user.id, newPassword)
    ok(res, null, 'Password changed successfully')
  },

  // ── OAuth Login Functions ─────────────────────────────────────

  async googleLogin(req: Request, res: Response): Promise<void> {
    // This will redirect to Google
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
    })(req, res)
  },

  async googleCallback(req: Request, res: Response): Promise<void> {
    passport.authenticate('google', { session: false }, async (err: any, user: any) => {
      if (err || !user) {
        const errorMsg = err?.message || 'Google authentication failed'
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
        return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(errorMsg)}`)
      }

      try {
        // Generate JWT tokens
        const tokens = generateTokenPair({
          userId: user.id,
          email: user.email,
          role: user.role
        })

        // Store refresh token
        await AuthModel.storeRefreshToken(user.id, tokens.refreshToken)

        // Set HTTP-only refresh token cookie
        res.cookie('refreshToken', tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        })

        // Redirect to frontend with access token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
        res.redirect(`${frontendUrl}/oauth/callback?token=${tokens.accessToken}`)
      } catch (error) {
        console.error('OAuth callback error:', error)
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
        res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('Authentication failed')}`)
      }
    })(req, res)
  },

  async facebookLogin(req: Request, res: Response): Promise<void> {
    passport.authenticate('facebook', {
      scope: ['email'],
      session: false,
    })(req, res)
  },

  async facebookCallback(req: Request, res: Response): Promise<void> {
    passport.authenticate('facebook', { session: false }, async (err: any, user: any) => {
      if (err || !user) {
        const errorMsg = err?.message || 'Facebook authentication failed'
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
        return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(errorMsg)}`)
      }

      try {
        // Generate JWT tokens
        const tokens = generateTokenPair({
          userId: user.id,
          email: user.email,
          role: user.role
        })

        // Store refresh token
        await AuthModel.storeRefreshToken(user.id, tokens.refreshToken)

        // Set HTTP-only refresh token cookie
        res.cookie('refreshToken', tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        })

        // Redirect to frontend with access token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
        res.redirect(`${frontendUrl}/oauth/callback?token=${tokens.accessToken}`)
      } catch (error) {
        console.error('OAuth callback error:', error)
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
        res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('Authentication failed')}`)
      }
    })(req, res)
  },
}

// ═══════════════════════════════════════════════════════════════
// PRODUCT CONTROLLERS
// ═══════════════════════════════════════════════════════════════

export const productController = {

  async list(req: Request, res: Response): Promise<void> {
    const { page, limit } = getPagination(req.query.page, req.query.limit)
    const filters = {
      brand:    req.query.brand    as string | undefined,
      category: req.query.category as string | undefined,
      search:   req.query.q        as string | undefined,
      filter:   req.query.filter   as string | undefined,
      sort:     req.query.sort     as string | undefined,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
      page, limit,
    }

    const { rows, total } = await ProductModel.listProducts(filters as Parameters<typeof ProductModel.listProducts>[0])
    paginated(res, rows.map(ProductModel.toProductDTO), total, page, limit)
  },

  async getBySlug(req: Request, res: Response): Promise<void> {
    const product = await ProductModel.findBySlug(req.params.slug as string)
    if (!product) { notFound(res, 'Product not found'); return }
    ok(res, ProductModel.toProductDTO(product))
  },

  async getFeatured(_req: Request, res: Response): Promise<void> {
    const products = await ProductModel.getFeatured(8)
    ok(res, products.map(ProductModel.toProductDTO))
  },

  async getNew(_req: Request, res: Response): Promise<void> {
    const products = await ProductModel.getNew(8)
    ok(res, products.map(ProductModel.toProductDTO))
  },

  async getRelated(req: Request, res: Response): Promise<void> {
    const product = await ProductModel.findBySlug(req.params.slug as string)
    if (!product) { notFound(res, 'Product not found'); return }
    const related = await ProductModel.getRelated(product.id, product.category_id, product.brand_id)
    ok(res, related.map(ProductModel.toProductDTO))
  },

  async getReviews(req: Request, res: Response): Promise<void> {
    const product = await ProductModel.findBySlug(req.params.slug as string)
    if (!product) { notFound(res, 'Product not found'); return }
    const { page, limit } = getPagination(req.query.page, req.query.limit, 20)
    const offset = (page - 1) * limit

    const [reviews, count] = await Promise.all([
      query(
        `SELECT r.*, u.first_name, u.last_name
         FROM product_reviews r
         JOIN users u ON u.id = r.user_id
         WHERE r.product_id = ?
         ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
        [product.id, limit, offset]
      ),
      query<{ total: number }>(
        'SELECT COUNT(*) AS total FROM product_reviews WHERE product_id = ?',
        [product.id]
      ),
    ])
    paginated(res, reviews, count[0]?.total ?? 0, page, limit)
  },

  async createReview(req: AuthRequest, res: Response): Promise<void> {
    const product = await ProductModel.findBySlug(req.params.slug as string)
    if (!product) { notFound(res, 'Product not found'); return }

    const { rating, title, body } = req.body
    const userId = req.user!.userId

    // Check if already reviewed
    const existing = await queryOne(
      'SELECT id FROM product_reviews WHERE product_id = ? AND user_id = ?',
      [product.id, userId]
    )
    if (existing) { conflict(res, 'You have already reviewed this product'); return }

    // Verify user has purchased this product (order must be confirmed/delivered)
    const hasPurchased = await queryOne(
      `SELECT oi.id FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.product_id = ? AND o.user_id = ?
       AND o.status IN ('confirmed', 'processing', 'shipped', 'delivered')
       LIMIT 1`,
      [product.id, userId]
    )
    if (!hasPurchased) {
      forbidden(res, 'You must purchase this product to review it')
      return
    }

    const id = uuidv4()
    await execute(
      `INSERT INTO product_reviews (id, product_id, user_id, rating, title, body)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, product.id, userId, rating, title ?? null, body]
    )

    await ProductModel.recalculateRating(product.id)
    created(res, { id }, 'Review submitted')
  },
}

// ═══════════════════════════════════════════════════════════════
// ORDER CONTROLLERS
// ═══════════════════════════════════════════════════════════════

export const orderController = {

  async create(req: AuthRequest, res: Response): Promise<void> {
    const { items, shippingAddress, notes } = req.body

    let order: import('@/types').OrderRow
    try {
      order = await OrderModel.createOrder({
        userId: req.user!.userId,
        items,
        shippingAddress,
        notes,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Order creation failed'
      badRequest(res, message)
      return
    }

    created(res, OrderModel.toOrderDTO(order), 'Order created')
  },

  async listMine(req: AuthRequest, res: Response): Promise<void> {
    const { page, limit } = getPagination(req.query.page, req.query.limit, 10)
    const { rows, total } = await OrderModel.listUserOrders(req.user!.userId, page, limit)
    paginated(res, rows.map(OrderModel.toOrderDTO), total, page, limit)
  },

  async getOne(req: AuthRequest, res: Response): Promise<void> {
    const order = await OrderModel.getOrderWithItems(req.params.reference as string)
    if (!order) { notFound(res, 'Order not found'); return }

    // Non-admins can only see their own orders
    if (req.user!.role !== 'admin' && order.user_id !== req.user!.userId) {
      forbidden(res)
      return
    }

    const dto = {
      ...OrderModel.toOrderDTO(order),
      items: order.items.map((i) => ({
        id:         i.id,
        quantity:   i.quantity,
        unitPrice:  Number(i.unit_price),
        totalPrice: Number(i.total_price),
        product:    i.product,
      })),
    }
    ok(res, dto)
  },

  async cancel(req: AuthRequest, res: Response): Promise<void> {
    const order = await OrderModel.findByReference(req.params.reference as string)
    if (!order) { notFound(res, 'Order not found'); return }
    if (order.user_id !== req.user!.userId) { forbidden(res); return }

    const cancelled = await OrderModel.cancelOrder(order.id, req.user!.userId)
    if (!cancelled) { badRequest(res, 'This order cannot be cancelled'); return }

    ok(res, null, 'Order cancelled successfully')
  },
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT CONTROLLERS
// ═══════════════════════════════════════════════════════════════

interface InitializePaymentRequest {
  items: Array<{ productId: string; quantity: number }>
  shippingAddress: Record<string, unknown>
  notes?: string
  couponCode?: string
  paymentMethod?: 'paystack' | 'wallet'
}

interface PaystackWebhookEvent {
  event: string
  data: {
    id: number
    reference: string
    amount: number
    currency: string
    status: 'success' | 'failed' | 'abandoned'
    channel: string
    customer: {
      email: string
      first_name: string
      last_name: string
    }
    metadata?: Record<string, unknown>
  }
}

export const paymentController = {

  /**
   * Initialize payment - creates order AND Paystack transaction
   * 
   * SECURITY:
   * - Amount is calculated on backend (not trusting frontend)
   * - Reference is generated on backend
   * - Metadata includes order ID for verification
   */
  async initialize(req: AuthRequest, res: Response): Promise<void> {
    const userId = req.user?.userId
    if (!userId) {
      unauthorized(res, 'Authentication required')
      return
    }

    const { items, shippingAddress, notes, couponCode, paymentMethod = 'paystack' } = req.body as InitializePaymentRequest

    if (!items || !Array.isArray(items) || items.length === 0) {
      badRequest(res, 'Order items are required')
      return
    }

    if (!shippingAddress || !shippingAddress.email) {
      badRequest(res, 'Shipping address with email is required')
      return
    }

    try {
      // 1. Create order - backend calculates amounts
      // For Paystack, don't deduct stock yet - wait for payment confirmation
      const deductStock = paymentMethod === 'wallet'
      const order = await OrderModel.createOrder({
        userId,
        items,
        shippingAddress,
        notes,
        couponCode,
        deductStock,
      })

      // 2. Get user for email
      const user = await AuthModel.findById(userId)
      if (!user) {
        await OrderModel.updateStatus(order.id, 'cancelled', 'User not found')
        badRequest(res, 'User not found')
        return
      }

      // 3. Handle wallet payment
      if (paymentMethod === 'wallet') {
        const wallet = await WalletModel.getOrCreateWallet(userId)
        
        if (wallet.balance < Number(order.total)) {
          await OrderModel.updateStatus(order.id, 'cancelled', 'Insufficient wallet balance')
          badRequest(res, 'Insufficient wallet balance. Please add funds or use another payment method.')
          return
        }

        // Deduct from wallet
        await WalletModel.deductFunds(
          userId,
          Number(order.total),
          order.reference,
          `Payment for order ${order.reference}`,
          { orderId: order.id, orderReference: order.reference }
        )

        // Update order status to confirmed
        await OrderModel.updateStatus(order.id, 'confirmed', 'Paid via wallet')
        
        // Update payment method in order
        await execute(
          'UPDATE orders SET payment_method = ? WHERE id = ?',
          ['wallet', order.id]
        )

        logger.info(`Wallet payment for order ${order.reference}: ${order.total} Naira`)

        // Get the updated order from database
        const updatedOrder = await OrderModel.findById(order.id)
        if (!updatedOrder) {
          notFound(res, 'Order not found')
          return
        }

        ok(res, {
          order: OrderModel.toOrderDTO(updatedOrder),
          payment: {
            method: 'wallet',
            reference: order.reference,
          },
        }, 'Order placed successfully via wallet')
        return
      }

      // 4. Calculate amount (Paystack uses kobo)
      const amountInKobo = Math.round(Number(order.total) * 100)

      // 5. Initialize payment with secure metadata
      const customerEmail = (shippingAddress.email as string) ?? user.email
      const payment = await paymentService.initializePayment({
        email: customerEmail,
        amount: amountInKobo,
        reference: order.reference,
        metadata: {
          orderId: order.id,
          orderReference: order.reference,
          userId: userId,
          customerName: `${shippingAddress.firstName ?? ''} ${shippingAddress.lastName ?? ''}`.trim(),
          phone: shippingAddress.phone ?? '',
        },
        callbackUrl: `${process.env.FRONTEND_URL}/order-confirmation?reference=${order.reference}`,
      })

      logger.info(`Payment initialized for order ${order.reference}: ${amountInKobo} (paystack)`)

      // Return order details and payment authorization URL
      ok(res, {
        order: OrderModel.toOrderDTO(order),
        payment: {
          authorizationUrl: payment.authorizationUrl,
          reference: payment.reference,
        },
      }, 'Payment initialized successfully')
    } catch (err) {
      logger.error('Payment initialization error:', err)
      badRequest(res, err instanceof Error ? err.message : 'Failed to initialize payment')
    }
  },

  /**
   * Verify payment - POLLING ENDPOINT (read-only)
   * 
   * NO LONGER a source of truth. Webhook is the authority.
   * Frontend uses this to poll for webhook confirmation.
   * 
   * FLOW:
   * 1. Frontend polls this endpoint repeatedly
   * 2. Endpoint returns current order status from DB
   * 3. When webhook processes, status changes to 'confirmed'
   * 4. Frontend detects status change and stops polling
   * 
   * SECURITY:
   * - Only returns info about caller's own orders
   * - No state mutations (read-only)
   * - Tolerant of any payment method
   */
  async verify(req: AuthRequest, res: Response): Promise<void> {
    const { reference } = req.body
    if (!reference) { badRequest(res, 'Payment reference is required'); return }

    // Extract reference (handle format: prefix:reference if present)
    const paymentRef = reference.split(':').pop() ?? reference

    // Find the order
    const order = await OrderModel.findByReference(paymentRef)
    if (!order) { notFound(res, 'Order not found for this payment reference'); return }

    // SECURITY: Verify this user owns this order
    if (order.user_id !== req.user?.userId) {
      forbidden(res, 'You do not have access to this order')
      return
    }

    // Just return current status (webhook is the source of truth)
    const fullOrderWithItems = await OrderModel.getOrderWithItems(paymentRef)
    
    // Response indicates current state
    const isConfirmed = order.status === 'confirmed'
    const isPending = order.status === 'payment_pending'

    ok(res, {
      reference: order.reference,
      status: order.status,
      paymentConfirmed: isConfirmed,
      webhookProcessed: !!order.webhook_processed_at,
      webhookEventId: order.webhook_event_id ?? undefined,
      order: fullOrderWithItems ? OrderModel.toOrderDTO(fullOrderWithItems) : OrderModel.toOrderDTO(order),
    }, 
    isConfirmed ? 'Payment confirmed' :
    isPending ? 'Payment pending - webhook processing' :
    'Payment status: ' + order.status
    )
  },

  /**
   * Admin: Manually confirm payment
   * 
   * ADMIN ONLY - Use for:
   * - Failed webhook retries
   * - Manual verification scenarios
   * - Override suspicious transactions
   */
  async adminConfirmPayment(req: AuthRequest, res: Response): Promise<void> {
    const { reference, channel, notes } = req.body
    
    if (!reference) {
      badRequest(res, 'Payment reference is required')
      return
    }

    try {
      const { manuallyConfirmPayment } = await import('@/services/payment-retry.service')
      const result = await manuallyConfirmPayment(reference, channel || 'manual_override', notes)

      if (result.success) {
        logger.info(`Admin manually confirmed payment: ${reference}`)
        ok(res, result.order, result.message)
      } else {
        badRequest(res, result.message)
      }
    } catch (err) {
      logger.error('Admin payment confirmation error:', err)
      serverError(res, `Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  },

  /**
   * Admin: Get payment diagnostics
   * 
   * Returns detailed payment information for debugging
   */
  async adminGetDiagnostics(req: AuthRequest, res: Response): Promise<void> {
    const { reference } = req.params
    
    // Ensure reference is a string, not an array
    const referenceStr = Array.isArray(reference) ? reference[0] : reference

    try {
      const { getPaymentDiagnostics } = await import('@/services/payment-retry.service')
      const diagnostics = await getPaymentDiagnostics(referenceStr)
      ok(res, diagnostics, 'Diagnostics retrieved')
    } catch (err) {
      notFound(res, err instanceof Error ? err.message : 'Diagnostics not found')
    }
  },

  /**
   * Webhook - SOURCE OF TRUTH for payment status
   * 
   * CRITICAL: This endpoint is the authoritative source of truth.
   * Even if frontend fails, payment still gets confirmed here.
   * 
   * SECURITY:
   * - Validates webhook signature (cryptographic proof from Paystack)
   * - Idempotent: uses webhook_event_id to prevent duplicates
   * - Validates amount and email server-side
   * - Works even if user closes browser
   * 
   * FLOW:
   * 1. Paystack sends webhook event
   * 2. We validate signature + webhook event_id uniqueness
   * 3. Order confirmed regardless of frontend state
   * 4. Socket.io notifies frontend in real-time
   */
  async webhook(req: Request, res: Response): Promise<void> {
    const webhookHeaderName = 'x-paystack-signature'
    const signature = req.headers[webhookHeaderName] as string
    const rawBody = req.body as Buffer

    // SECURITY: Validate webhook signature (Paystack)
    const isValid = paystackService.validateWebhookSignature(rawBody, signature)
    if (!isValid) {
      logger.warn('Invalid Paystack webhook signature - rejecting webhook')
      res.status(401).json({ message: 'Invalid signature' })
      return
    }

    let event: PaystackWebhookEvent
    try {
      event = JSON.parse(rawBody.toString()) as PaystackWebhookEvent
    } catch (err) {
      logger.error('Failed to parse webhook payload:', err)
      res.status(400).json({ message: 'Invalid payload' })
      return
    }

    const { reference, amount, status, channel, customer, metadata, id: eventId } = event.data
    const paymentRef = reference.split(':').pop() ?? reference
    const webhookEventId = (eventId ?? '').toString() // Paystack event ID for dedup

    logger.info(`Webhook received: ${event.event} | ref: ${paymentRef} | status: ${status} | eventId: ${webhookEventId}`)

    // ─────────────────────────────────────────────────────────────
    // Handle wallet deposit (prefix: WALLET-)
    // ─────────────────────────────────────────────────────────────
    if (paymentRef.startsWith('WALLET-')) {
      if (event.event === 'charge.success') {
        const walletMetadata = metadata as { userId?: string } | undefined
        if (walletMetadata?.userId) {
          const amountInNaira = amount / 100
          await WalletModel.addFunds(
            walletMetadata.userId,
            amountInNaira,
            paymentRef,
            'Wallet deposit via Paystack webhook',
            { paystack_data: event.data }
          )
          logger.info(`✓ Wallet deposit confirmed: ${paymentRef} | amount: ${amountInNaira} Naira`)
        }
      }
      res.status(200).json({ received: true, message: 'Wallet transaction processed' })
      return
    }

    // ─────────────────────────────────────────────────────────────
    // Handle order payment (charge.success event)
    // ─────────────────────────────────────────────────────────────
    if (event.event === 'charge.success') {
      // 1. Find order by reference
      const order = await OrderModel.findByReference(paymentRef)
      if (!order) {
        logger.warn(`Order not found for reference: ${paymentRef}`)
        // Respond 200 to Paystack (don't retry), but we can't process
        res.status(200).json({ received: true, message: 'Order not found' })
        return
      }

      // 2. DEDUPLICATION: Check if we already processed this webhook event
      if (webhookEventId && order.webhook_event_id === webhookEventId) {
        logger.info(`✓ Duplicate webhook event ${webhookEventId} for ${paymentRef} - ignoring`)
        res.status(200).json({ received: true, message: 'Duplicate event - already processed' })
        return
      }

      // 3. IDEMPOTENCY: Check if order already confirmed (fail-safe)
      if (order.status === 'confirmed') {
        logger.info(`✓ Order ${paymentRef} already confirmed (status=confirmed) - idempotent response`)
        res.status(200).json({ received: true, message: 'Already confirmed - idempotent' })
        return
      }

      // 4. SECURITY: Validate amount matches (in kobo)
      const expectedAmountKobo = Math.round(Number(order.total) * 100)
      if (amount !== expectedAmountKobo) {
        logger.error(`SECURITY: Amount mismatch for ${paymentRef}`)
        logger.error(`  Expected: ${expectedAmountKobo} kobo (${expectedAmountKobo / 100} Naira)`)
        logger.error(`  Received: ${amount} kobo (${amount / 100} Naira)`)
        await OrderModel.updateStatus(order.id, 'payment_failed', 
          `Webhook amount mismatch: expected ${expectedAmountKobo}, got ${amount}`)
        res.status(200).json({ received: true, message: 'Amount mismatch detected' })
        return
      }

      // 5. SECURITY: Validate email matches
      let orderEmail = ''
      try {
        const addr = JSON.parse(order.shipping_address)
        orderEmail = (addr.email as string)?.toLowerCase() ?? ''
      } catch { /**/ }

      if (!orderEmail) {
        const user = await AuthModel.findById(order.user_id)
        orderEmail = user?.email.toLowerCase() ?? ''
      }

      const customerEmail = customer?.email?.toLowerCase()
      if (customerEmail && customerEmail !== orderEmail) {
        logger.error(`SECURITY: Email mismatch for ${paymentRef}`)
        logger.error(`  Expected: ${orderEmail}`)
        logger.error(`  Received: ${customerEmail}`)
        await OrderModel.updateStatus(order.id, 'payment_failed', 
          `Webhook email mismatch: expected ${orderEmail}, got ${customerEmail}`)
        res.status(200).json({ received: true, message: 'Email mismatch detected' })
        return
      }

      // 6. PROCESS: Confirm payment (source of truth)
      try {
        await OrderModel.confirmPayment(order.id, paymentRef, channel)
        
        // Store webhook event ID and processed timestamp for traceability
        await execute(
          'UPDATE orders SET webhook_event_id = ?, webhook_processed_at = ? WHERE id = ?',
          [webhookEventId || null, new Date(), order.id]
        )

        logger.info(`✓ Payment CONFIRMED via webhook for order ${paymentRef}`)

        // 7. EMIT: Socket.io event for real-time frontend update
        req.app.get('io')?.emit('order:confirmed', {
          orderId: order.id,
          reference: paymentRef,
          timestamp: new Date().toISOString(),
        })

        // 8. async: Send confirmation email (non-blocking)
        const orderWithItems = await OrderModel.getOrderWithItems(order.reference)
        const user = await AuthModel.findById(order.user_id)
        if (user && orderWithItems) {
          const emailItems = orderWithItems.items.map((i) => ({
            name:     i.product.name,
            quantity: i.quantity,
            price:    i.product.price,
          }))
          sendOrderConfirmationEmail(
            user.email, user.first_name,
            order.reference, emailItems,
            Number(order.total), Number(order.delivery_fee),
            (() => {
              try {
                const addr = JSON.parse(order.shipping_address)
                return [addr.address_line1, addr.city, addr.state, addr.country].filter(Boolean).join(', ')
              } catch { return '' }
            })()
          ).catch((err) => {
            logger.error(`Failed to send order confirmation email: ${err}`)
          })
        }

        // Deduct stock for Paystack orders (wallet orders already had stock deducted)
        if (order.payment_method !== 'wallet') {
          try {
            await OrderModel.deductStockForOrder(order.id)
            logger.info(`✓ Stock deducted for order ${paymentRef}`)
          } catch (err) {
            logger.error(`Failed to deduct stock for order ${paymentRef}:`, err)
          }
        }

      } catch (processError) {
        logger.error(`Failed to process webhook for ${paymentRef}:`, processError)
        await OrderModel.updateStatus(order.id, 'payment_failed', 
          `Webhook processing error: ${processError instanceof Error ? processError.message : 'Unknown error'}`)
        res.status(200).json({ received: true, message: 'Processing error' })
        return
      }
    }

    // ─────────────────────────────────────────────────────────────
    // Handle charge.failed event
    // ─────────────────────────────────────────────────────────────
    if (event.event === 'charge.failed') {
      const order = await OrderModel.findByReference(paymentRef)
      if (order && order.status === 'payment_pending') {
        await OrderModel.updateStatus(order.id, 'payment_failed', 
          `Payment failed via webhook: ${status}`)
        logger.info(`✓ Payment failed for order ${paymentRef} (via webhook)`)

        // Emit socket event
        req.app.get('io')?.emit('order:payment-failed', {
          orderId: order.id,
          reference: paymentRef,
          reason: status,
        })
      }
    }

    // Always respond 200 to Paystack (receipt acknowledgment)
    res.status(200).json({ received: true, message: 'Webhook processed' })
  },
}

// ═══════════════════════════════════════════════════════════════
// ADDRESS CONTROLLERS
// ═══════════════════════════════════════════════════════════════

export const addressController = {

  async list(req: AuthRequest, res: Response): Promise<void> {
    const rows = await query(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at ASC',
      [req.user!.userId]
    )
    ok(res, rows)
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const id     = uuidv4()
    const userId = req.user!.userId
    const {
      label, firstName, lastName, email, phone, addressLine1,
      addressLine2, city, state, postalCode, country, isDefault, deliveryNotes,
    } = req.body

    // If setting as default, unset others first
    if (isDefault) {
      await execute('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId])
    }

    // First address is always default
    const [count] = await query<{ c: number }>(
      'SELECT COUNT(*) AS c FROM addresses WHERE user_id = ?', [userId]
    )
    const shouldBeDefault = isDefault || (count?.c ?? 0) === 0

    await execute(
      `INSERT INTO addresses
       (id, user_id, label, first_name, last_name, email, phone,
        address_line1, address_line2, city, state, postal_code, country,
        is_default, delivery_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, userId, label ?? 'Home', firstName, lastName, email, phone,
        addressLine1, addressLine2 ?? null, city, state, postalCode ?? null,
        country ?? 'Nigeria', shouldBeDefault ? 1 : 0, deliveryNotes ?? null,
      ]
    )

    const address = await queryOne('SELECT * FROM addresses WHERE id = ?', [id])
    created(res, address, 'Address saved')
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params
    const addr   = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM addresses WHERE id = ?', [id]
    )
    if (!addr || addr.user_id !== req.user!.userId) { notFound(res, 'Address not found'); return }

    const {
      label, firstName, lastName, email, phone, addressLine1,
      addressLine2, city, state, postalCode, country, isDefault, deliveryNotes,
    } = req.body

    if (isDefault) {
      await execute('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [req.user!.userId])
    }

    await execute(
      `UPDATE addresses SET
       label = COALESCE(?, label), first_name = COALESCE(?, first_name),
       last_name = COALESCE(?, last_name), email = COALESCE(?, email),
       phone = COALESCE(?, phone), address_line1 = COALESCE(?, address_line1),
       address_line2 = ?, city = COALESCE(?, city), state = COALESCE(?, state),
       postal_code = ?, country = COALESCE(?, country),
       is_default = COALESCE(?, is_default), delivery_notes = ?
       WHERE id = ? AND user_id = ?`,
      [
        label ?? null, firstName ?? null, lastName ?? null, email ?? null, phone ?? null,
        addressLine1 ?? null, addressLine2 ?? null, city ?? null, state ?? null,
        postalCode ?? null, country ?? null, isDefault != null ? (isDefault ? 1 : 0) : null,
        deliveryNotes ?? null, id, req.user!.userId,
      ]
    )

    const updated = await queryOne('SELECT * FROM addresses WHERE id = ?', [id])
    ok(res, updated, 'Address updated')
  },

  async delete(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params
    const result = await execute(
      'DELETE FROM addresses WHERE id = ? AND user_id = ?',
      [id, req.user!.userId]
    )
    if (result.affectedRows === 0) { notFound(res, 'Address not found'); return }
    noContent(res)
  },

  async setDefault(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params
    const addr = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM addresses WHERE id = ?', [id]
    )
    if (!addr || addr.user_id !== req.user!.userId) { notFound(res, 'Address not found'); return }

    await execute('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [req.user!.userId])
    await execute('UPDATE addresses SET is_default = 1 WHERE id = ?', [id])
    ok(res, null, 'Default address updated')
  },
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY & BRAND CONTROLLERS
// ═══════════════════════════════════════════════════════════════

export const categoryController = {
  async list(_req: Request, res: Response): Promise<void> {
    const rows = await query(
      `SELECT c.*, COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       WHERE c.is_active = 1
       GROUP BY c.id
       ORDER BY c.sort_order, c.name`
    )
    ok(res, rows)
  },
}

export const brandController = {
  async list(_req: Request, res: Response): Promise<void> {
    const rows = await query<Record<string, unknown>>(
      `SELECT b.*, COUNT(p.id) AS product_count
       FROM brands b
       LEFT JOIN products p ON p.brand_id = b.id AND p.is_active = 1
       WHERE b.is_active = 1
       GROUP BY b.id`,
    )
    ok(res, rows.map((b) => {
      let focus = b.focus
      if (typeof focus === 'string') {
        try {
          focus = JSON.parse(focus)
        } catch {
          // If JSON parsing fails, keep the original string value
          focus = b.focus
        }
      }
      return { ...b, focus }
    }))
  },

  async getProducts(req: Request, res: Response): Promise<void> {
    const { page, limit } = getPagination(req.query.page, req.query.limit)
    const { rows, total } = await ProductModel.listProducts({
      brand: req.params.id as Parameters<typeof ProductModel.listProducts>[0]['brand'],
      page, limit,
    })
    paginated(res, rows.map(ProductModel.toProductDTO), total, page, limit)
  },
}

// ═══════════════════════════════════════════════════════════════
// NEWSLETTER CONTROLLER
// ═══════════════════════════════════════════════════════════════

export const newsletterController = {
  async subscribe(req: Request, res: Response): Promise<void> {
    const { email } = req.body
    const existing  = await queryOne<{ is_active: number }>(
      'SELECT is_active FROM newsletter_subscribers WHERE email = ?', [email]
    )

    if (existing) {
      if (existing.is_active === 1) { ok(res, null, 'Already subscribed'); return }
      await execute(
        'UPDATE newsletter_subscribers SET is_active = 1, unsubscribed_at = NULL WHERE email = ?',
        [email]
      )
    } else {
      await execute(
        'INSERT INTO newsletter_subscribers (id, email) VALUES (?, ?)',
        [uuidv4(), email]
      )
    }

    sendNewsletterWelcomeEmail(email).catch(() => {})
    ok(res, null, 'Subscribed successfully')
  },

  async unsubscribe(req: Request, res: Response): Promise<void> {
    const { email } = req.query as { email: string }
    await execute(
      `UPDATE newsletter_subscribers
       SET is_active = 0, unsubscribed_at = NOW()
       WHERE email = ?`,
      [email]
    )
    ok(res, null, 'Unsubscribed successfully')
  },
}

// ═══════════════════════════════════════════════════════════════
// ADMIN CONTROLLERS
// ═══════════════════════════════════════════════════════════════

export const adminController = {

  // Dashboard stats
  async getDashboard(_req: Request, res: Response): Promise<void> {
    const [
      ordersToday, totalRevenue, newUsers, lowStock, recentOrders, topProducts,
    ] = await Promise.all([
      query<{ count: number; revenue: number }>(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue
         FROM orders WHERE DATE(created_at) = CURDATE() AND status NOT IN ('cancelled','refunded')`
      ),
      query<{ total: number; count: number }>(
        `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
         FROM orders WHERE status IN ('confirmed','processing','shipped','delivered')`
      ),
      query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM users
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND role = 'customer'`
      ),
      query<{ count: number }>(
        'SELECT COUNT(*) AS count FROM products WHERE stock <= 5 AND is_active = 1'
      ),
      query(
        `SELECT o.*, u.first_name, u.last_name, u.email
         FROM orders o JOIN users u ON u.id = o.user_id
         ORDER BY o.created_at DESC LIMIT 10`
      ),
      query<{
        id: string;
        name: string;
        price: number;
        stock: number;
        rating: number;
        review_count: number;
        units_sold: number;
        images: string;
        category: string | null;
        brand: string | null;
      }>(
        `SELECT p.id, p.name, p.price, p.stock, p.rating, p.review_count, p.images,
                COALESCE(SUM(oi.quantity), 0) AS units_sold,
                c.name AS category, b.name AS brand
         FROM products p
         LEFT JOIN order_items oi ON oi.product_id = p.id
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN brands b ON p.brand_id = b.id
         WHERE p.is_active = 1
         GROUP BY p.id
         ORDER BY units_sold DESC LIMIT 5`
      ),
    ])

    ok(res, {
      today:        { orders: ordersToday[0]?.count ?? 0, revenue: ordersToday[0]?.revenue ?? 0 },
      allTime:      { orders: totalRevenue[0]?.count ?? 0, revenue: totalRevenue[0]?.total ?? 0 },
      newUsersWeek: newUsers[0]?.count ?? 0,
      lowStockCount: lowStock[0]?.count ?? 0,
      recentOrders,
      topProducts,
    })
  },

  // Analytics - comprehensive data for charts
  async getAnalytics(_req: Request, res: Response): Promise<void> {
    const [
      // Revenue by month (last 7 months)
      monthlyRevenue,
      // Revenue by brand (last 7 months)
      brandRevenue,
      // Orders by week (last 8 weeks)
      weeklyOrders,
      // Sales by category
      categorySales,
      // This month vs last month
      thisMonthRevenue,
      lastMonthRevenue,
      // Conversion rate (orders / unique visitors - we'll use users as proxy)
      totalUsers,
      totalOrders,
      // Top products with units sold
      topProducts,
    ] = await Promise.all([
      // Monthly revenue (last 7 months)
      query<{ month: string; revenue: number }>(
        `SELECT DATE_FORMAT(created_at, '%b') AS month, COALESCE(SUM(total), 0) AS revenue
         FROM orders
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 MONTH)
           AND status NOT IN ('cancelled', 'refunded')
         GROUP BY DATE_FORMAT(created_at, '%Y-%m'), DATE_FORMAT(created_at, '%b')
         ORDER BY MIN(created_at) ASC`
      ),
      // Revenue by brand (last 7 months)
      query<{ month: string; brand: string; revenue: number }>(
        `SELECT DATE_FORMAT(o.created_at, '%b') AS month, b.name AS brand,
                COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         JOIN products p ON oi.product_id = p.id
         JOIN brands b ON p.brand_id = b.id
         WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 MONTH)
           AND o.status NOT IN ('cancelled', 'refunded')
         GROUP BY DATE_FORMAT(o.created_at, '%Y-%m'), DATE_FORMAT(o.created_at, '%b'), b.name
         ORDER BY MIN(o.created_at) ASC, b.name`
      ),
      // Weekly orders (last 8 weeks)
      query<{ week: string; orders: number }>(
        `SELECT CONCAT('W', WEEK(created_at) - WEEK(DATE_SUB(created_at, INTERVAL 4 MONTH)) + 1) AS week,
                COUNT(*) AS orders
         FROM orders
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK)
           AND status NOT IN ('cancelled', 'refunded')
         GROUP BY YEARWEEK(created_at), CONCAT('W', WEEK(created_at) - WEEK(DATE_SUB(created_at, INTERVAL 4 MONTH)) + 1)
         ORDER BY MIN(created_at) ASC`
      ),
      // Sales by category
      query<{ category: string; value: number }>(
        `SELECT c.name AS category, COALESCE(SUM(oi.quantity), 0) AS value
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         JOIN categories c ON p.category_id = c.id
         JOIN orders o ON oi.order_id = o.id
         WHERE o.status NOT IN ('cancelled', 'refunded')
         GROUP BY c.id, c.name
         ORDER BY value DESC`
      ),
      // This month revenue
      query<{ revenue: number; orders: number }>(
        `SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders
         FROM orders
         WHERE MONTH(created_at) = MONTH(CURDATE())
           AND YEAR(created_at) = YEAR(CURDATE())
           AND status NOT IN ('cancelled', 'refunded')`
      ),
      // Last month revenue
      query<{ revenue: number; orders: number }>(
        `SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders
         FROM orders
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
           AND created_at < DATE_SUB(CURDATE(), INTERVAL 0 MONTH)
           AND status NOT IN ('cancelled', 'refunded')`
      ),
      // Total users for conversion
      query<{ count: number }>('SELECT COUNT(*) AS count FROM users WHERE role = \'customer\''),
      // Total orders for conversion
      query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM orders WHERE status NOT IN ('cancelled', 'refunded')`
      ),
      // Top products with units sold
      query<{
        id: string;
        name: string;
        price: number;
        images: string;
        rating: number;
        units_sold: number;
        category: string | null;
        brand: string | null;
      }>(
        `SELECT p.id, p.name, p.price, p.images, p.rating,
                COALESCE(SUM(oi.quantity), 0) AS units_sold,
                c.name AS category, b.name AS brand
         FROM products p
         LEFT JOIN order_items oi ON oi.product_id = p.id
         LEFT JOIN orders o ON oi.order_id = o.id AND o.status NOT IN ('cancelled', 'refunded')
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN brands b ON p.brand_id = b.id
         WHERE p.is_active = 1
         GROUP BY p.id
         ORDER BY units_sold DESC
         LIMIT 10`
      ),
    ])

    // Calculate percentage change
    const thisMonth = thisMonthRevenue[0]?.revenue ?? 0
    const lastMonth = lastMonthRevenue[0]?.revenue ?? 0
    const percentChange = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0

    // Calculate conversion rate (orders / users)
    const totalUsersCount = totalUsers[0]?.count ?? 1
    const totalOrdersCount = totalOrders[0]?.count ?? 0
    const conversionRate = totalUsersCount > 0 ? (totalOrdersCount / totalUsersCount) * 100 : 0

    // Format monthly revenue for chart (map to month names)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthlyDataMap = new Map<string, number>()
    monthlyRevenue.forEach((row) => {
      monthlyDataMap.set(row.month, row.revenue)
    })
    
    // Get last 7 months
    const now = new Date()
    const last7Months: { month: string; revenue: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const m = monthNames[d.getMonth()]
      last7Months.push({ month: m, revenue: monthlyDataMap.get(m) ?? 0 })
    }

    // Format brand revenue by month
    const brandDataMap = new Map<string, Map<string, number>>()
    const brands = new Set<string>()
    brandRevenue.forEach((row) => {
      brands.add(row.brand)
      if (!brandDataMap.has(row.month)) {
        brandDataMap.set(row.month, new Map())
      }
      brandDataMap.get(row.month)!.set(row.brand, row.revenue)
    })

    // Build brand data for each month
    const brandData: { month: string; [key: string]: string | number }[] = []
    last7Months.forEach(({ month }) => {
      const monthData: { month: string; craftworld: number; adulawo: number; planet3r: number } = {
        month,
        craftworld: 0,
        adulawo: 0,
        planet3r: 0,
      }
      const monthBrands = brandDataMap.get(month)
      if (monthBrands) {
        monthBrands.forEach((rev, brand) => {
          const lowerBrand = brand.toLowerCase()
          if (lowerBrand.includes('craftworld')) monthData.craftworld = rev
          else if (lowerBrand.includes('adula')) monthData.adulawo = rev
          else if (lowerBrand.includes('planet')) monthData.planet3r = rev
        })
      }
      brandData.push(monthData)
    })

    // Format category data with percentages
    const totalCategorySales = categorySales.reduce((sum, c) => sum + c.value, 0)
    const categoryData = categorySales.map((c) => ({
      name: c.category,
      value: totalCategorySales > 0 ? Math.round((c.value / totalCategorySales) * 100) : 0,
      fill: getCategoryColor(c.category),
    }))

    // Format weekly orders
    const weeklyData: { week: string; orders: number }[] = weeklyOrders.slice(-8).map((w, i) => ({
      week: `W${i + 1}`,
      orders: w.orders,
    }))

    // Get product images from products table
    type TopProductType = {
      id: string;
      name: string;
      price: number;
      images: string[];
      rating: number;
      units_sold: number;
      category: string | null;
      brand: string | null;
    }
    const topProductsWithImages: TopProductType[] = topProducts.map((p) => {
      // Parse images from the products table (stored as JSON string)
      let images: string[] = []
      try {
        const parsed = typeof p.images === 'string' ? JSON.parse(p.images) : p.images
        images = Array.isArray(parsed) ? parsed : []
      } catch {
        images = []
      }
      return {
        id: p.id,
        name: p.name,
        price: p.price,
        images: images,
        rating: p.rating ?? 0,
        units_sold: p.units_sold ?? 0,
        category: p.category ?? '',
        brand: p.brand ?? '',
      }
    })

    ok(res, {
      // Monthly revenue chart
      monthlyRevenue: last7Months,
      // Revenue by brand
      brandRevenue: brandData.length > 0 ? brandData : [
        { month: 'Jan', craftworld: 0, adulawo: 0, planet3r: 0 },
        { month: 'Feb', craftworld: 0, adulawo: 0, planet3r: 0 },
        { month: 'Mar', craftworld: 0, adulawo: 0, planet3r: 0 },
        { month: 'Apr', craftworld: 0, adulawo: 0, planet3r: 0 },
        { month: 'May', craftworld: 0, adulawo: 0, planet3r: 0 },
        { month: 'Jun', craftworld: 0, adulawo: 0, planet3r: 0 },
        { month: 'Jul', craftworld: 0, adulawo: 0, planet3r: 0 },
      ],
      // Weekly orders
      weeklyOrders: weeklyData.length > 0 ? weeklyData : [
        { week: 'W1', orders: 0 }, { week: 'W2', orders: 0 },
        { week: 'W3', orders: 0 }, { week: 'W4', orders: 0 },
        { week: 'W5', orders: 0 }, { week: 'W6', orders: 0 },
        { week: 'W7', orders: 0 }, { week: 'W8', orders: 0 },
      ],
      // Category breakdown
      categorySales: categoryData.length > 0 ? categoryData : [
        { name: 'No data', value: 100, fill: '#cccccc' },
      ],
      // KPIs
      kpis: {
        thisMonthRevenue: thisMonth,
        lastMonthRevenue: lastMonth,
        percentChange: Math.round(percentChange * 10) / 10,
        conversionRate: Math.round(conversionRate * 10) / 10,
        avgOrderValue: totalOrdersCount > 0 ? Math.round(thisMonth / totalOrdersCount) : 0,
      },
      // Top products
      topProducts: topProductsWithImages,
    })
  },

  // Admin product CRUD
  async createProduct(req: AuthRequest, res: Response): Promise<void> {
    const { name, description, price, comparePrice, categoryId, brandId, stock, tags, isFeatured, isNew } = req.body
    const product = await ProductModel.createProduct({
      name, description, price: Number(price),
      comparePrice: comparePrice ? Number(comparePrice) : undefined,
      images: [], categoryId, brandId,
      stock: Number(stock), tags: tags ?? [],
      isFeatured: Boolean(isFeatured), isNew: Boolean(isNew),
    })
    created(res, ProductModel.toProductDTO(product), 'Product created')
  },

  async updateProduct(req: AuthRequest, res: Response): Promise<void> {
    const id = req.params.id as string
    const product = await ProductModel.updateProduct(id, req.body)
    if (!product) { notFound(res, 'Product not found'); return }
    ok(res, ProductModel.toProductDTO(product), 'Product updated')
  },

  async deleteProduct(req: AuthRequest, res: Response): Promise<void> {
    const result = await execute(
      'UPDATE products SET is_active = 0 WHERE id = ?', [req.params.id as string]
    )
    if (result.affectedRows === 0) { notFound(res, 'Product not found'); return }
    ok(res, null, 'Product deactivated')
  },

  async uploadProductImages(req: AuthRequest, res: Response): Promise<void> {
    const files = req.files as Express.Multer.File[]
    if (!files?.length) { badRequest(res, 'No images provided'); return }

    const id = req.params.id as string
    const product = await ProductModel.findById(id)
    if (!product) { notFound(res, 'Product not found'); return }

    const currentImages: string[] = typeof product.images === 'string'
      ? JSON.parse(product.images) : product.images

    // Check if adding new images would exceed limit of 8
    const remainingSlots = 8 - currentImages.length
    if (remainingSlots <= 0) {
      badRequest(res, 'Maximum of 8 images already reached. Please remove some images first.'); return
    }

    // Only upload up to remaining slots
    const filesToUpload = files.slice(0, remainingSlots)
    if (files.length > remainingSlots) {
      badRequest(res, `Only ${remainingSlots} more image(s) can be added. Maximum is 8 images.`); return
    }

    const results = await cloudinaryService.uploadMultiple(
      filesToUpload.map((f) => f.buffer),
      'products'
    )
    const urls = results.map((r) => r.url)

    await ProductModel.updateProduct(id, {
      images: [...currentImages, ...urls],
    })

    ok(res, { urls }, 'Images uploaded')
  },

  // Admin order management
  async listOrders(req: Request, res: Response): Promise<void> {
    const { page, limit } = getPagination(req.query.page, req.query.limit, 20)
    const status = req.query.status as import('@/types').OrderStatus | undefined
    const { rows, total } = await OrderModel.listAllOrders(page, limit, status)
    paginated(res, rows.map(OrderModel.toOrderDTO), total, page, limit)
  },

  async updateOrderStatus(req: AuthRequest, res: Response): Promise<void> {
    const { reference } = req.params
    const { status, note } = req.body

    const order = await OrderModel.findByReference(reference as string)
    if (!order) { notFound(res, 'Order not found'); return }

    await OrderModel.updateStatus(order.id, status, note, req.user!.userId)

    // Send status update email async
    const user = await AuthModel.findById(order.user_id)
    if (user) {
      sendOrderStatusEmail(user.email, user.first_name, order.reference, status, note).catch(() => {})
    }

    // Emit realtime update
    req.app.get('io')?.emit('order:status_updated', { reference, status })

    ok(res, null, 'Order status updated')
  },

  async listUsers(req: Request, res: Response): Promise<void> {
    const { page, limit } = getPagination(req.query.page, req.query.limit, 20)
    const offset = (page - 1) * limit
    const [rows, count] = await Promise.all([
      query(
        `SELECT id, first_name, last_name, email, phone, role, is_active, created_at, last_login_at
         FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [limit, offset]
      ),
      query<{ total: number }>('SELECT COUNT(*) AS total FROM users'),
    ])
    paginated(res, rows, count[0]?.total ?? 0, page, limit)
  },

  // Admin review management
  async listReviews(req: Request, res: Response): Promise<void> {
    const { page, limit } = getPagination(req.query.page, req.query.limit, 20)
    const { productId, isVerified } = req.query
    const offset = (page - 1) * limit

    let whereClause = '1=1'
    const params: unknown[] = []

    if (productId) {
      whereClause += ' AND r.product_id = ?'
      params.push(productId as string)
    }

    if (isVerified === 'true') {
      whereClause += ' AND r.is_verified = 1'
    } else if (isVerified === 'false') {
      whereClause += ' AND r.is_verified = 0'
    }

    const [rows, count] = await Promise.all([
      query(
        `SELECT r.*, u.first_name, u.last_name, u.email, p.name AS product_name, p.slug
         FROM product_reviews r
         JOIN users u ON u.id = r.user_id
         JOIN products p ON p.id = r.product_id
         WHERE ${whereClause}
         ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM product_reviews r
         WHERE ${whereClause}`,
        params
      ),
    ])

    paginated(res, rows, count[0]?.total ?? 0, page, limit)
  },

  async updateReviewVerification(req: AuthRequest, res: Response): Promise<void> {
    const { reviewId } = req.params
    const { isVerified } = req.body

    const review = await queryOne(
      'SELECT * FROM product_reviews WHERE id = ?',
      [reviewId as string]
    )
    if (!review) { notFound(res, 'Review not found'); return }

    await execute(
      'UPDATE product_reviews SET is_verified = ? WHERE id = ?',
      [isVerified ? 1 : 0, reviewId as string]
    )

    ok(res, null, `Review marked as ${isVerified ? 'verified' : 'unverified'}`)
  },

  async deleteReview(req: AuthRequest, res: Response): Promise<void> {
    const { reviewId } = req.params

    const review = await queryOne<{ product_id: string }>(
      'SELECT product_id FROM product_reviews WHERE id = ?',
      [reviewId as string]
    )
    if (!review) { notFound(res, 'Review not found'); return }

    await execute(
      'DELETE FROM product_reviews WHERE id = ?',
      [reviewId as string]
    )

    // Recalculate product rating after deletion
    await ProductModel.recalculateRating(review.product_id)

    ok(res, null, 'Review deleted')
  },

  // ── Admin Webhook Monitoring ────────────────────────────────
  async getWebhookMetrics(req: Request, res: Response): Promise<void> {
    try {
      const hours = req.query.hours ? Number(req.query.hours) : 24
      const { getMetricsSummary } = await import('@/services/webhook-metrics.service')
      const metrics = await getMetricsSummary(hours)
      ok(res, metrics, 'Webhook metrics retrieved')
    } catch (err) {
      logger.error('Failed to get webhook metrics:', err)
      serverError(res, 'Failed to retrieve webhook metrics')
    }
  },

  async getWebhookMetricsByType(req: Request, res: Response): Promise<void> {
    try {
      const hours = req.query.hours ? Number(req.query.hours) : 24
      const { getMetricsByEventType } = await import('@/services/webhook-metrics.service')
      const metricsByType = await getMetricsByEventType(hours)
      const result = Object.fromEntries(metricsByType)
      ok(res, result, 'Webhook metrics by type retrieved')
    } catch (err) {
      logger.error('Failed to get webhook metrics by type:', err)
      serverError(res, 'Failed to retrieve webhook metrics')
    }
  },

  async getWebhookErrorStatistics(req: Request, res: Response): Promise<void> {
    try {
      const hours = req.query.hours ? Number(req.query.hours) : 24
      const { getErrorStatistics } = await import('@/services/webhook-metrics.service')
      const stats = await getErrorStatistics(hours)
      ok(res, stats, 'Error statistics retrieved')
    } catch (err) {
      logger.error('Failed to get error statistics:', err)
      serverError(res, 'Failed to retrieve error statistics')
    }
  },

  async getWebhookRetryStatistics(req: Request, res: Response): Promise<void> {
    try {
      const hours = req.query.hours ? Number(req.query.hours) : 24
      const { getRetryStatistics } = await import('@/services/webhook-metrics.service')
      const stats = await getRetryStatistics(hours)
      ok(res, stats, 'Retry statistics retrieved')
    } catch (err) {
      logger.error('Failed to get retry statistics:', err)
      serverError(res, 'Failed to retrieve retry statistics')
    }
  },

  async getWebhookLogs(req: Request, res: Response): Promise<void> {
    try {
      const { limit } = req.query
      const { getRecentWebhookLogs } = await import('@/services/webhook-logger.service')
      const logs = await getRecentWebhookLogs(limit ? Number(limit) : 100)
      ok(res, logs, 'Webhook logs retrieved')
    } catch (err) {
      logger.error('Failed to get webhook logs:', err)
      serverError(res, 'Failed to retrieve webhook logs')
    }
  },

  async getWebhookLogsByReference(req: Request, res: Response): Promise<void> {
    try {
      const reference = req.params.reference
      const referenceStr = Array.isArray(reference) ? reference[0] : reference
      const { getWebhookLogsForReference } = await import('@/services/webhook-logger.service')
      const logs = await getWebhookLogsForReference(referenceStr)
      ok(res, logs, 'Webhook logs retrieved')
    } catch (err) {
      logger.error('Failed to get webhook logs:', err)
      serverError(res, 'Failed to retrieve webhook logs')
    }
  },

  async getWebhookLogsByStatus(req: Request, res: Response): Promise<void> {
    try {
      const { status, limit } = req.query
      if (!status) {
        badRequest(res, 'Status query parameter is required')
        return
      }
      const { getWebhookLogsByStatus } = await import('@/services/webhook-logger.service')
      const logs = await getWebhookLogsByStatus(
        status as any,
        limit ? Number(limit) : 100
      )
      ok(res, logs, 'Webhook logs retrieved')
    } catch (err) {
      logger.error('Failed to get webhook logs:', err)
      serverError(res, 'Failed to retrieve webhook logs')
    }
  },

  async getPaymentMonitoringDashboard(req: Request, res: Response): Promise<void> {
    try {
      const hours = req.query.hours ? Number(req.query.hours) : 24
      
      const [
        { getMetricsSummary },
        { getErrorStatistics },
        { getRetryStatistics },
        { getRecentWebhookLogs }
      ] = await Promise.all([
        import('@/services/webhook-metrics.service').then(m => ({ getMetricsSummary: m.getMetricsSummary })),
        import('@/services/webhook-metrics.service').then(m => ({ getErrorStatistics: m.getErrorStatistics })),
        import('@/services/webhook-metrics.service').then(m => ({ getRetryStatistics: m.getRetryStatistics })),
        import('@/services/webhook-logger.service').then(m => ({ getRecentWebhookLogs: m.getRecentWebhookLogs })),
      ])

      const [metrics, errorStats, retryStats, recentLogs] = await Promise.all([
        getMetricsSummary(hours),
        getErrorStatistics(hours),
        getRetryStatistics(hours),
        getRecentWebhookLogs(50),
      ])

      ok(res, {
        period: { hours, since: new Date(Date.now() - hours * 60 * 60 * 1000) },
        metrics,
        errorStats,
        retryStats,
        recentLogs,
      }, 'Payment monitoring dashboard retrieved')
    } catch (err) {
      logger.error('Failed to get payment monitoring dashboard:', err)
      serverError(res, 'Failed to retrieve dashboard data')
    }
  },

  // ── Admin Hero Image Management ──────────────────────────
  async listHeroImages(_req: Request, res: Response): Promise<void> {
    const HeroModel = await import('@/models/hero.model').then(m => m)
    const images = await HeroModel.getAllHeroImages()
    ok(res, images)
  },

  async getHeroImageById(req: Request, res: Response): Promise<void> {
    const HeroModel = await import('@/models/hero.model').then(m => m)
    const image = await HeroModel.getHeroImageById(req.params.id as string)
    if (!image) { notFound(res, 'Hero image not found'); return }
    ok(res, image)
  },

  async createHeroImage(req: Request, res: Response): Promise<void> {
    const { title, subtitle, tag, alt_text, sort_order } = req.body

    if (!title || !subtitle || !tag || !alt_text) {
      badRequest(res, 'Missing required fields: title, subtitle, tag, alt_text')
      return
    }

    // Handle file upload if present
    let imageUrl = req.body.image_url || ''
    if (req.file) {
      try {
        const uploadResult = await cloudinaryService.uploadBuffer(
          req.file.buffer,
          'hero_images'
        )
        imageUrl = uploadResult.url
      } catch (error) {
        logger.error('Cloudinary upload failed:', error)
        badRequest(res, 'Image upload failed')
        return
      }
    } else if (!imageUrl) {
      badRequest(res, 'Either an image file or image_url is required')
      return
    }

    const HeroModel = await import('@/models/hero.model').then(m => m)
    const image = await HeroModel.createHeroImage({
      image_url: imageUrl, title, subtitle, tag, alt_text, sort_order,
    })
    created(res, image, 'Hero image created')
  },

  async updateHeroImage(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string
    const { title, subtitle, tag, alt_text, sort_order, is_active } = req.body

    // Get the existing hero image to preserve the image URL if no new file is uploaded
    const HeroModel = await import('@/models/hero.model').then(m => m)
    const existingImage = await HeroModel.getHeroImageById(id)
    if (!existingImage) { 
      notFound(res, 'Hero image not found')
      return
    }

    // Handle file upload if present
    let imageUrl = existingImage.image_url
    if (req.file) {
      try {
        const uploadResult = await cloudinaryService.uploadBuffer(
          req.file.buffer,
          'hero_images'
        )
        imageUrl = uploadResult.url
      } catch (error) {
        logger.error('Cloudinary upload failed:', error)
        badRequest(res, 'Image upload failed')
        return
      }
    } else if (req.body.image_url) {
      // If no file uploaded but image_url is provided, use it
      imageUrl = req.body.image_url
    }

    const image = await HeroModel.updateHeroImage(id, {
      image_url: imageUrl,
      title, subtitle, tag, alt_text, sort_order, is_active
    })
    ok(res, image, 'Hero image updated')
  },

  async deleteHeroImage(req: Request, res: Response): Promise<void> {
    const HeroModel = await import('@/models/hero.model').then(m => m)
    const id = req.params.id as string
    
    await HeroModel.deleteHeroImage(id)
    ok(res, null, 'Hero image deleted')
  },

  async reorderHeroImages(req: Request, res: Response): Promise<void> {
    const { order } = req.body
    if (!order || typeof order !== 'object') {
      badRequest(res, 'Invalid order data')
      return
    }

    const HeroModel = await import('@/models/hero.model').then(m => m)
    await HeroModel.reorderHeroImages(order)
    ok(res, null, 'Hero images reordered')
  },
}
