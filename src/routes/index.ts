import { Router, Request, Response } from 'express'
import multer from 'multer'
import {
  authController, productController, orderController,
  paymentController, addressController, categoryController,
  brandController, newsletterController, adminController,
} from '@/controllers'
import { ok, created, paginated, badRequest, notFound, forbidden, serverError } from '@/utils/response'
import { query } from '@/config/database'
import { authenticate, requireAdmin } from '@/middleware/auth.middleware'
import {
  validate,
  registerValidators, loginValidators, forgotPasswordValidators,
  resetPasswordValidators, changePasswordValidators,
  productQueryValidators, createProductValidators,
  createOrderValidators, addressValidators, reviewValidators,
  adminReviewValidators, newsletterValidators,
} from '@/middleware/validate.middleware'
import type { AuthRequest } from '@/types'

// ── Type helper: Cast authenticated request handlers ──────────
// Wraps handlers that expect AuthRequest and makes Express happy
const h = (handler: any) => handler as any

import * as RewardsModel  from '@/models/rewards.model'
import * as CouponModel   from '@/models/coupon.model'
import * as DiyModel      from '@/models/diy.model'
import * as TrackingModel from '@/models/tracking.model'
import * as WalletModel   from '@/models/wallet.model'

// Multer — memory storage (buffers go to Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'))
  },
})

const router = Router()

// ── Health check ──────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'CraftworldCentre API is running',
    version: process.env.API_VERSION ?? 'v1',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  })
})

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES  /api/v1/auth
// ═══════════════════════════════════════════════════════════════
const auth = Router()

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new customer account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, password, confirmPassword]
 *             properties:
 *               firstName:       { type: string }
 *               lastName:        { type: string }
 *               email:           { type: string, format: email }
 *               password:        { type: string, minLength: 8 }
 *               confirmPassword: { type: string }
 *               phone:           { type: string }
 */
auth.post('/register',        registerValidators,       validate, authController.register)
auth.post('/login',           loginValidators,          validate, authController.login)
auth.post('/logout',          authenticate, h(authController.logout)) // Fixed: logout needs authentication
auth.post('/refresh',         authController.refresh)
auth.post('/forgot-password', forgotPasswordValidators, validate, authController.forgotPassword)
auth.post('/reset-password',  resetPasswordValidators,  validate, authController.resetPassword)

// OAuth routes
auth.get('/google',           authController.googleLogin)
auth.get('/google/callback',  authController.googleCallback)
auth.get('/facebook',         authController.facebookLogin)
auth.get('/facebook/callback',authController.facebookCallback)

// Current user
auth.get ('/me',              authenticate, h(authController.getMe))
auth.put ('/me',              authenticate, h(authController.updateProfile))
auth.put ('/me/password',     authenticate, changePasswordValidators, validate, h(authController.changePassword))

router.use('/auth', auth)

// ═══════════════════════════════════════════════════════════════
// PRODUCT ROUTES  /api/v1/products
// ═══════════════════════════════════════════════════════════════
const products = Router()

/**
 * @swagger
 * /products:
 *   get:
 *     summary: List products with filters and pagination
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: brand
 *         schema: { type: string, enum: [craftworld, adulawo, planet3r] }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [featured, newest, price-asc, price-desc, rating] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 12 }
 */
products.get('/',             productQueryValidators, validate, productController.list)
products.get('/featured',     productController.getFeatured)
products.get('/new',          productController.getNew)
products.get('/:slug',        productController.getBySlug)
products.get('/:slug/related',productController.getRelated)
products.get('/:slug/reviews',productController.getReviews)
products.post('/:slug/reviews', authenticate, reviewValidators, validate, h(productController.createReview))

router.use('/products', products)

// ═══════════════════════════════════════════════════════════════
// ORDER ROUTES  /api/v1/orders
// ═══════════════════════════════════════════════════════════════
const orders = Router()

orders.use(authenticate) // Fixed: This middleware is now correctly applied

orders.get ('/',                h(orderController.listMine))
orders.post('/',                createOrderValidators, validate, h(orderController.create))
orders.get ('/:reference',      h(orderController.getOne))
orders.post('/:reference/cancel', h(orderController.cancel))

router.use('/orders', orders)

