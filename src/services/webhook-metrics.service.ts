/**
 * Webhook Metrics Service
 * 
 * Tracks webhook performance metrics:
 * - Success rates
 * - Latency
 * - Error trends
 * - Event type breakdown
 */

import { v4 as uuidv4 } from 'uuid'
import { execute, query } from '@/config/database'
import { logger } from '@/utils/logger'

export interface WebhookMetricsParams {
  eventType: string
  status: 'success' | 'failure'
  processingTimeMs: number
  errorCode?: string
  errorMessage?: string
  retryAttempt?: number
}

export interface WebhookMetricsRecord {
  id: string
  event_type: string
  status: 'success' | 'failure'
  processing_time_ms: number
  error_code: string | null
  error_message: string | null
  retry_attempt: number | null
  created_at: Date
}

export interface WebhookMetricsSummary {
  totalEvents: number
  successCount: number
  failureCount: number
  successRate: number
  averageLatency: number
  p95Latency: number
  p99Latency: number
  minLatency: number
  maxLatency: number
  topErrors: Array<{ errorCode: string; count: number }>
}

/**
 * Initialize webhook metrics table
 */
export async function initializeWebhookMetricsTable() {
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS webhook_metrics (
        id CHAR(36) PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        status ENUM('success', 'failure') NOT NULL,
        processing_time_ms INT NOT NULL,
        error_code VARCHAR(100) NULL,
        error_message TEXT NULL,
        retry_attempt INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_event_type (event_type),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        INDEX idx_event_status (event_type, status),
        INDEX idx_processing_time (processing_time_ms)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    logger.info('✓ Webhook metrics table initialized')
  } catch (err) {
    logger.error('Failed to initialize webhook metrics table:', err)
  }
}

/**
 * Record webhook metric
 */
