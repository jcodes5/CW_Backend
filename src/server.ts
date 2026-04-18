import 'dotenv/config'
import 'tsconfig-paths/register'
import http from 'http'
import { createApp } from './app'
import { testDatabaseConnection } from './config/database'
import { initSocket } from './sockets'
import { cleanupExpiredTokens } from './services/cleanup.service'
import { logger } from './utils/logger'

const PORT = parseInt(process.env.PORT ?? '5000', 10)
const ENV  = process.env.NODE_ENV ?? 'development'

async function bootstrap(): Promise<void> {
  // ── 1. Verify database connection ────────────────────────────
  await testDatabaseConnection()

  // ── 2. Create Express app ─────────────────────────────────────
  const app = createApp()

  // ── 3. Create HTTP server ─────────────────────────────────────
  const httpServer = http.createServer(app)

  // ── 4. Attach Socket.io ───────────────────────────────────────
  const io = initSocket(httpServer)
  app.set('io', io)

  // ── 5. Listen ────────────────────────────────────────────────
  httpServer.listen(PORT, () => {
    logger.info(`
╔════════════════════════════════════════════════════════╗
║          CraftworldCentre API Server                   ║
╠════════════════════════════════════════════════════════╣
║  Status      : Running ✓                               ║
║  Environment : ${ENV.padEnd(38)} ║
║  Port        : ${String(PORT).padEnd(38)} ║
║  API Base    : http://localhost:${PORT}/api/v1          ║
║  API Docs    : http://localhost:${PORT}/api/docs        ║
╚════════════════════════════════════════════════════════╝
    `.trim())
  })

  // ── 6. Start cleanup jobs ─────────────────────────────────────
  // Run cleanup every 6 hours
  setInterval(cleanupExpiredTokens, 6 * 60 * 60 * 1000)

  // ── 7. Graceful shutdown ──────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal} — shutting down gracefully`)
    httpServer.close(() => {
      logger.info('HTTP server closed')
      process.exit(0)
    })
    setTimeout(() => {
      logger.error('Forced shutdown after timeout')
      process.exit(1)
    }, 10000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection:', reason)
  })

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err)
    process.exit(1)
  })
}

bootstrap().catch((err) => {
  logger.error('Failed to start server:', err)
  process.exit(1)
})
