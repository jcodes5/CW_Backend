/**
 * Webhook Retry & Recovery System
 * 
 * Provides utilities for:
 * - Retrying failed webhook events with exponential backoff
 * - Manual payment confirmation (admin)
 * - Payment status inspection
 * - Idempotent reprocessing
 */

import { query, execute } from '@/config/database'
import * as OrderModel from '@/models/order.model'
import { logger } from '@/utils/logger'

// Config
const MAX_RETRIES = 5
const INITIAL_BACKOFF_MS = 1000 // Start with 1s
const MAX_BACKOFF_MS = 3600000 // Max 1 hour between retries (for safety)
const BACKOFF_MULTIPLIER = 2 // Exponential multiplier (jitter added)
const JITTER_FACTOR = 0.1 // Add 10% random jitter to prevent thundering herd

interface WebhookRetryRecord {
  id: string
  webhook_event_id: string
  order_id: string
  reference: string
  attempt: number
  max_attempts: number
  last_error: string | null
  next_retry_at: Date | null
  status: 'pending' | 'success' | 'failed' | 'abandoned'
  created_at: Date
  updated_at: Date
}

/**
 * Calculate next retry delay with exponential backoff and jitter
 */
export function calculateBackoffDelay(attempt: number): number {
  // Formula: INITIAL_BACKOFF_MS * (BACKOFF_MULTIPLIER ^ (attempt - 1)) + jitter
  const exponentialDelay = INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1)
  
  // Add jitter (10% random)
  const jitter = exponentialDelay * JITTER_FACTOR * (Math.random() * 2 - 1)
  let delay = exponentialDelay + jitter
  
  // Cap at maximum
  delay = Math.min(delay, MAX_BACKOFF_MS)
  
  // Ensure positive
  delay = Math.max(delay, INITIAL_BACKOFF_MS)
  
  return Math.round(delay)
}

/**
 * Initialize webhook retry table (if not exists)
 */
export async function initializeRetryTable() {
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS webhook_retries (
        id CHAR(36) PRIMARY KEY,
        webhook_event_id VARCHAR(255) NULL UNIQUE,
        order_id CHAR(36) NOT NULL,
        reference VARCHAR(50) NOT NULL,
        attempt INT NOT NULL DEFAULT 1,
        max_attempts INT NOT NULL DEFAULT ${MAX_RETRIES},
        last_error TEXT NULL,
        next_retry_at DATETIME NULL,
        status ENUM('pending', 'success', 'failed', 'abandoned') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_reference (reference),
        INDEX idx_status (status),
        INDEX idx_next_retry (next_retry_at),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    logger.info('✓ Webhook retry table initialized')
  } catch (err) {
    logger.error('Failed to initialize webhook retry table:', err)
  }
}

/**
 * Record a webhook retry attempt
 */
export async function recordRetryAttempt(
  webhookEventId: string,
  orderId: string,
  reference: string,
  error: string | null = null
): Promise<void> {
  try {
    const { v4: uuidv4 } = require('uuid')
    const retryId = uuidv4()
    const attempt = 1
    const backoffDelay = calculateBackoffDelay(attempt)
    const nextRetryAt = new Date(Date.now() + backoffDelay)

    await execute(
      `INSERT INTO webhook_retries 
       (id, webhook_event_id, order_id, reference, attempt, max_attempts, last_error, next_retry_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [retryId, webhookEventId, orderId, reference, attempt, MAX_RETRIES, error, nextRetryAt]
    )

    logger.info(
      `Recorded retry attempt #${attempt} for ${reference} - next retry in ${backoffDelay}ms`
    )
  } catch (err) {
    logger.error('Failed to record retry attempt:', err)
  }
}

/**
 * Get pending webhooks to retry
 */
export async function getPendingRetries(): Promise<WebhookRetryRecord[]> {
  try {
    const rows = await query<WebhookRetryRecord>(
      `SELECT * FROM webhook_retries 
       WHERE status = 'pending' 
       AND attempt < max_attempts
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
       ORDER BY next_retry_at ASC
       LIMIT 10`
    )
    return rows
  } catch (err) {
    logger.error('Failed to get pending retries:', err)
    return []
  }
}

