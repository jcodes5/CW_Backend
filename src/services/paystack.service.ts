import axios from 'axios'
import crypto from 'crypto'
import type { PaystackVerifyResponse, PaystackInitializeResponse } from '@/types'
import { logger } from '@/utils/logger'

const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? ''
const BASE_URL   = process.env.PAYSTACK_BASE_URL   ?? 'https://api.paystack.co'

const paystackClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
})

// ── Initialize a transaction (backend-driven) ───────────────────
export interface InitializePaymentParams {
  email: string
  amount: number    // in kobo (ALWAYS calculated on backend)
  reference: string
  metadata?: Record<string, unknown>
  callback_url?: string
}

export interface InitializePaymentResult {
  authorization_url: string
  access_code: string
  reference: string
}

export async function initializePayment(
  params: InitializePaymentParams
): Promise<InitializePaymentResult> {
  const { data } = await paystackClient.post<PaystackInitializeResponse>(
    '/transaction/initialize',
    {
      email: params.email,
      amount: params.amount,  // Already in kobo, from backend
      reference: params.reference,
      metadata: {
        ...params.metadata,
        // Add security metadata
        order_id: params.metadata?.orderId ?? params.reference,
        platform: 'CraftworldCentre',
      },
      callback_url: params.callback_url,
    }
  )
  
  if (!data.status) {
    throw new Error(data.message ?? 'Failed to initialize payment')
  }
  
  return data.data
}

// ── Verify a transaction reference with Paystack ──────────────
export async function verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
  const { data } = await paystackClient.get<PaystackVerifyResponse>(
    `/transaction/verify/${encodeURIComponent(reference)}`
  )
  return data
}

// ── Validate Paystack webhook signature ───────────────────────
export function validateWebhookSignature(
  rawBody: Buffer,
  signature: string
): boolean {
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET ?? ''
  
  if (!webhookSecret) {
    // SECURITY: Always require webhook secret for validation
    // In production, this will block all webhooks if not set
    logger.error('PAYSTACK_WEBHOOK_SECRET is not set — webhook validation FAILED')
    return false
  }
  
  const hash = crypto
    .createHmac('sha512', webhookSecret)
    .update(rawBody)
    .digest('hex')
  
  const isValid = hash === signature
  if (!isValid) {
    logger.warn('Invalid Paystack webhook signature')
  }
  
  return isValid
}

// ── List banks ────────────────────────────────────────────────
export async function getBanks(): Promise<Array<{ name: string; code: string }>> {
  const { data } = await paystackClient.get('/bank?country=nigeria&perPage=100')
  return data.data
}

export const paystackService = {
  initializePayment,
  verifyTransaction,
  validateWebhookSignature,
  getBanks,
}
