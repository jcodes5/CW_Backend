import { Server as HttpServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { verifyAccessToken } from '@/utils/jwt'
import { logger } from '@/utils/logger'

interface ClientToServerEvents {
  'admin:join_dashboard': () => void
  'order:track':          (reference: string) => void
  'order:untrack':        (reference: string) => void
}

interface ServerToClientEvents {
  'order:confirmed':       (data: { orderId: string; reference: string; total: number }) => void
  'order:status_updated':  (data: { reference: string; status: string }) => void
  'order:shipped':         (data: { reference: string; trackingNumber?: string }) => void
  'product:stock_updated': (data: { productId: string; stock: number }) => void
  'admin:new_order':       (data: { order: Record<string, unknown> }) => void
  'admin:stats_updated':   (data: { metric: string; value: number }) => void
  'notification':          (data: { type: string; message: string }) => void
}

export function initSocket(httpServer: HttpServer): SocketServer {
  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin:      process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
      methods:     ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout:  10000,
    pingInterval: 25000,
  })

  // ── Auth middleware ────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined

    if (token) {
      try {
        const payload = verifyAccessToken(token)
        socket.data.user = payload
      } catch {
        // Not authenticated — allow connection but restrict admin rooms
      }
    }

    next()
  })

  // ── Connection handler ─────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.data.user?.userId
    const role   = socket.data.user?.role

    logger.debug(`Socket connected: ${socket.id}${userId ? ` (user: ${userId})` : ' (guest)'}`)

    // Authenticated users join their personal room
    if (userId) {
      socket.join(`user:${userId}`)
    }

    // Admin joins admin room
    socket.on('admin:join_dashboard', () => {
      if (role !== 'admin') {
        socket.emit('notification', { type: 'error', message: 'Unauthorized' })
        return
      }
      socket.join('admin')
      logger.debug(`Admin joined dashboard: ${socket.id}`)
    })

    // Track a specific order (for order tracking page)
    socket.on('order:track', (reference) => {
      socket.join(`order:${reference}`)
    })

    socket.on('order:untrack', (reference) => {
      socket.leave(`order:${reference}`)
    })

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${socket.id} (${reason})`)
    })
  })

  // ── Emit helpers (attached to io instance) ────────────────
  const emit = {
    orderConfirmed: (data: { orderId: string; reference: string; total: number; userId: string }) => {
      // Notify the specific user
      io.to(`user:${data.userId}`).emit('order:confirmed', data)
      // Notify admin dashboard
      io.to('admin').emit('admin:new_order', { order: data as Record<string, unknown> })
      // Notify order-specific room
      io.to(`order:${data.reference}`).emit('order:confirmed', data)
    },

    orderStatusUpdated: (data: { reference: string; status: string; userId: string }) => {
      io.to(`user:${data.userId}`).emit('order:status_updated', data)
      io.to('admin').emit('order:status_updated', data)
      io.to(`order:${data.reference}`).emit('order:status_updated', data)
    },

    stockUpdated: (productId: string, stock: number) => {
      io.to('admin').emit('product:stock_updated', { productId, stock })
    },

    adminStats: (metric: string, value: number) => {
      io.to('admin').emit('admin:stats_updated', { metric, value })
    },
  }

  // Attach emit helpers to io for use in controllers
  ;(io as SocketServer & { emit_helpers: typeof emit }).emit_helpers = emit

  logger.info('✓ Socket.io initialised')
  return io
}
