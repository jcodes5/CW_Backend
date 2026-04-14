/**
 * Webhook Logging Service
 * 
 * Logs all webhook events to a separate table for:
 * - Audit trail
 * - Debugging
 * - Analytics
 * - Compliance
 */

import { v4 as uuidv4 } from 'uuid'
import { execute, query } from '@/config/database'
import { logger } from '@/utils/logger'

export interface WebhookLogParams {
  eventType: string
  eventId: string | null
  reference: string
  status: 'received' | 'validated' | 'processed' | 'failed' | 'duplicate'
  payload?: Record<string, any>
  error?: string
  processingTimeMs?: number
  metadata?: Record<string, any>
}

export interface WebhookLogRecord {
  id: string
  event_type: string
  event_id: string | null
  reference: string
  status: 'received' | 'validated' | 'processed' | 'failed' | 'duplicate'
  payload: string | null
  error: string | null
  processing_time_ms: number | null
  metadata: string | null
  created_at: Date
}

/**
 * Initialize webhook logs table
 */
export async function initializeWebhookLogsTable() {
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id CHAR(36) PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        event_id VARCHAR(255) NULL,
        reference VARCHAR(100) NOT NULL,
        status ENUM('received', 'validated', 'processed', 'failed', 'duplicate') NOT NULL,
        payload LONGTEXT NULL,
        error TEXT NULL,
        processing_time_ms INT NULL,
        metadata JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_reference (reference),
        INDEX idx_event_id (event_id),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        INDEX idx_event_type (event_type),
        UNIQUE KEY unique_event_dedup (event_id),
        FOREIGN KEY (reference) REFERENCES orders(reference) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    logger.info('✓ Webhook logs table initialized')
  } catch (err) {
    logger.error('Failed to initialize webhook logs table:', err)
  }
}

/**
 * Log a webhook event
 */
export async function logWebhookEvent(params: WebhookLogParams): Promise<string> {
  try {
    const id = uuidv4()
    
    await execute(
      `INSERT INTO webhook_logs 
       (id, event_type, event_id, reference, status, payload, error, processing_time_ms, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        params.eventType,
        params.eventId,
        params.reference,
        params.status,
        params.payload ? JSON.stringify(params.payload) : null,
        params.error || null,
        params.processingTimeMs || null,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ]
    )

    return id
  } catch (err) {
    logger.error('Failed to log webhook event:', err)
    throw err
  }
}

/**
 * Get webhook logs for a specific reference
 */
export async function getWebhookLogsForReference(reference: string): Promise<WebhookLogRecord[]> {
  try {
    const logs = await query<WebhookLogRecord>(
      `SELECT * FROM webhook_logs 
       WHERE reference = ? 
       ORDER BY created_at DESC`,
      [reference]
    )
    return logs
  } catch (err) {
    logger.error('Failed to get webhook logs:', err)
    return []
  }
}

/**
 * Get recent webhook logs
 */
export async function getRecentWebhookLogs(limit: number = 100): Promise<WebhookLogRecord[]> {
  try {
    const logs = await query<WebhookLogRecord>(
      `SELECT * FROM webhook_logs 
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    )
    return logs
  } catch (err) {
    logger.error('Failed to get recent webhook logs:', err)
    return []
  }
}

/**
 * Get webhook logs by status
 */
export async function getWebhookLogsByStatus(
  status: WebhookLogParams['status'],
  limit: number = 100
): Promise<WebhookLogRecord[]> {
  try {
    const logs = await query<WebhookLogRecord>(
      `SELECT * FROM webhook_logs 
       WHERE status = ? 
       ORDER BY created_at DESC
       LIMIT ?`,
      [status, limit]
    )
    return logs
  } catch (err) {
    logger.error('Failed to get webhook logs by status:', err)
    return []
  }
}

/**
 * Get webhook event details
 */
export async function getWebhookEventDetails(eventId: string): Promise<WebhookLogRecord | null> {
  try {
    const logs = await query<WebhookLogRecord>(
      `SELECT * FROM webhook_logs 
       WHERE event_id = ? 
       LIMIT 1`,
      [eventId]
    )
    return logs[0] || null
  } catch (err) {
    logger.error('Failed to get webhook event details:', err)
    return null
  }
}

/**
 * Get webhook logs for a date range
 */
export async function getWebhookLogsForDateRange(
  startDate: Date,
  endDate: Date
): Promise<WebhookLogRecord[]> {
  try {
    const logs = await query<WebhookLogRecord>(
      `SELECT * FROM webhook_logs 
       WHERE created_at BETWEEN ? AND ? 
       ORDER BY created_at DESC`,
      [startDate, endDate]
    )
    return logs
  } catch (err) {
    logger.error('Failed to get webhook logs for date range:', err)
    return []
  }
}
