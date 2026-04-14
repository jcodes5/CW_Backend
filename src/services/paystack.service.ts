import axios from 'axios'
import crypto from 'crypto'
import type { PaystackVerifyResponse, PaystackInitializeResponse } from '@/types'
import { logger } from '@/utils/logger'

const SECRET_KEY = (process.env.PAYSTACK_SECRET_KEY ?? '').trim()
const BASE_URL = (process.env.PAYSTACK_BASE_URL ?? 'https://api.paystack.co').trim()

if (!SECRET_KEY) {
  logger.warn('PAYSTACK_SECRET_KEY is not configured - wallet deposits will fail')
} else if (!/^sk_(test|live)_/.test(SECRET_KEY)) {
  logger.warn('PAYSTACK_SECRET_KEY format looks invalid. Expected sk_test_... or sk_live_...')
}

const paystackClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
})

paystackClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const message =
        (error.response?.data as { message?: string } | undefined)?.message ?? error.message

      if (status === 401 || status === 403) {
        logger.error(`Paystack auth failed (${status}): ${message}`)
        throw new Error('Paystack authentication failed. Check PAYSTACK_SECRET_KEY.')
      }

      if (error.code === 'ECONNABORTED') {
        throw new Error('Paystack API request timeout.')
      }

      throw new Error(`Paystack API error (${status ?? 'unknown'}): ${message}`)
    }

    throw error
  }
)

export interface InitializePaymentParams {
  email: string
  amount: number // in kobo
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
  if (!SECRET_KEY) {
    throw new Error('Paystack is not configured - PAYSTACK_SECRET_KEY is missing')
  }

  const orderId = params.metadata?.['orderId'] ?? params.reference

  const { data } = await paystackClient.post<PaystackInitializeResponse>(
    '/transaction/initialize',
    {
      email: params.email,
      amount: params.amount,
      reference: params.reference,
      metadata: {
        ...params.metadata,
        order_id: orderId,
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

export async function verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
  const { data } = await paystackClient.get<PaystackVerifyResponse>(
    `/transaction/verify/${encodeURIComponent(reference)}`
  )
  return data
}

export function validateWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const secret = (process.env.PAYSTACK_SECRET_KEY ?? '').trim()
  if (!secret || !signature) return false

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex')

  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')

  if (sigBuf.length !== expBuf.length) return false
  return crypto.timingSafeEqual(sigBuf, expBuf)
}

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