// ═══════════════════════════════════════════════════════════════
// PAYMENT ROUTES  /api/v1/payments
// ═══════════════════════════════════════════════════════════════
const payments = Router()

// Webhook needs raw body — handled in server.ts before JSON middleware
payments.post('/webhook',       paymentController.webhook)

// Initialize payment - creates order AND Paystack transaction (authenticated)
payments.post('/initialize',     authenticate, h(paymentController.initialize))

// Verify payment - called from frontend callback (authenticated)
payments.post('/verify',        authenticate, h(paymentController.verify))

router.use('/payments', payments)

// ═══════════════════════════════════════════════════════════════
// ADDRESS ROUTES  /api/v1/addresses
// ═══════════════════════════════════════════════════════════════
const addresses = Router()

addresses.use(authenticate) // Fixed: This middleware is now correctly applied

addresses.get ('/',            h(addressController.list))
addresses.post('/',            addressValidators, validate, h(addressController.create))
addresses.put ('/:id',         addressValidators, validate, h(addressController.update))
addresses.delete('/:id',       h(addressController.delete))
addresses.patch('/:id/default',h(addressController.setDefault))

router.use('/addresses', addresses)

// ═══════════════════════════════════════════════════════════════
// CATEGORY & BRAND ROUTES
// ═══════════════════════════════════════════════════════════════
router.get('/categories',      categoryController.list)
router.get('/brands',          brandController.list)
router.get('/brands/:id/products', productQueryValidators, validate, brandController.getProducts)

// ═══════════════════════════════════════════════════════════════
// NEWSLETTER ROUTES
// ═══════════════════════════════════════════════════════════════
router.post('/newsletter/subscribe',   newsletterValidators, validate, newsletterController.subscribe)
router.get ('/newsletter/unsubscribe', newsletterController.unsubscribe)

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES  /api/v1/admin
// ═══════════════════════════════════════════════════════════════
const admin = Router()

admin.use(authenticate, requireAdmin) // Fixed: This middleware is now correctly applied

// Dashboard
admin.get('/dashboard',                h(adminController.getDashboard))
admin.get('/analytics',               h(adminController.getAnalytics))

// Products
admin.post  ('/products',              createProductValidators, validate, h(adminController.createProduct))
admin.put   ('/products/:id',          h(adminController.updateProduct))
admin.delete('/products/:id',          h(adminController.deleteProduct))
admin.post  ('/products/:id/images',   upload.array('images', 8), h(adminController.uploadProductImages))

// Orders
admin.get   ('/orders',                h(adminController.listOrders))
admin.patch ('/orders/:reference/status', h(adminController.updateOrderStatus))

// Users
admin.get   ('/users',                 h(adminController.listUsers))

// Reviews
admin.get   ('/reviews',               h(adminController.listReviews))
admin.patch ('/reviews/:reviewId/verify', adminReviewValidators, validate, h(adminController.updateReviewVerification))
admin.delete('/reviews/:reviewId',      h(adminController.deleteReview))

router.use('/admin', admin)


// ═══════════════════════════════════════════════════════════════
// REWARDS ROUTES  /api/v1/rewards
// ═══════════════════════════════════════════════════════════════
const rewards = Router()
rewards.use(authenticate) // Fixed: This middleware is now correctly applied

rewards.get('/', h(async (req: AuthRequest, res: Response) => {
  const r = await RewardsModel.getOrCreate(req.user!.userId)
  ok(res, RewardsModel.toRewardsDTO(r))
}))

rewards.get('/history', h(async (req: AuthRequest, res: Response) => {
  const history = await RewardsModel.getHistory(req.user!.userId)
  ok(res, history)
}))

rewards.post('/redeem', h(async (req: AuthRequest, res: Response) => {
  const { type } = req.body
  if (!['cashback', 'discount_code'].includes(type)) {
    badRequest(res, 'type must be cashback or discount_code')
    return
  }
  try {
    const result = await RewardsModel.redeemPoints(req.user!.userId, type)
    ok(res, result, 'Reward redeemed successfully!')
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'Redemption failed')
  }
}))

router.use('/rewards', rewards)

