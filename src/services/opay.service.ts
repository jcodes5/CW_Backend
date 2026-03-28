import axios from 'axios'
import crypto from 'crypto'
import { logger } from '@/utils/logger'

const OPAY_MERCHANT_ID = process.env.OPAY_MERCHANT_ID ?? ''
const OPAY_PRIVATE_KEY = process.env.OPAY_PRIVATE_KEY ?? ''
const OPAY_BASE_URL = process.env.OPAY_BASE_URL ?? 'https://checkout.opaycheckout.com'

const opayClient = axios.create({
  baseURL: OPAY_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

// OPay uses kobo/naira like Paystack - amount is in the smallest currency unit
// But for OPay Nigeria, they typically use Naira directly (not kobo)

// ── Types ─────────────────────────────────────────────────────────
export interface OPayInitializeResult {
  checkoutUrl: string
  transactionId: string
  reference: string
}

export interface OPayVerifyResponse {
  success: boolean
  reference: string
  status: 'SUCCESS' | 'FAILED' | 'PENDING'
  amount: number
  currency: string
  customerEmail?: string
  channel?: string
  message?: string
}

export interface OPayWebhookEvent {
  eventType: string
  reference: string
  status: string
  amount: number
  currency: string
  customerEmail?: string
  channel?: string
  metadata?: Record<string, unknown>
}

// ── RSA Key Generation for OPay ───────────────────────────────
// OPay requires RSA encryption of the sensitive data
function generateSignature(payload: string): string {
  const sign = crypto.createSign('SHA256WithRSAEncryption')
  sign.update(payload)
  return sign.sign(OPAY_PRIVATE_KEY, 'base64')
}

// ── Initialize a transaction ───────────────────────────────────
export interface InitializeOPayParams {
  email: string
  amount: number    // in Naira
  reference: string
  metadata?: Record<string, unknown>
  callbackUrl?: string
  currency?: string
}

export async function initializeOPayPayment(
  params: InitializeOPayParams
): Promise<OPayInitializeResult> {
  const { email, amount, reference, metadata, callbackUrl } = params
  const currency = params.currency ?? 'NGN'

  // OPay requires a specific payload format
  const payload = {
    merchantId: OPAY_MERCHANT_ID,
    reference: reference,
    amount: amount.toString(), // OPay uses string for amount
    currency: currency,
    country: 'NG',
    customerEmail: email,
    callbackUrl: callbackUrl ?? `${process.env.FRONTEND_URL}/order-confirmation?reference=${reference}`,
    redirectUrl: `${process.env.FRONTEND_URL}/order-confirmation?reference=${reference}`,
    product: {
      description: 'CraftworldCentre Order Payment',
      quantity: 1,
    },
    metadata: {
      ...metadata,
      orderReference: reference,
      platform: 'CraftworldCentre',
    },
  }

  // Generate signature
  const payloadString = JSON.stringify(payload)
  const signature = generateSignature(payloadString)

  try {
    const response = await opayClient.post('/api/v1/order/pre-approval', payload, {
      headers: {
        'Authorization': `Bearer ${signature}`,
        'MerchantId': OPAY_MERCHANT_ID,
      },
    })

    if (response.data?.code === 'Successful') {
      return {
        checkoutUrl: response.data.data.checkoutUrl,
        transactionId: response.data.data.transactionId,
        reference: reference,
      }
    }

    throw new Error(response.data?.message ?? 'Failed to initialize OPay payment')
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }, message?: string }
    logger.error('OPay initialization error:', err.response?.data ?? err.message)
    throw new Error(err.response?.data?.message ?? err.message ?? 'Failed to initialize OPay payment')
  }
}

// ── Verify a transaction ────────────────────────────────────────
export async function verifyOPayTransaction(reference: string): Promise<OPayVerifyResponse> {
  const payload = {
    reference: reference,
    merchantId: OPAY_MERCHANT_ID,
  }

  const payloadString = JSON.stringify(payload)
  const signature = generateSignature(payloadString)

  try {
    const response = await opayClient.post('/api/v1/order/query', payload, {
      headers: {
        'Authorization': `Bearer ${signature}`,
        'MerchantId': OPAY_MERCHANT_ID,
      },
    })

    if (response.data?.code === 'Successful') {
      const data = response.data.data
      return {
        success: data.status === 'SUCCESS',
        reference: data.reference,
        status: data.status,
        amount: parseFloat(data.amount),
        currency: data.currency,
        customerEmail: data.customerEmail,
        channel: data.paymentMethod,
        message: data.status,
      }
    }

    // If transaction not found or failed
    return {
      success: false,
      reference: reference,
      status: 'FAILED',
      amount: 0,
      currency: 'NGN',
      message: response.data?.message ?? 'Transaction verification failed',
    }
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }, message?: string }
    logger.error('OPay verification error:', err.response?.data ?? err.message)
    return {
      success: false,
      reference: reference,
      status: 'FAILED',
      amount: 0,
      currency: 'NGN',
      message: err.message ?? 'Verification failed',
    }
  }
}

// ── Validate webhook signature ────────────────────────────────
export function validateOPayWebhookSignature(
  payload: string,
  signature: string
): boolean {
  try {
    const expectedSignature = generateSignature(payload)
    const expectedBuffer = Buffer.from(expectedSignature)
    const signatureBuffer = Buffer.from(signature)
    
    // Ensure both buffers are the same length before comparing
    if (expectedBuffer.length !== signatureBuffer.length) {
      return false
    }
    
    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  } catch {
    return false
  }
}

// ── List banks (for bank transfers) ────────────────────────────
export async function getOPayBanks(): Promise<Array<{ name: string; code: string }>> {
  // OPay uses standard Nigerian bank codes
  return [
    { name: 'Access Bank', code: '044' },
    { name: 'Citibank', code: '023' },
    { name: 'Diamond Bank', code: '063' },
    { name: 'Ecobank', code: '050' },
    { name: 'Fidelity Bank', code: '070' },
    { name: 'First Bank of Nigeria', code: '011' },
    { name: 'First City Monument Bank', code: '215' },
    { name: 'Guaranty Trust Bank', code: '058' },
    { name: 'Heritage Bank', code: '030' },
    { name: 'Keystone Bank', code: '082' },
    { name: 'Stanbic IBTC Bank', code: '221' },
    { name: 'Standard Chartered Bank', code: '068' },
    { name: 'Sterling Bank', code: '232' },
    { name: 'Union Bank of Nigeria', code: '032' },
    { name: 'United Bank for Africa', code: '033' },
    { name: 'Unity Bank', code: '215' },
    { name: 'Wema Bank', code: '035' },
    { name: 'Zenith Bank', code: '057' },
  ]
}

// ── Create payment link (alternative method) ─────────────────
export async function createOPayPaymentLink(
  params: InitializeOPayParams
): Promise<OPayInitializeResult> {
  return initializeOPayPayment(params)
}

export const opayService = {
  initializePayment: initializeOPayPayment,
  verifyTransaction: verifyOPayTransaction,
  validateWebhookSignature: validateOPayWebhookSignature,
  getBanks: getOPayBanks,
  createPaymentLink: createOPayPaymentLink,
}
