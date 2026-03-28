import 'express-async-errors'
import express, { type Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import { swaggerSpec } from '@/config/swagger'
import { errorHandler, notFoundHandler } from '@/middleware/error.middleware'
import { httpLogStream } from '@/utils/logger'
import routes from '@/routes'

export function createApp(): Express {
  const app = express()

  // ── Trust proxy (for Railway / Render / Heroku deploys) ──────
  app.set('trust proxy', 1)

  // ── Security headers ─────────────────────────────────────────
  app.use(helmet({
    crossOriginResourcePolicy:  { policy: 'cross-origin' },
    crossOriginEmbedderPolicy:  false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc:     ["'self'", 'data:', 'https://res.cloudinary.com', 'https://images.unsplash.com'],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
      },
    },
  }))

  // ── CORS ─────────────────────────────────────────────────────
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(',')
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error(`CORS: Origin ${origin} not allowed`))
      }
    },
    credentials:     true,
    methods:         ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders:  ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders:  ['X-Total-Count'],
  }))

  // ── Compression ───────────────────────────────────────────────
  app.use(compression())

  // ── Paystack webhook — must receive raw body BEFORE json() ───
  app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }))

  // ── Body parsing ─────────────────────────────────────────────
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true, limit: '2mb' }))
  app.use(cookieParser(process.env.COOKIE_SECRET))

  // ── HTTP logging ─────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined', { stream: httpLogStream }))
  }

  // ── Global rate limit ─────────────────────────────────────────
  app.use(rateLimit({
    windowMs:         parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10),
    max:              parseInt(process.env.RATE_LIMIT_MAX ?? '200', 10),
    standardHeaders:  true,
    legacyHeaders:    false,
    message: { success: false, message: 'Too many requests — please slow down' },
    skip: (req) => process.env.NODE_ENV === 'test' || req.ip === '127.0.0.1',
  }))

  // ── Strict rate limit for auth endpoints ─────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,      // 15 minutes
    max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? '10', 10),
    message: { success: false, message: 'Too many authentication attempts — try again later' },
    skip: () => process.env.NODE_ENV === 'test',
  })
  app.use('/api/v1/auth/login',           authLimiter)
  app.use('/api/v1/auth/register',        authLimiter)
  app.use('/api/v1/auth/forgot-password', authLimiter)

  // ── API Documentation ─────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      customCss:      '.swagger-ui .topbar { background: #1A7A8A }',
      customSiteTitle:'CraftworldCentre API Docs',
      swaggerOptions: { persistAuthorization: true },
    }))

    app.get('/api/docs.json', (_req, res) => {
      res.json(swaggerSpec)
    })
  }

  // ── API routes ────────────────────────────────────────────────
  app.use('/api/v1', routes)

  // ── 404 handler ───────────────────────────────────────────────
  app.use(notFoundHandler)

  // ── Global error handler ──────────────────────────────────────
  app.use(errorHandler)

  return app
}
