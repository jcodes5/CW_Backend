import { v4 as uuidv4 } from 'uuid'
import { query, queryOne, execute, withTransaction } from '@/config/database'
import type { OrderRow, OrderItemRow, OrderStatus } from '@/types'
import { generateOrderReference } from '@/utils/crypto'
import * as ProductModel from './product.model'
import * as TrackingModel from './tracking.model'
import * as RewardsModel  from './rewards.model'

export interface CreateOrderData {
  userId:  string
  items:   Array<{ productId: string; quantity: number }>
  shippingAddress: Record<string, unknown>
  notes?:  string
  couponCode?: string
  deductStock?: boolean
}

export interface OrderWithItems extends OrderRow {
  items: Array<OrderItemRow & { product: ReturnType<typeof ProductModel.toProductDTO> }>
}

// ── Create order (transactional) ──────────────────────────────
export async function createOrder(data: CreateOrderData): Promise<OrderRow> {
  const deductStock = data.deductStock !== false // default to true for backward compatibility
  return withTransaction(async (conn) => {
    const orderId   = uuidv4()
    const reference = generateOrderReference()
    let subtotal    = 0

    // Validate stock and get product details
    const resolvedItems: Array<{
      productId: string; quantity: number; unitPrice: number; snapshot: string
    }> = []

    for (const item of data.items) {
      const [productRows] = await conn.execute(
        `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
                b.name AS brand_name, b.color AS brand_color, b.accent_color AS brand_accent_color
         FROM products p
         JOIN categories c ON c.id = p.category_id
         JOIN brands b ON b.id = p.brand_id
         WHERE p.id = ? AND p.is_active = 1${deductStock ? ' FOR UPDATE' : ''}`,
        [item.productId]
      ) as [import('@/types').ProductRow[], unknown]

      const product = productRows[0]
      if (!product) throw new Error(`Product not found: ${item.productId}`)
      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for: ${product.name}`)
      }

      if (deductStock) {
        // Decrement stock
        await conn.execute(
          'UPDATE products SET stock = stock - ? WHERE id = ?',
          [item.quantity, item.productId]
        )
      }

      const unitPrice = Number(product.price)
      subtotal += unitPrice * item.quantity

      resolvedItems.push({
        productId: item.productId,
        quantity:  item.quantity,
        unitPrice,
        snapshot:  JSON.stringify(ProductModel.toProductDTO(product)),
      })
    }

    // Calculate delivery fee
    const state        = (data.shippingAddress.state as string) ?? ''
    const deliveryFee  = getDeliveryFee(state, subtotal)
    const total        = subtotal + deliveryFee

    // Delivery estimate
    const estimatedDelivery = getDeliveryEstimate(state)

    // Insert order
    await conn.execute(
      `INSERT INTO orders
       (id, reference, user_id, status, subtotal, delivery_fee, discount, total,
        shipping_address, notes, estimated_delivery)
       VALUES (?, ?, ?, 'payment_pending', ?, ?, 0, ?, ?, ?, ?)`,
      [
        orderId, reference, data.userId,
        subtotal, deliveryFee, total,
        JSON.stringify(data.shippingAddress),
        data.notes ?? null,
        estimatedDelivery,
      ]
    )

    // Insert order items
    for (const item of resolvedItems) {
      const itemId = uuidv4()
      await conn.execute(
        `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price, snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId, orderId, item.productId,
          item.quantity, item.unitPrice,
          item.unitPrice * item.quantity,
          item.snapshot,
        ]
      )
    }

    // Record status history
    await conn.execute(
      `INSERT INTO order_status_history (id, order_id, status, note)
       VALUES (?, ?, 'payment_pending', 'Order created — awaiting payment')`,
      [uuidv4(), orderId]
    )

    const [order] = await conn.execute(
      'SELECT * FROM orders WHERE id = ?', [orderId]
    ) as [OrderRow[], unknown]

    return order[0]
  })
}

// ── Find order by ID ───────────────────────────────────────
export async function findById(id: string): Promise<OrderRow | null> {
  return queryOne<OrderRow>(
    'SELECT * FROM orders WHERE id = ? LIMIT 1',
    [id]
  )
}

// ── Find order by reference ───────────────────────────────────
export async function findByReference(reference: string): Promise<OrderRow | null> {
  return queryOne<OrderRow>(
    'SELECT * FROM orders WHERE reference = ? LIMIT 1',
    [reference]
  )
}

// ── Get order with items ──────────────────────────────────────
export async function getOrderWithItems(reference: string): Promise<OrderWithItems | null> {
  const order = await findByReference(reference)
  if (!order) return null

  const itemRows = await query<OrderItemRow & { snapshot: string }>(
    `SELECT oi.*, p.id AS pid
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?
     ORDER BY oi.created_at`,
    [order.id]
  )

  const items = itemRows.map((row) => {
    let product: ReturnType<typeof ProductModel.toProductDTO>
    try {
      product = JSON.parse(row.snapshot)
    } catch {
      product = { id: row.product_id } as ReturnType<typeof ProductModel.toProductDTO>
    }
    return { ...row, product }
  })

  return { ...order, items }
}