export async function recordWebhookMetric(params: WebhookMetricsParams): Promise<string> {
  try {
    const id = uuidv4()
    
    await execute(
      `INSERT INTO webhook_metrics 
       (id, event_type, status, processing_time_ms, error_code, error_message, retry_attempt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        params.eventType,
        params.status,
        params.processingTimeMs,
        params.errorCode || null,
        params.errorMessage || null,
        params.retryAttempt || null,
      ]
    )

    return id
  } catch (err) {
    logger.error('Failed to record webhook metric:', err)
    throw err
  }
}

/**
 * Get metrics summary for all events
 */
export async function getMetricsSummary(hours: number = 24): Promise<WebhookMetricsSummary> {
  try {
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000)

    // Get basic counts and stats
    const [stats] = await query<{
      totalEvents: number
      successCount: number
      failureCount: number
      avgLatency: number
      minLatency: number
      maxLatency: number
    }>(
      `SELECT 
        COUNT(*) as totalEvents,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failureCount,
        AVG(processing_time_ms) as avgLatency,
        MIN(processing_time_ms) as minLatency,
        MAX(processing_time_ms) as maxLatency
       FROM webhook_metrics
       WHERE created_at >= ?`,
      [startDate]
    )

    // Get percentile latencies (p95, p99)
    const [p95] = await query<{ latency: number }>(
      `SELECT processing_time_ms as latency
       FROM webhook_metrics
       WHERE created_at >= ?
       ORDER BY processing_time_ms DESC
       LIMIT 1 OFFSET ?`,
      [startDate, Math.ceil((stats?.totalEvents ?? 0) * 0.05)]
    )

    const [p99] = await query<{ latency: number }>(
      `SELECT processing_time_ms as latency
       FROM webhook_metrics
       WHERE created_at >= ?
       ORDER BY processing_time_ms DESC
       LIMIT 1 OFFSET ?`,
      [startDate, Math.ceil((stats?.totalEvents ?? 0) * 0.01)]
    )

    // Get top errors
    const topErrors = await query<{ errorCode: string; count: number }>(
      `SELECT error_code as errorCode, COUNT(*) as count
       FROM webhook_metrics
       WHERE created_at >= ? AND status = 'failure' AND error_code IS NOT NULL
       GROUP BY error_code
       ORDER BY count DESC
       LIMIT 5`,
      [startDate]
    )

    const total = stats?.totalEvents ?? 0
    const success = stats?.successCount ?? 0

    return {
      totalEvents: total,
      successCount: success,
      failureCount: (stats?.failureCount ?? 0),
      successRate: total > 0 ? (success / total) * 100 : 0,
      averageLatency: Math.round(stats?.avgLatency ?? 0),
      p95Latency: p95?.latency ?? 0,
      p99Latency: p99?.latency ?? 0,
      minLatency: stats?.minLatency ?? 0,
      maxLatency: stats?.maxLatency ?? 0,
      topErrors: topErrors || [],
    }
  } catch (err) {
    logger.error('Failed to get metrics summary:', err)
    throw err
  }
}

/**
 * Get metrics by event type
 */
export async function getMetricsByEventType(hours: number = 24): Promise<Map<string, WebhookMetricsSummary>> {
  try {
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000)

    const eventTypes = await query<{ event_type: string }>(
      `SELECT DISTINCT event_type FROM webhook_metrics WHERE created_at >= ?`,
      [startDate]
    )

    const results = new Map<string, WebhookMetricsSummary>()

    for (const { event_type } of eventTypes) {
      const [stats] = await query<{
        totalEvents: number
        successCount: number
        failureCount: number
        avgLatency: number
        minLatency: number
        maxLatency: number
      }>(
        `SELECT 
          COUNT(*) as totalEvents,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
          SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failureCount,
          AVG(processing_time_ms) as avgLatency,
          MIN(processing_time_ms) as minLatency,
          MAX(processing_time_ms) as maxLatency
         FROM webhook_metrics
         WHERE event_type = ? AND created_at >= ?`,
        [event_type, startDate]
      )

      const [p95] = await query<{ latency: number }>(
        `SELECT processing_time_ms as latency
         FROM webhook_metrics
         WHERE event_type = ? AND created_at >= ?
         ORDER BY processing_time_ms DESC
         LIMIT 1 OFFSET ?`,
        [event_type, startDate, Math.ceil((stats?.totalEvents ?? 0) * 0.05)]
      )

      const [p99] = await query<{ latency: number }>(
        `SELECT processing_time_ms as latency
         FROM webhook_metrics
         WHERE event_type = ? AND created_at >= ?
         ORDER BY processing_time_ms DESC
         LIMIT 1 OFFSET ?`,
        [event_type, startDate, Math.ceil((stats?.totalEvents ?? 0) * 0.01)]
      )

      const total = stats?.totalEvents ?? 0
      const success = stats?.successCount ?? 0

      results.set(event_type, {
        totalEvents: total,
        successCount: success,
        failureCount: stats?.failureCount ?? 0,
        successRate: total > 0 ? (success / total) * 100 : 0,
        averageLatency: Math.round(stats?.avgLatency ?? 0),
        p95Latency: p95?.latency ?? 0,
        p99Latency: p99?.latency ?? 0,
        minLatency: stats?.minLatency ?? 0,
        maxLatency: stats?.maxLatency ?? 0,
        topErrors: [],
      })
    }

    return results
  } catch (err) {
    logger.error('Failed to get metrics by event type:', err)
    return new Map()
  }
}

/**
 * Get error statistics
 */
export async function getErrorStatistics(hours: number = 24): Promise<{
  totalErrors: number
  uniqueErrorTypes: number
  errors: Array<{ errorCode: string; errorMessage: string; count: number; lastOccurred: Date }>
}> {
  try {
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000)

    const errors = await query<{
      errorCode: string
      errorMessage: string
      count: number
      lastOccurred: Date
    }>(
      `SELECT 
        error_code as errorCode,
        error_message as errorMessage,
        COUNT(*) as count,
        MAX(created_at) as lastOccurred
       FROM webhook_metrics
       WHERE status = 'failure' 
       AND created_at >= ?
       AND error_code IS NOT NULL
       GROUP BY error_code, error_message
       ORDER BY count DESC`,
      [startDate]
    )

    const totalErrors = errors.reduce((sum, e) => sum + e.count, 0)

    return {
      totalErrors,
      uniqueErrorTypes: errors.length,
      errors,
    }
  } catch (err) {
    logger.error('Failed to get error statistics:', err)
    throw err
  }
}

/**
 * Get retry statistics
 */
export async function getRetryStatistics(hours: number = 24): Promise<{
  totalRetries: number
  successfulRetries: number
  failedRetries: number
  successRetryRate: number
  averageRetriesPerEvent: number
}> {
  try {
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000)

    const [stats] = await query<{
      totalRetries: number
      successRetries: number
      failureRetries: number
      uniqueEvents: number
    }>(
      `SELECT 
        COUNT(*) as totalRetries,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successRetries,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failureRetries,
        COUNT(DISTINCT error_code) as uniqueEvents
       FROM webhook_metrics
       WHERE retry_attempt > 0
       AND created_at >= ?`,
      [startDate]
    )

    const total = stats?.totalRetries ?? 0
    const successful = stats?.successRetries ?? 0

    return {
      totalRetries: total,
      successfulRetries: successful,
      failedRetries: stats?.failureRetries ?? 0,
      successRetryRate: total > 0 ? (successful / total) * 100 : 0,
      averageRetriesPerEvent: total > 0 ? Math.round(total / (stats?.uniqueEvents ?? 1)) : 0,
    }
  } catch (err) {
    logger.error('Failed to get retry statistics:', err)
    throw err
  }
}
