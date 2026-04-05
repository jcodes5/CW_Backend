import { body, param, query, validationResult } from 'express-validator'
import type { Request, Response, NextFunction } from 'express'
import { badRequest } from '@/utils/response'

// ── Run validation and return errors ─────────────────────────
export function validate(req: Request, res: Response, next: NextFunction): void {
  const result = validationResult(req)
  if (!result.isEmpty()) {
    const errors: Record<string, string[]> = {}
    result.array().forEach((err) => {
      const field = err.type === 'field' ? err.path : 'general'
      if (!errors[field]) errors[field] = []
      errors[field].push(err.msg)
    })
    badRequest(res, 'Validation failed', errors)
    return
  }
  next()
}

// ── Auth validators ───────────────────────────────────────────
export const registerValidators = [
  body('firstName').trim().notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 100 }).withMessage('First name must be 2–100 characters')
    .matches(/^[A-Za-z\s'-]+$/).withMessage('First name may only contain letters'),

  body('lastName').trim().notEmpty().withMessage('Last name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Last name must be 2–100 characters')
    .matches(/^[A-Za-z\s'-]+$/).withMessage('Last name may only contain letters'),

  body('email').trim().normalizeEmail().isEmail().withMessage('Valid email is required'),

  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),

  body('confirmPassword').custom((val, { req }) => {
    if (val !== req.body.password) throw new Error('Passwords do not match')
    return true
  }),

  body('phone').optional().trim()
    .matches(/^(\+234|0)[789][01]\d{8}$/)
    .withMessage('Enter a valid Nigerian phone number'),
]

export const loginValidators = [
  body('email').trim().normalizeEmail().isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
]

export const forgotPasswordValidators = [
  body('email').trim().normalizeEmail().isEmail().withMessage('Valid email is required'),
]

export const resetPasswordValidators = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
]

export const changePasswordValidators = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Must contain a number'),
]

// ── Product validators ────────────────────────────────────────
export const productQueryValidators = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1–100').toInt(),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('minPrice must be >= 0').toFloat(),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('maxPrice must be >= 0').toFloat(),
  query('brand').optional().isIn(['craftworld', 'adulawo', 'planet3r']).withMessage('Invalid brand'),
  query('sort').optional().isIn(['featured', 'newest', 'price-asc', 'price-desc', 'rating'])
    .withMessage('Invalid sort option'),
]

export const createProductValidators = [
  body('name').trim().notEmpty().withMessage('Product name is required')
    .isLength({ max: 255 }).withMessage('Name too long'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('categoryId').notEmpty().withMessage('Category is required'),
  body('brandId').isIn(['craftworld', 'adulawo', 'planet3r']).withMessage('Invalid brand'),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  body('description').trim().notEmpty().withMessage('Description is required'),
]

// ── Order validators ──────────────────────────────────────────
export const createOrderValidators = [
  body('items').isArray({ min: 1 }).withMessage('Order must have at least one item'),
  body('items.*.productId').notEmpty().withMessage('Product ID is required for each item'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('shippingAddress.firstName').trim().notEmpty().withMessage('First name is required'),
  body('shippingAddress.lastName').trim().notEmpty().withMessage('Last name is required'),
  body('shippingAddress.email').isEmail().withMessage('Valid email is required'),
  body('shippingAddress.phone').matches(/^(\+234|0)[789][01]\d{8}$/).withMessage('Valid Nigerian phone required'),
  body('shippingAddress.addressLine1').trim().notEmpty().withMessage('Address is required'),
  body('shippingAddress.city').trim().notEmpty().withMessage('City is required'),
  body('shippingAddress.state').trim().notEmpty().withMessage('State is required'),
]

// ── Address validators ────────────────────────────────────────
export const addressValidators = [
  body('label').optional().isIn(['Home', 'Work', 'Other']).withMessage('Invalid label'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').matches(/^(\+234|0)[789][01]\d{8}$/).withMessage('Valid Nigerian phone required'),
  body('addressLine1').trim().notEmpty().withMessage('Address line 1 is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
]

// ── Review validators ─────────────────────────────────────────
export const reviewValidators = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1–5'),
  body('body').trim().notEmpty().isLength({ min: 10, max: 1000 })
    .withMessage('Review body must be 10–1000 characters'),
  body('title').optional().trim().isLength({ max: 200 }).withMessage('Title too long'),
]

// ── Admin review validators ───────────────────────────────────
export const adminReviewValidators = [
  body('isVerified').optional().isBoolean().withMessage('isVerified must be a boolean'),
]

// ── Newsletter validator ──────────────────────────────────────
export const newsletterValidators = [
  body('email').trim().normalizeEmail().isEmail().withMessage('Valid email is required'),
]

// ── ID param validator ────────────────────────────────────────
export const uuidParam = (name: string) => [
  param(name).isUUID().withMessage(`${name} must be a valid UUID`),
]