// ═══════════════════════════════════════════════════════════════
// WALLET ROUTES  /api/v1/wallet
// ═══════════════════════════════════════════════════════════════
// 
import { randomToken } from '@/utils/crypto'

const wallet = Router()
wallet.use(authenticate) // Fixed: This middleware is now correctly applied

// Get wallet balance
wallet.get('/', h(async (req: AuthRequest, res: Response) => {
  try {
    const walletData = await WalletModel.getOrCreateWallet(req.user!.userId)
    ok(res, WalletModel.toWalletDTO(walletData))
  } catch (err) {
    serverError(res, err instanceof Error ? err.message : 'Failed to get wallet')
  }
}))

// Get wallet transactions
wallet.get('/transactions', h(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? 20), 10) || 20))
  
  try {
    const { transactions, total } = await WalletModel.getTransactions(req.user!.userId, page, limit)
    paginated(res, transactions, total, page, limit)
  } catch (err) {
    serverError(res, err instanceof Error ? err.message : 'Failed to get transactions')
  }
}))

// Initialize wallet deposit (Step 1 - Get Paystack payment link)
wallet.post('/deposit/init', h(async (req: AuthRequest, res: Response) => {
  const { amount } = req.body
  const numAmount = Number(amount)
  
  // Validate amount
  if (!numAmount || numAmount <= 0) {
    badRequest(res, 'Please enter a valid amount')
    return
  }
  
  if (numAmount < 100) {
    badRequest(res, 'Minimum deposit amount is ₦100')
    return
  }
  
  if (numAmount > 1000000) {
    badRequest(res, 'Maximum deposit amount is ₦1,000,000')
    return
  }
  
  try {
    const authModel = await import('@/models/auth.model')
    const user = await authModel.findById(req.user!.userId)
    if (!user) {
      notFound(res, 'User not found')
      return
    }
    
    // Generate unique reference for this transaction
    const reference = `WALLET-${req.user!.userId.substring(0, 8)}-${Date.now()}-${randomToken(8)}`
    
    // Initialize Paystack payment
    const { initializePayment } = await import('@/services/paystack.service')
    const payment = await initializePayment({
      email: user.email,
      amount: Math.round(numAmount * 100), // Convert to kobo
      reference: reference,
      metadata: {
        type: 'wallet_deposit',
        userId: req.user!.userId,
        amount: numAmount,
      },
    })
    
    // Store pending transaction reference for tracking
    const pendingRef = reference
    
    created(res, {
      reference: pendingRef,
      authorizationUrl: payment.authorization_url,
      accessCode: payment.access_code,
      amount: numAmount,
      message: 'Payment link generated. Redirect to Paystack to complete payment.',
    }, 'Payment initialized')
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to initialize payment'
    serverError(res, error)
  }
}))

// Verify and finalize wallet deposit (Step 2 - After user returns from Paystack)
wallet.post('/deposit/verify', h(async (req: AuthRequest, res: Response) => {
  const { reference } = req.body
  
  // Validate reference
  if (!reference || typeof reference !== 'string') {
    badRequest(res, 'Valid payment reference is required')
    return
  }
  
  try {
    // Verify with Paystack
    const { verifyTransaction } = await import('@/services/paystack.service')
    const paystackResult = await verifyTransaction(reference)
    
    const { status, amount } = paystackResult.data
    const amountInNaira = amount / 100
    
    // Check payment status
    if (status !== 'success') {
      badRequest(res, `Payment ${status}. Status: ${status}`)
      return
    }
    
    // Fund wallet with verified amount
    const walletData = await WalletModel.addFunds(
      req.user!.userId,
      amountInNaira,
      reference,
      'Wallet deposit via Paystack',
      { 
        paystack_ref: reference,
        timestamp: new Date().toISOString(),
      }
    )
    
    ok(res, {
      wallet: walletData,
      deposit: {
        amount: amountInNaira,
        reference,
        status: 'completed',
        timestamp: new Date().toISOString(),
      },
      message: `₦${amountInNaira.toLocaleString()} added to your wallet!`,
    }, 'Wallet funded successfully')
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to verify deposit'
    serverError(res, error)
  }
}))

