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
  newsletterValidators,
} from '@/middleware/validate.middleware'
import type { AuthRequest } from '@/types'


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
auth.post('/logout',          authController.logout)
auth.post('/refresh',         authController.refresh)
auth.post('/forgot-password', forgotPasswordValidators, validate, authController.forgotPassword)
auth.post('/reset-password',  resetPasswordValidators,  validate, authController.resetPassword)

// Current user
auth.get ('/me',              authenticate, authController.getMe)
auth.put ('/me',              authenticate, authController.updateProfile)
auth.put ('/me/password',     authenticate, changePasswordValidators, validate, authController.changePassword)

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
products.post('/:slug/reviews', authenticate, reviewValidators, validate, productController.createReview)

router.use('/products', products)

// ═══════════════════════════════════════════════════════════════
// ORDER ROUTES  /api/v1/orders
// ═══════════════════════════════════════════════════════════════
const orders = Router()

orders.use(authenticate)

orders.get ('/',                orderController.listMine)
orders.post('/',                createOrderValidators, validate, orderController.create)
orders.get ('/:reference',      orderController.getOne)
orders.post('/:reference/cancel', orderController.cancel)

router.use('/orders', orders)

// ═══════════════════════════════════════════════════════════════
// PAYMENT ROUTES  /api/v1/payments
// ═══════════════════════════════════════════════════════════════
const payments = Router()

// Webhook needs raw body — handled in server.ts before JSON middleware
payments.post('/webhook',       paymentController.webhook)

// Initialize payment - creates order AND Paystack transaction (authenticated)
payments.post('/initialize',     authenticate, paymentController.initialize)

// Verify payment - called from frontend callback (authenticated)
payments.post('/verify',        authenticate, paymentController.verify)

router.use('/payments', payments)

// ═══════════════════════════════════════════════════════════════
// ADDRESS ROUTES  /api/v1/addresses
// ═══════════════════════════════════════════════════════════════
const addresses = Router()

addresses.use(authenticate)

addresses.get ('/',            addressController.list)
addresses.post('/',            addressValidators, validate, addressController.create)
addresses.put ('/:id',         addressValidators, validate, addressController.update)
addresses.delete('/:id',       addressController.delete)
addresses.patch('/:id/default',addressController.setDefault)

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

admin.use(authenticate, requireAdmin)

// Dashboard
admin.get('/dashboard',                adminController.getDashboard)
admin.get('/analytics',               adminController.getAnalytics)

// Products
admin.post  ('/products',              createProductValidators, validate, adminController.createProduct)
admin.put   ('/products/:id',          adminController.updateProduct)
admin.delete('/products/:id',          adminController.deleteProduct)
admin.post  ('/products/:id/images',   upload.array('images', 8), adminController.uploadProductImages)

// Orders
admin.get   ('/orders',                adminController.listOrders)
admin.patch ('/orders/:reference/status', adminController.updateOrderStatus)

// Users
admin.get   ('/users',                 adminController.listUsers)

router.use('/admin', admin)


// ═══════════════════════════════════════════════════════════════
// REWARDS ROUTES  /api/v1/rewards
// ═══════════════════════════════════════════════════════════════
const rewards = Router()
rewards.use(authenticate)

rewards.get('/', async (req: AuthRequest, res: Response) => {
  const r = await RewardsModel.getOrCreate(req.user!.userId)
  ok(res, RewardsModel.toRewardsDTO(r))
})

rewards.get('/history', async (req: AuthRequest, res: Response) => {
  const history = await RewardsModel.getHistory(req.user!.userId)
  ok(res, history)
})

rewards.post('/redeem', async (req: AuthRequest, res: Response) => {
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
})

router.use('/rewards', rewards)

// ═══════════════════════════════════════════════════════════════
// WALLET ROUTES  /api/v1/wallet
// ═══════════════════════════════════════════════════════════════
// 
import { randomToken } from '@/utils/crypto'

const wallet = Router()
wallet.use(authenticate)

// Get wallet balance
wallet.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const walletData = await WalletModel.getOrCreateWallet(req.user!.userId)
    ok(res, WalletModel.toWalletDTO(walletData))
  } catch (err) {
    serverError(res, err instanceof Error ? err.message : 'Failed to get wallet')
  }
})

