/**
 * Unified Payment Service
 * Supports only Paystack payment gateway
 */

import * as paystackService from './paystack.service'
import { logger } from '@/utils/logger'

// Fixed to Paystack as the only payment provider
const PAYMENT_PROVIDER = 'paystack' as const

export type PaymentProvider = 'paystack'

// Get the current payment provider
export function getPaymentProvider(): PaymentProvider {
  return PAYMENT_PROVIDER
}

// Initialize payment with Paystack
export async function initializePayment(params: {
  email: string
  amount: number
  reference: string
  metadata?: Record<string, unknown>
  callbackUrl?: string
}): Promise<{
  authorizationUrl: string
  reference: string
}> {
  logger.info(`Initializing Paystack payment for ${params.reference}`)
  const result = await paystackService.initializePayment(params)
  return {
    authorizationUrl: result.authorization_url,
    reference: result.reference,
  }
}

// Verify payment with Paystack
export async function verifyPayment(reference: string): Promise<{
  success: boolean
  status: 'success' | 'failed' | 'pending'
  amount: number
  email?: string
  channel?: string
}> {
  logger.info(`Verifying Paystack payment for ${reference}`)
  const result = await paystackService.verifyTransaction(reference)
  const paystackStatus = result.data.status
  let normalizedStatus: 'success' | 'failed' | 'pending' = 'failed'
  if (paystackStatus === 'success') {
    normalizedStatus = 'success'
  } else if (paystackStatus === 'abandoned') {
    normalizedStatus = 'pending'
  }
  return {
    success: paystackStatus === 'success',
    status: normalizedStatus,
    amount: result.data.amount / 100, // Convert from kobo
    email: result.data.customer?.email,
    channel: result.data.channel,
  }
}

// Validate webhook signature for Paystack
export function validateWebhookSignature(
  payload: Buffer | string,
  signature: string
): boolean {
  return paystackService.validateWebhookSignature(
    typeof payload === 'string' ? Buffer.from(payload) : payload,
    signature
  )
}

// Get webhook header name for Paystack
export function getWebhookHeaderName(): string {
  return 'x-paystack-signature'
}

// Get list of banks from Paystack
export async function getBanks(): Promise<Array<{ name: string; code: string }>> {
  return paystackService.getBanks()
}

export const paymentService = {
  getPaymentProvider,
  initializePayment,
  verifyPayment,
  validateWebhookSignature,
  getWebhookHeaderName,
  getBanks,
}