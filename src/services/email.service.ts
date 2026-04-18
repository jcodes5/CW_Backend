import { Resend } from 'resend'
import { logger } from '@/utils/logger'

// ── Resend client ─────────────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY ?? '')

const FROM    = process.env.EMAIL_FROM    ?? 'CraftworldCentre <no-reply@craftworldcentre.com>'
const SUPPORT = process.env.EMAIL_SUPPORT ?? 'hello@craftworldcentre.com'
const FE_URL  = process.env.FRONTEND_URL  ?? 'http://localhost:3000'

// ── Brand header/footer shared HTML ──────────────────────────
function emailShell(bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { font-family: 'DM Sans', Arial, sans-serif; background: #f8fafb; margin: 0; padding: 0; color: #0d1f22; }
  .wrap { max-width: 580px; margin: 32px auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,.07); }
  .header { background: linear-gradient(135deg, #0d1f22 0%, #1A7A8A 100%); padding: 32px 40px; text-align: center; }
  .header h1 { color: #fff; font-size: 22px; margin: 8px 0 0; font-weight: 700; }
  .header p  { color: rgba(255,255,255,.65); font-size: 12px; margin: 4px 0 0; letter-spacing: .1em; text-transform: uppercase; }
  .body  { padding: 36px 40px; }
  .footer { background: #f8fafb; padding: 20px 40px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
  .btn { display: inline-block; background: #1A7A8A; color: #fff !important; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 50px; text-decoration: none; margin: 20px 0; }
  .pill { display: inline-block; background: rgba(26,122,138,.1); color: #1A7A8A; font-weight: 700; font-size: 13px; padding: 6px 16px; border-radius: 50px; letter-spacing: .05em; }
  h2 { font-size: 24px; margin: 0 0 12px; color: #0d1f22; }
  p  { font-size: 14px; line-height: 1.7; color: #4a6b70; margin: 8px 0; }
  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  table.items { width: 100%; border-collapse: collapse; margin: 16px 0; }
  table.items td { padding: 10px 8px; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
  table.items td:last-child { text-align: right; font-weight: 600; }
  .total-row td { font-weight: 700; font-size: 15px; color: #0d1f22; border-bottom: none; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div style="font-size:28px">♻️</div>
    <h1>CraftworldCentre</h1>
    <p>Circular Economy Marketplace</p>
  </div>
  <div class="body">${bodyHtml}</div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} CraftworldCentre · Lagos, Nigeria</p>
    <p><a href="${FE_URL}" style="color:#1A7A8A">Visit our store</a> &nbsp;·&nbsp; <a href="mailto:${SUPPORT}" style="color:#1A7A8A">Contact support</a></p>
    <p style="margin-top:8px">Every purchase diverts waste from landfill 🌍</p>
  </div>
</div>
</body>
</html>`
}

// ── Send helper ───────────────────────────────────────────────
async function send(to: string, subject: string, html: string): Promise<void> {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    })
    logger.info(`Email sent: "${subject}" → ${to}`)
  } catch (err) {
    logger.error(`Email failed: "${subject}" → ${to}`, err)
    // Non-fatal — log and continue
  }
}

// ── Welcome / verification email ─────────────────────────────
export async function sendWelcomeEmail(to: string, firstName: string, verifyToken: string): Promise<void> {
  const verifyUrl = `${FE_URL}/verify-email?token=${verifyToken}`
  await send(to, 'Welcome to CraftworldCentre 🌿 - Verify Your Email', emailShell(`
    <h2>Welcome, ${firstName}! 🎉</h2>
    <p>You've just joined Nigeria's leading circular economy marketplace. Every product you buy from us diverts waste from landfill and supports artisan livelihoods.</p>
    <p><strong>Please verify your email address to get started:</strong></p>
    <div style="text-align:center"><a class="btn" href="${verifyUrl}">Verify My Email</a></div>
    <p>Or copy this link into your browser:</p>
    <p style="word-break:break-all;font-size:12px;color:#9ca3af">${verifyUrl}</p>
    <p>This verification link expires in 24 hours.</p>
    <hr class="divider" />
    <p>If you didn't create an account, you can safely ignore this email.</p>
  `))
}

// ── Password reset email ──────────────────────────────────────
export async function sendPasswordResetEmail(to: string, firstName: string, resetToken: string): Promise<void> {
  const resetUrl = `${FE_URL}/reset-password?token=${resetToken}`
  await send(to, 'Reset your CraftworldCentre password 🔒', emailShell(`
    <h2>Password Reset Request</h2>
    <p>Hi ${firstName}, we received a request to reset your password. Click below to choose a new one:</p>
    <div style="text-align:center"><a class="btn" href="${resetUrl}">Reset Password</a></div>
    <p>This link expires in <strong>1 hour</strong>.</p>
    <p>If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.</p>
  `))
}

// ── Order confirmation email ──────────────────────────────────
export async function sendOrderConfirmationEmail(
  to: string,
  firstName: string,
  reference: string,
  items: Array<{ name: string; quantity: number; price: number }>,
  total: number,
  deliveryFee: number,
  address: string
): Promise<void> {
  const orderUrl = `${FE_URL}/account/orders/${reference}`
  const formatNaira = (n: number) => `₦${n.toLocaleString('en-NG')}`

  const itemRows = items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td>${formatNaira(item.price * item.quantity)}</td>
    </tr>
  `).join('')

  await send(to, `Order Confirmed — ${reference} ✅`, emailShell(`
    <div style="text-align:center;margin-bottom:20px">
      <span class="pill">✓ Order Confirmed</span>
    </div>
    <h2>Thank you, ${firstName}!</h2>
    <p>Your order has been received and payment confirmed. We'll notify you when it's on its way.</p>
    <hr class="divider" />
    <p><strong>Order Reference:</strong> <span class="pill">${reference}</span></p>
    <p><strong>Delivering to:</strong> ${address}</p>
    <hr class="divider" />
    <table class="items">
      <thead><tr><td><strong>Product</strong></td><td style="text-align:center"><strong>Qty</strong></td><td style="text-align:right"><strong>Price</strong></td></tr></thead>
      <tbody>
        ${itemRows}
        <tr><td colspan="2">Delivery</td><td>${deliveryFee === 0 ? 'Free 🎉' : formatNaira(deliveryFee)}</td></tr>
        <tr class="total-row"><td colspan="2"><strong>Total</strong></td><td><strong>${formatNaira(total)}</strong></td></tr>
      </tbody>
    </table>
    <div style="text-align:center">
      <a class="btn" href="${orderUrl}">Track Your Order</a>
    </div>
    <hr class="divider" />
    <p style="background:#f0fafb;border-radius:12px;padding:14px;font-size:13px">
      ♻️ <strong>Your circular impact:</strong> This order diverted approximately
      <strong>${((total / 10000) * 1.2).toFixed(1)}kg</strong> of waste from landfill. Thank you!
    </p>
  `))
}

// ── Order status update ───────────────────────────────────────
export async function sendOrderStatusEmail(
  to: string,
  firstName: string,
  reference: string,
  status: string,
  note?: string
): Promise<void> {
  const STATUS_MESSAGES: Record<string, { subject: string; headline: string; body: string }> = {
    processing: { subject: 'Your order is being prepared 🔨', headline: 'Order in Progress', body: 'Our artisans are carefully preparing your circular products for dispatch.' },
    shipped:    { subject: 'Your order is on its way! 🚚',    headline: 'Order Shipped',     body: 'Great news — your order has been dispatched and is on its way to you.' },
    delivered:  { subject: 'Your order has arrived 🏠',       headline: 'Order Delivered',   body: 'Your order has been delivered. We hope you love your new circular products!' },
    cancelled:  { subject: 'Order cancellation confirmed',     headline: 'Order Cancelled',   body: 'Your order has been cancelled. If a payment was made, a refund will be processed within 5–7 business days.' },
  }

  const msg = STATUS_MESSAGES[status] ?? {
    subject: `Order update: ${status}`,
    headline: 'Order Update',
    body: `Your order ${reference} status has been updated to: ${status}.`,
  }

  const orderUrl = `${FE_URL}/account/orders/${reference}`
  await send(to, msg.subject, emailShell(`
    <h2>${msg.headline}</h2>
    <p>Hi ${firstName},</p>
    <p>${msg.body}</p>
    ${note ? `<p><strong>Note:</strong> ${note}</p>` : ''}
    <p><strong>Reference:</strong> <span class="pill">${reference}</span></p>
    <div style="text-align:center">
      <a class="btn" href="${orderUrl}">View Order</a>
    </div>
  `))
}

// ── Low stock alert email ──────────────────────────────────────
export async function sendLowStockAlertEmail(
  to: string,
  productName: string,
  currentStock: number
): Promise<void> {
  await send(to, `Low Stock Alert: ${productName} 📉`, emailShell(`
    <h2>Low Stock Alert</h2>
    <p><strong>Product:</strong> ${productName}</p>
    <p><strong>Current Stock:</strong> ${currentStock}</p>
    <p>Please restock this item as soon as possible.</p>
    <p>This is an automated notification from CraftworldCentre.</p>
  `))
}

// ── Newsletter confirmation ───────────────────────────────────
export async function sendNewsletterWelcomeEmail(to: string): Promise<void> {
  await send(to, 'You\'re in the loop! 🌿', emailShell(`
    <h2>Welcome to the Loop!</h2>
    <p>You've subscribed to the CraftworldCentre newsletter. You'll be the first to hear about:</p>
    <ul style="color:#4a6b70;font-size:14px;line-height:2">
      <li>New circular products from all three brands</li>
      <li>Artisan stories from our workshop community</li>
      <li>Exclusive subscriber-only offers</li>
      <li>Circular economy news and insights</li>
    </ul>
    <div style="text-align:center"><a class="btn" href="${FE_URL}/shop">Browse Products</a></div>
  `))
}

export const emailService = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendOrderStatusEmail,
  sendNewsletterWelcomeEmail,
}