// Get wallet transactions
wallet.get('/transactions', async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? 20), 10) || 20))
  
  try {
    const { transactions, total } = await WalletModel.getTransactions(req.user!.userId, page, limit)
    paginated(res, transactions, total, page, limit)
  } catch (err) {
    serverError(res, err instanceof Error ? err.message : 'Failed to get transactions')
  }
})

// Add funds to wallet (via Paystack)
wallet.post('/deposit', async (req: AuthRequest, res: Response) => {
  const { amount } = req.body
  const numAmount = Number(amount)
  
  if (!numAmount || numAmount <= 0) {
    badRequest(res, 'Valid amount is required')
    return
  }
  
  try {
    const reference = `WALLET-${randomToken(16)}`
    
    // Initialize Paystack transaction for wallet deposit
    const user = await import('@/models/auth.model').then(m => m.findById(req.user!.userId))
    if (!user) {
      notFound(res, 'User not found')
      return
    }
    
    const { initializePayment } = await import('@/services/paystack.service')
    const payment = await initializePayment({
      email: user.email,
      amount: Math.round(numAmount * 100), // Convert to kobo
      reference: reference,
      metadata: {
        type: 'wallet_deposit',
        userId: req.user!.userId,
      },
    })
    
    ok(res, {
      reference,
      authorizationUrl: payment.authorization_url,
      amount: numAmount,
    }, 'Payment initialized')
  } catch (err) {
    serverError(res, err instanceof Error ? err.message : 'Failed to initialize deposit')
  }
})

// Verify wallet deposit (called from webhook or callback)
wallet.post('/deposit/verify', async (req: AuthRequest, res: Response) => {
  const { reference } = req.body
  if (!reference) {
    badRequest(res, 'Reference is required')
    return
  }
  
  try {
    const { verifyTransaction } = await import('@/services/paystack.service')
    const result = await verifyTransaction(reference)
    
    if (result.data.status !== 'success') {
      badRequest(res, 'Payment not successful')
      return
    }
    
    const amountInNaira = result.data.amount / 100
    const wallet = await WalletModel.addFunds(
      req.user!.userId,
      amountInNaira,
      reference,
      'Wallet deposit via Paystack',
      { paystack_data: result.data }
    )
    
    ok(res, wallet, 'Funds added successfully')
  } catch (err) {
    serverError(res, err instanceof Error ? err.message : 'Failed to verify deposit')
  }
})

router.use('/wallet', wallet)

// ═══════════════════════════════════════════════════════════════
// COUPON ROUTES  /api/v1/coupons
// ═══════════════════════════════════════════════════════════════
router.post('/coupons/validate', authenticate, async (req: AuthRequest, res: Response) => {
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
})

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
router.get('/orders/:reference/tracking', authenticate, async (req: AuthRequest, res: Response) => {
  const order = await import('@/models/order.model').then((m) => m.findByReference(req.params.reference as string))
  if (!order) { notFound(res, 'Order not found'); return }
  if (req.user!.role !== 'admin' && order.user_id !== req.user!.userId) { forbidden(res); return }
  const timeline = await TrackingModel.getTimeline(order.id)
  ok(res, { order: import('@/models/order.model').then((m) => m.toOrderDTO(order)), timeline })
})

// Admin: add tracking event
router.post('/admin/orders/:reference/tracking', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const order = await import('@/models/order.model').then((m) => m.findByReference(req.params.reference as string))
  if (!order) { notFound(res, 'Order not found'); return }
  const { title, description, location } = req.body
  if (!title) { badRequest(res, 'title is required'); return }
  await TrackingModel.addEvent(order.id, order.status, title, description, location)
  ok(res, null, 'Tracking event added')
})

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

admin.post('/diy', async (req: AuthRequest, res: Response) => {
  const { title, description, youtubeId, thumbnail, duration, category, brandId, tags, sortOrder } = req.body
  if (!title || !youtubeId) { badRequest(res, 'title and youtubeId are required'); return }
  const video = await DiyModel.createVideo({
    title, description, youtubeId, thumbnail, duration,
    category: category ?? 'Upcycling', brandId, tags,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
    createdBy: req.user!.userId,
  })
  created(res, DiyModel.toDiyDTO(video), 'DIY video created')
})

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
