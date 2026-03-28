/**
 * CraftworldCentre — Wallet Model
 * Handles user wallet balance and transactions
 */

import { v4 as uuidv4 } from 'uuid'
import { query, queryOne, execute, withTransaction } from '@/config/database'

// ── Types ──────────────────────────────────────────────────────────
export interface WalletRow {
  id: string
  user_id: string
  balance: number
  created_at: Date
  updated_at: Date
}

export interface WalletTransactionRow {
  id: string
  wallet_id: string
  type: 'deposit' | 'payment' | 'refund' | 'withdrawal'
  amount: number
  reference: string
  description: string
  status: 'pending' | 'completed' | 'failed'
  metadata: string | null  // JSON
  created_at: Date
}

export interface WalletDTO {
  id: string
  userId: string
  balance: number
  createdAt: Date
  updatedAt: Date
}

export interface WalletTransactionDTO {
  id: string
  walletId: string
  type: 'deposit' | 'payment' | 'refund' | 'withdrawal'
  amount: number
  reference: string
  description: string
  status: 'pending' | 'completed' | 'failed'
  metadata?: Record<string, unknown>
  createdAt: Date
}

// ── Wallet Operations ─────────────────────────────────────────────

/**
 * Get or create wallet for a user
 */
export async function getOrCreateWallet(userId: string): Promise<WalletRow> {
  let wallet = await queryOne<WalletRow>(
    'SELECT * FROM wallets WHERE user_id = ? LIMIT 1',
    [userId]
  )

  if (!wallet) {
    const id = uuidv4()
    await execute(
      'INSERT INTO wallets (id, user_id, balance) VALUES (?, ?, 0)',
      [id, userId]
    )
    wallet = await queryOne<WalletRow>(
      'SELECT * FROM wallets WHERE id = ? LIMIT 1',
      [id]
    )
  }

  return wallet!
}

/**
 * Get wallet by user ID
 */
export async function getWalletByUserId(userId: string): Promise<WalletRow | null> {
  return queryOne<WalletRow>(
    'SELECT * FROM wallets WHERE user_id = ? LIMIT 1',
    [userId]
  )
}

/**
 * Get wallet by ID
 */
export async function getWalletById(walletId: string): Promise<WalletRow | null> {
  return queryOne<WalletRow>(
    'SELECT * FROM wallets WHERE id = ? LIMIT 1',
    [walletId]
  )
}

/**
 * Add funds to wallet (with transaction)
 */
export async function addFunds(
  userId: string,
  amount: number,
  reference: string,
  description: string,
  metadata?: Record<string, unknown>
): Promise<WalletDTO> {
  const wallet = await getOrCreateWallet(userId)

  // Use transaction for atomicity
  await withTransaction(async (conn) => {
    // Update wallet balance
    await conn.execute(
      'UPDATE wallets SET balance = balance + ? WHERE id = ?',
      [amount, wallet.id]
    )

    // Record transaction
    const transactionId = uuidv4()
    await conn.execute(
      `INSERT INTO wallet_transactions 
       (id, wallet_id, type, amount, reference, description, status, metadata) 
       VALUES (?, ?, 'deposit', ?, ?, ?, 'completed', ?)`,
      [
        transactionId,
        wallet.id,
        amount,
        reference,
        description,
        metadata ? JSON.stringify(metadata) : null,
      ]
    )
  })

  // Get updated wallet
  const updatedWallet = await getWalletById(wallet.id)
  return toWalletDTO(updatedWallet as WalletRow)
}

/**
 * Deduct funds from wallet (for payments)
 * Returns the transaction result or throws if insufficient funds
 */
export async function deductFunds(
  userId: string,
  amount: number,
  reference: string,
  description: string,
  metadata?: Record<string, unknown>
): Promise<WalletTransactionDTO> {
  const wallet = await getOrCreateWallet(userId)

  // Check sufficient balance
  if (wallet.balance < amount) {
    throw new Error('Insufficient wallet balance')
  }

  // Deduct from balance
  await execute(
    'UPDATE wallets SET balance = balance - ? WHERE id = ?',
    [amount, wallet.id]
  )

  // Record transaction
  const transactionId = uuidv4()
  await execute(
    `INSERT INTO wallet_transactions 
     (id, wallet_id, type, amount, reference, description, status, metadata) 
     VALUES (?, ?, 'payment', ?, ?, ?, 'completed', ?)`,
    [
      transactionId,
      wallet.id,
      amount,
      reference,
      description,
      metadata ? JSON.stringify(metadata) : null,
    ]
  )

  const transaction = await queryOne<WalletTransactionRow>(
    'SELECT * FROM wallet_transactions WHERE id = ? LIMIT 1',
    [transactionId]
  )

  return toTransactionDTO(transaction as WalletTransactionRow)
}

/**
 * Add refund to wallet
 */
export async function addRefund(
  userId: string,
  amount: number,
  reference: string,
  description: string,
  metadata?: Record<string, unknown>
): Promise<WalletTransactionDTO> {
  const wallet = await getOrCreateWallet(userId)

  // Add to balance
  await execute(
    'UPDATE wallets SET balance = balance + ? WHERE id = ?',
    [amount, wallet.id]
  )

  // Record transaction
  const transactionId = uuidv4()
  await execute(
    `INSERT INTO wallet_transactions 
     (id, wallet_id, type, amount, reference, description, status, metadata) 
     VALUES (?, ?, 'refund', ?, ?, ?, 'completed', ?)`,
    [
      transactionId,
      wallet.id,
      amount,
      reference,
      description,
      metadata ? JSON.stringify(metadata) : null,
    ]
  )

  const transaction = await queryOne<WalletTransactionRow>(
    'SELECT * FROM wallet_transactions WHERE id = ? LIMIT 1',
    [transactionId]
  )

  return toTransactionDTO(transaction as WalletTransactionRow)
}

/**
 * Get wallet transactions with pagination
 */
export async function getTransactions(
  userId: string,
  page = 1,
  limit = 20
): Promise<{ transactions: WalletTransactionDTO[]; total: number }> {
  const wallet = await getOrCreateWallet(userId)

  const offset = (page - 1) * limit

  const [transactions, countResult] = await Promise.all([
    query<WalletTransactionRow>(
      `SELECT * FROM wallet_transactions 
       WHERE wallet_id = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [wallet.id, limit, offset]
    ),
    query<{ total: number }>(
      'SELECT COUNT(*) as total FROM wallet_transactions WHERE wallet_id = ?',
      [wallet.id]
    ),
  ])

  return {
    transactions: transactions.map(toTransactionDTO),
    total: countResult[0].total,
  }
}

/**
 * Get wallet balance only
 */
export async function getBalance(userId: string): Promise<number> {
  const wallet = await getWalletByUserId(userId)
  return wallet?.balance ?? 0
}

// ── Mappers ──────────────────────────────────────────────────────

export function toWalletDTO(row: WalletRow): WalletDTO {
  return {
    id: row.id,
    userId: row.user_id,
    balance: row.balance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toTransactionDTO(row: WalletTransactionRow): WalletTransactionDTO {
  return {
    id: row.id,
    walletId: row.wallet_id,
    type: row.type,
    amount: row.amount,
    reference: row.reference,
    description: row.description,
    status: row.status,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at,
  }
}
