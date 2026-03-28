import { v4 as uuidv4 } from 'uuid'
import { query, execute } from '@/config/database'

export interface TrackingEvent {
  id: string; orderId: string; status: string; title: string
  description?: string; location?: string; createdAt: Date
}

// ── Get tracking timeline for an order ───────────────────────
export async function getTimeline(orderId: string): Promise<TrackingEvent[]> {
  const rows = await query<{
    id: string; order_id: string; status: string; title: string
    description: string | null; location: string | null; created_at: Date
  }>(
    `SELECT * FROM order_tracking WHERE order_id = ? ORDER BY created_at ASC`,
    [orderId]
  )
  return rows.map((r) => ({
    id: r.id, orderId: r.order_id, status: r.status, title: r.title,
    description: r.description ?? undefined, location: r.location ?? undefined,
    createdAt: r.created_at,
  }))
}

// ── Add tracking event ────────────────────────────────────────
export async function addEvent(
  orderId: string,
  status: string,
  title: string,
  description?: string,
  location?: string
): Promise<void> {
  await execute(
    `INSERT INTO order_tracking (id, order_id, status, title, description, location)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), orderId, status, title, description ?? null, location ?? null]
  )
}

// ── Auto-generate tracking events when status changes ─────────
export async function generateStatusEvent(
  orderId: string,
  status: string
): Promise<void> {
  const EVENTS: Record<string, { title: string; description: string; location?: string }> = {
    payment_pending: {
      title:       'Order Placed',
      description: 'Your order has been placed and is awaiting payment confirmation.',
    },
    confirmed: {
      title:       'Payment Confirmed',
      description: 'Payment received and verified. Your order is now being prepared.',
      location:    'CraftworldCentre Fulfilment Centre, Lagos',
    },
    processing: {
      title:       'Order Being Processed',
      description: 'Our team is carefully packing your circular economy products.',
      location:    'CraftworldCentre Warehouse, Lagos',
    },
    shipped: {
      title:       'Order Shipped',
      description: 'Your order is on its way! Our delivery partner has picked it up.',
      location:    'In Transit',
    },
    delivered: {
      title:       'Order Delivered',
      description: 'Your order has been delivered. Enjoy your circular products!',
    },
    cancelled: {
      title:       'Order Cancelled',
      description: 'This order has been cancelled. Any payment will be refunded within 5–7 business days.',
    },
    refunded: {
      title:       'Refund Processed',
      description: 'Your refund has been processed and will appear in your account within 2–3 business days.',
    },
  }

  const event = EVENTS[status]
  if (event) {
    await addEvent(orderId, status, event.title, event.description, event.location)
  }
}
