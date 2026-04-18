import { execute } from '@/config/database'
import { logger } from '@/utils/logger'

export async function cleanupExpiredTokens(): Promise<void> {
  try {
    const result = await execute(
      'UPDATE users SET verify_token = NULL, verify_token_expires = NULL WHERE verify_token_expires < NOW() AND is_verified = 0'
    )
    logger.info(`Cleaned up ${result.affectedRows} expired verification tokens`)
  } catch (err) {
    logger.error('Failed to cleanup expired tokens:', err)
  }
}