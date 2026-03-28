/**
 * Unified Payment Service
 * Supports both Paystack and OPay based on configuration
 */

import * as paystackService from './paystack.service'
import * as opayService from './opay.service'
import { logger } from '@/utils/logger'

const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER ?? 'paystack'

export type PaymentProvider = 'paystack' | 'opay'

// Get the current payment provider
export function getPaymentProvider(): PaymentProvider {
  return PAYMENT_PROVIDER as PaymentProvider
}

// Initialize payment based on configured provider
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
  if (PAYMENT_PROVIDER === 'opay') {
    logger.info(`Initializing OPay payment for ${params.reference}`)
    const result = await opayService.initializeOPayPayment({
      ...params,
      amount: Math.round(params.amount / 100), // Convert from kobo to naira if needed
    })
    return {
      authorizationUrl: result.checkoutUrl,
      reference: result.reference,
    }
  }

  // Default to Paystack
  logger.info(`Initializing Paystack payment for ${params.reference}`)
  const result = await paystackService.initializePayment(params)
  return {
    authorizationUrl: result.authorization_url,
    reference: result.reference,
  }
}

// Verify payment based on configured provider
export async function verifyPayment(reference: string): Promise<{
  success: boolean
  status: 'success' | 'failed' | 'pending'
  amount: number
  email?: string
  channel?: string
}> {
  if (PAYMENT_PROVIDER === 'opay') {
    logger.info(`Verifying OPay payment for ${reference}`)
    const result = await opayService.verifyOPayTransaction(reference)
    return {
      success: result.success,
      status: result.status === 'SUCCESS' ? 'success' : result.status === 'PENDING' ? 'pending' : 'failed',
      amount: result.amount,
      email: result.customerEmail,
      channel: result.channel,
    }
  }

  // Default to Paystack
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

// Validate webhook signature based on configured provider
export function validateWebhookSignature(
  payload: Buffer | string,
  signature: string
): boolean {
  if (PAYMENT_PROVIDER === 'opay') {
    return opayService.validateOPayWebhookSignature(
      typeof payload === 'string' ? payload : payload.toString(),
      signature
    )
  }

  // Default to Paystack
  return paystackService.validateWebhookSignature(
    typeof payload === 'string' ? Buffer.from(payload) : payload,
    signature
  )
}

// Get webhook header name based on provider
export function getWebhookHeaderName(): string {
  if (PAYMENT_PROVIDER === 'opay') {
    return 'x-opay-signature'
  }
  return 'x-paystack-signature'
}

// Get list of banks based on configured provider
export async function getBanks(): Promise<Array<{ name: string; code: string }>> {
  if (PAYMENT_PROVIDER === 'opay') {
    return opayService.getOPayBanks()
  }
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