/**
 * Update retry status
 */
export async function updateRetryStatus(
  retryId: string,
  status: 'pending' | 'success' | 'failed' | 'abandoned',
  error: string | null = null
): Promise<void> {
  try {
    // Get current attempt number
    const [record] = await query<{ attempt: number; max_attempts: number }>(
      'SELECT attempt, max_attempts FROM webhook_retries WHERE id = ?',
      [retryId]
    )

    if (!record) {
      logger.warn(`Retry record not found: ${retryId}`)
      return
    }

    const { attempt, max_attempts } = record
    let nextRetry: Date | null = null

    // Calculate next retry if failed and attempts remaining
    if (status === 'failed' && (attempt + 1) < max_attempts) {
      const nextAttempt = attempt + 1
      const backoffDelay = calculateBackoffDelay(nextAttempt)
      nextRetry = new Date(Date.now() + backoffDelay)
      
      logger.info(
        `Retry attempt #${attempt} failed - scheduling retry #${nextAttempt} in ${backoffDelay}ms`
      )
    }

    // Mark as abandoned if max retries exceeded
    const finalStatus = status === 'failed' && (attempt + 1) >= max_attempts
      ? 'abandoned'
      : status

    await execute(
      `UPDATE webhook_retries 
       SET status = ?, last_error = ?, next_retry_at = ?, attempt = ?, updated_at = NOW()
       WHERE id = ?`,
      [finalStatus, error, nextRetry, attempt + 1, retryId]
    )

    if (finalStatus === 'abandoned') {
      logger.warn(`Webhook retry abandoned after ${attempt} attempts: ${error}`)
    }
  } catch (err) {
    logger.error('Failed to update retry status:', err)
  }
}

/**
 * Manual payment confirmation endpoint (admin only)
 * 
 * Use cases:
 * - Payment webhook failed multiple times
 * - Manual verification of payment receipt
 * - Override for edge cases
 */
export async function manuallyConfirmPayment(
  reference: string,
  channel: string = 'manual_override',
  notes: string = ''
): Promise<{
  success: boolean
  message: string
  order?: any
}> {
  try {
    const order = await OrderModel.findByReference(reference)
    
    if (!order) {
      return { success: false, message: `Order not found: ${reference}` }
    }

    if (order.status === 'confirmed') {
      return {
        success: true,
        message: `Order already confirmed: ${reference}`,
        order: order,
      }
    }

    // Confirm payment
    await OrderModel.confirmPayment(
      order.id,
      reference,
      channel
    )

    // Add note if provided
    if (notes) {
      await execute(
        'UPDATE orders SET notes = CONCAT(notes, ?, ?) WHERE id = ?',
        ['\n[ADMIN OVERRIDE] ', notes, order.id]
      )
    }

    logger.info(`✓ Manual payment confirmation for ${reference}`)

    return {
      success: true,
      message: `Payment confirmed manually: ${reference}`,
      order: order,
    }
  } catch (err) {
    logger.error('Manual payment confirmation error:', err)
    return {
      success: false,
      message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Get payment status details (for debugging/admin)
 */
export async function getPaymentDiagnostics(reference: string): Promise<{
  order: any
  webhook?: WebhookRetryRecord
  diagnostics: Record<string, any>
}> {
  try {
    const order = await OrderModel.findByReference(reference)
    
    if (!order) {
      throw new Error(`Order not found: ${reference}`)
    }

    const webhook = await query<WebhookRetryRecord>(
      'SELECT * FROM webhook_retries WHERE reference = ? ORDER BY created_at DESC LIMIT 1',
      [reference]
    )

    return {
      order,
      webhook: webhook[0],
      diagnostics: {
        reference,
        status: order.status,
        paymentMethod: order.payment_method,
        paystack_ref: order.paystack_ref,
        webhook_event_id: order.webhook_event_id,
        webhook_processed_at: order.webhook_processed_at,
        total: order.total,
        created: order.created_at,
        updated: order.updated_at,
      },
    }
  } catch (err) {
    throw new Error(`Diagnostics error: ${err instanceof Error ? err.message : 'Unknown'}`)
  }
}