// ── List user orders ──────────────────────────────────────────
export async function listUserOrders(
  userId: string,
  page = 1,
  limit = 10
): Promise<{ rows: OrderRow[]; total: number }> {
  const offset = (page - 1) * limit

  const [rows, count] = await Promise.all([
    query<OrderRow>(
      `SELECT * FROM orders WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    ),
    query<{ total: number }>(
      'SELECT COUNT(*) AS total FROM orders WHERE user_id = ?',
      [userId]
    ),
  ])

  return { rows, total: count[0]?.total ?? 0 }
}

// ── Update order status ───────────────────────────────────────
export async function updateStatus(
  orderId: string,
  status: OrderStatus,
  note?: string,
  changedBy?: string
): Promise<void> {
  await execute(
    'UPDATE orders SET status = ? WHERE id = ?',
    [status, orderId]
  )
  await execute(
    `INSERT INTO order_status_history (id, order_id, status, note, changed_by)
     VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), orderId, status, note ?? null, changedBy ?? null]
  )
  // Auto-generate tracking event
  await TrackingModel.generateStatusEvent(orderId, status)
}

// ── Confirm payment ───────────────────────────────────────────
export async function confirmPayment(
  orderId: string,
  paystackRef: string,
  channel: string
): Promise<void> {
  await execute(
    `UPDATE orders
     SET status = 'confirmed', paystack_ref = ?, payment_channel = ?
     WHERE id = ?`,
    [paystackRef, channel, orderId]
  )
  await execute(
    `INSERT INTO order_status_history (id, order_id, status, note)
     VALUES (?, ?, 'confirmed', 'Payment verified via Paystack')`,
    [uuidv4(), orderId]
  )
  // Auto-generate tracking event
  await TrackingModel.generateStatusEvent(orderId, 'confirmed')
  // Award loyalty points
  const order = await queryOne<OrderRow>('SELECT * FROM orders WHERE id = ?', [orderId])
  if (order) {
    await RewardsModel.awardOrderPoints(order.user_id, orderId, Number(order.total)).catch(() => {})
  }
}

// ── Deduct stock for order items ──────────────────────────────
export async function deductStockForOrder(orderId: string): Promise<void> {
  return withTransaction(async (conn) => {
    // Get order items
    const [itemRows] = await conn.execute(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
      [orderId]
    ) as [Array<{ product_id: string; quantity: number }>, unknown]

    // Deduct stock for each item
    for (const item of itemRows) {
      await conn.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.product_id]
      )
    }
  })
}

// ── Cancel order ──────────────────────────────────────────────
export async function cancelOrder(orderId: string, userId: string): Promise<boolean> {
  const order = await queryOne<OrderRow>(
    `SELECT * FROM orders WHERE id = ? AND user_id = ? LIMIT 1`,
    [orderId, userId]
  )

  if (!order) return false

  const cancellable = ['pending', 'payment_pending', 'payment_failed', 'confirmed']
  if (!cancellable.includes(order.status)) return false

  await updateStatus(orderId, 'cancelled', 'Cancelled by customer')

  // Restore stock
  const items = await query<OrderItemRow>(
    'SELECT * FROM order_items WHERE order_id = ?', [orderId]
  )
  for (const item of items) {
    await execute(
      'UPDATE products SET stock = stock + ? WHERE id = ?',
      [item.quantity, item.product_id]
    )
  }

  return true
}

// ── Admin: list all orders ────────────────────────────────────
export async function listAllOrders(
  page = 1,
  limit = 20,
  status?: OrderStatus
): Promise<{ rows: OrderRow[]; total: number }> {
  const offset = (page - 1) * limit
  const where  = status ? 'WHERE o.status = ?' : ''
  const params: unknown[] = status ? [status, limit, offset] : [limit, offset]

  const [rows, count] = await Promise.all([
    query<OrderRow>(
      `SELECT o.*, u.first_name, u.last_name, u.email
       FROM orders o
       JOIN users u ON u.id = o.user_id
       ${where}
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      params
    ),
    query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM orders o ${where}`,
      status ? [status] : []
    ),
  ])

  return { rows, total: count[0]?.total ?? 0 }
}

// ── Map to DTO ────────────────────────────────────────────────
export function toOrderDTO(order: OrderRow) {
  let address: Record<string, unknown> = {}
  try { address = JSON.parse(order.shipping_address) } catch { /**/ }

  return {
    id:              order.id,
    reference:       order.reference,
    status:          order.status,
    pricing: {
      subtotal:    Number(order.subtotal),
      deliveryFee: Number(order.delivery_fee),
      discount:    Number(order.discount),
      total:       Number(order.total),
    },
    paymentMethod:   order.payment_method,
    paymentChannel:  order.payment_channel ?? undefined,
    shippingAddress: address,
    notes:           order.notes ?? undefined,
    estimatedDelivery: order.estimated_delivery ?? undefined,
    createdAt:       order.created_at,
    updatedAt:       order.updated_at,
  }
}

// ── Helpers ───────────────────────────────────────────────────
function getDeliveryFee(state: string, subtotal: number): number {
  if (subtotal >= 25000) return 0
  const feeMap: Record<string, number> = {
    Lagos: 2000, Ogun: 2500, Oyo: 3000, Osun: 3000, Ekiti: 3500,
    Ondo: 3500, 'FCT - Abuja': 3500, Rivers: 4000, Edo: 3500, Delta: 3500,
    Anambra: 4000, Enugu: 4000, Imo: 4000, Abia: 4000, Kano: 4500, Kaduna: 4500,
  }
  return feeMap[state] ?? 5000
}

function getDeliveryEstimate(state: string): string {
  const days = ['Lagos', 'Ogun'].includes(state)
    ? 2 : ['Oyo', 'Osun', 'Ekiti', 'Ondo', 'FCT - Abuja', 'Rivers', 'Edo', 'Delta'].includes(state)
    ? 4 : 7
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}