// Check deposit status in real-time (polling fallback while webhook processes)
wallet.get('/deposit/status/:reference', h(async (req: AuthRequest, res: Response) => {
  const referenceParam = req.params.reference
  const reference = typeof referenceParam === 'string' ? referenceParam : referenceParam?.[0]
  
  if (!reference) {
    badRequest(res, 'Reference is required')
    return
  }
  
  try {
    // Check with Paystack for current payment status
    const { verifyTransaction } = await import('@/services/paystack.service')
    const result = await verifyTransaction(reference)
    const paystackData = result.data
    
    const status = paystackData.status
    const amountInNaira = paystackData.amount / 100
    
    // If payment is successful, check if wallet was already funded
    if (status === 'success') {
      // Check if transaction already exists in our wallet
      const walletTx = await WalletModel.getTransactionByReference(reference)
      
      if (walletTx) {
        // Already funded
        ok(res, {
          status: 'completed',
          funded: true,
          amount: amountInNaira,
          reference,
          walletBalance: (await WalletModel.getOrCreateWallet(req.user!.userId)).balance,
          message: 'Payment completed and wallet funded',
        })
      } else {
        // Payment successful but not yet funded (webhook may still process)
        // Auto-fund if not already done
        const wallet = await WalletModel.addFunds(
          req.user!.userId,
          amountInNaira,
          reference,
          'Wallet deposit via Paystack (from status check)',
          { paystack_ref: reference }
        )
        
        ok(res, {
          status: 'completed',
          funded: true,
          amount: amountInNaira,
          reference,
          walletBalance: wallet.balance,
          message: 'Payment completed and wallet now funded',
        })
      }
    } else if (status === 'abandoned') {
      // Payment still abandoned/pending
      ok(res, {
        status: 'pending',
        funded: false,
        amount: amountInNaira,
        reference,
        message: 'Payment is pending. Please complete the payment on Paystack to continue.',
      })
    } else {
      // Payment failed
      badRequest(res, `Payment ${status}. Please try again.`)
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to check deposit status'
    serverError(res, error)
  }
}))

router.use('/wallet', wallet)

// ═══════════════════════════════════════════════════════════════
// COUPON ROUTES  /api/v1/coupons
// ═══════════════════════════════════════════════════════════════
router.post('/coupons/validate', authenticate, h(async (req: AuthRequest, res: Response) => {
  const { code, subtotal } = req.body
  if (!code || !subtotal) { badRequest(res, 'code and subtotal are required'); return }
  const result = await CouponModel.validateCoupon(code, req.user!.userId, Number(subtotal))
  if (!result.valid) { badRequest(res, result.errorMessage ?? 'Invalid coupon'); return }
  ok(res, {
    code:     result.coupon!.code,
    type:     result.coupon!.type,
    value:    Number(result.coupon!.value),
    discount: result.discount,
  }, 'Coupon applied')
}))

// ═══════════════════════════════════════════════════════════════
// DIY ROUTES  /api/v1/diy
// ═══════════════════════════════════════════════════════════════
const diy = Router()

diy.get('/', async (req: Request, res: Response) => {
  const { page, limit } = getPaginationLocal(req)
  const category = req.query.category as string | undefined
  const search   = req.query.q as string | undefined
  const { rows, total } = await DiyModel.listPublished(category, search, page, limit)
  paginated(res, rows.map(DiyModel.toDiyDTO), total, page, limit)
})

diy.post('/:id/view', async (req: Request, res: Response) => {
  await DiyModel.incrementViews(req.params.id as string)
  ok(res, null)
})

router.use('/diy', diy)

// ═══════════════════════════════════════════════════════════════
// ORDER TRACKING  /api/v1/orders/:reference/tracking
// ═══════════════════════════════════════════════════════════════
router.get('/orders/:reference/tracking', authenticate, h(async (req: AuthRequest, res: Response) => {
  const order = await import('@/models/order.model').then((m) => m.findByReference(req.params.reference as string))
  if (!order) { notFound(res, 'Order not found'); return }
  if (req.user!.role !== 'admin' && order.user_id !== req.user!.userId) { forbidden(res); return }
  const timeline = await TrackingModel.getTimeline(order.id)
  ok(res, { order: import('@/models/order.model').then((m) => m.toOrderDTO(order)), timeline })
}))

// Admin: add tracking event
router.post('/admin/orders/:reference/tracking', authenticate, requireAdmin, h(async (req: AuthRequest, res: Response) => {
  const order = await import('@/models/order.model').then((m) => m.findByReference(req.params.reference as string))
  if (!order) { notFound(res, 'Order not found'); return }
  const { title, description, location } = req.body
  if (!title) { badRequest(res, 'title is required'); return }
  await TrackingModel.addEvent(order.id, order.status, title, description, location)
  ok(res, null, 'Tracking event added')
}))

// ═══════════════════════════════════════════════════════════════
// ADMIN: COUPONS  /api/v1/admin/coupons
// ═══════════════════════════════════════════════════════════════
admin.get('/coupons', async (req: Request, res: Response) => {
  const { page, limit } = getPaginationLocal(req)
  const { rows, total } = await CouponModel.listCoupons(page, limit)
  paginated(res, rows.map(CouponModel.toCouponDTO), total, page, limit)
})

admin.post('/coupons', async (req: Request, res: Response) => {
  const { code, type, value, minOrderAmount, maxUses, expiresAt } = req.body
  if (!code || !type || !value) { badRequest(res, 'code, type, value are required'); return }
  const coupon = await CouponModel.createCoupon({ code, type, value, minOrderAmount, maxUses, expiresAt })
  created(res, CouponModel.toCouponDTO(coupon), 'Coupon created')
})

admin.patch('/coupons/:id', async (req: Request, res: Response) => {
  await CouponModel.updateCoupon(req.params.id as string, req.body)
  ok(res, null, 'Coupon updated')
})

admin.delete('/coupons/:id', async (req: Request, res: Response) => {
  await CouponModel.deleteCoupon(req.params.id as string)
  ok(res, null, 'Coupon deleted')
})

// ═══════════════════════════════════════════════════════════════
// ADMIN: DIY VIDEOS  /api/v1/admin/diy
// ═══════════════════════════════════════════════════════════════
admin.get('/diy', async (req: Request, res: Response) => {
  const { page, limit } = getPaginationLocal(req)
  const { rows, total } = await DiyModel.listAll(page, limit)
  paginated(res, rows.map(DiyModel.toDiyDTO), total, page, limit)
})

admin.post('/diy', authenticate, h(async (req: AuthRequest, res: Response) => {
  const { title, description, youtubeId, thumbnail, duration, category, brandId, tags, sortOrder } = req.body
  if (!title || !youtubeId) { badRequest(res, 'title and youtubeId are required'); return }
  const video = await DiyModel.createVideo({
    title, description, youtubeId, thumbnail, duration,
    category: category ?? 'Upycling', brandId, tags,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
    createdBy: req.user!.userId,
  })
  created(res, DiyModel.toDiyDTO(video), 'DIY video created')
}))

admin.put('/diy/:id', async (req: Request, res: Response) => {
  const video = await DiyModel.updateVideo(req.params.id as string, req.body)
  if (!video) { notFound(res, 'Video not found'); return }
  ok(res, DiyModel.toDiyDTO(video), 'Video updated')
})

admin.delete('/diy/:id', async (req: Request, res: Response) => {
  await DiyModel.deleteVideo(req.params.id as string)
  ok(res, null, 'Video deleted')
})

// ═══════════════════════════════════════════════════════════════
// ADMIN: REWARDS OVERVIEW
// ═══════════════════════════════════════════════════════════════
admin.get('/rewards/overview', async (_req: Request, res: Response) => {
  const [totals, topEarners] = await Promise.all([
    query<{ total_users: number; total_points: number }>(
      'SELECT COUNT(*) AS total_users, COALESCE(SUM(points), 0) AS total_points FROM user_rewards'
    ),
    query(
      `SELECT u.first_name, u.last_name, u.email, r.points, r.tier, r.lifetime_points
       FROM user_rewards r JOIN users u ON u.id = r.user_id
       ORDER BY r.lifetime_points DESC LIMIT 10`
    ),
  ])
  ok(res, { totals: totals[0], topEarners })
})

// Helper to reduce duplication
function getPaginationLocal(req: Request) {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? 1), 10) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? 20), 10) || 20))
  return { page, limit }
}

export default router