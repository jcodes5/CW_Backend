import mysql from 'mysql2/promise'
import { logger } from '@/utils/logger'

// ── Connection pool ───────────────────────────────────────────
const pool = mysql.createPool({
  host:              process.env.DB_HOST     ?? 'localhost',
  port:              parseInt(process.env.DB_PORT ?? '3306', 10),
  database:          process.env.DB_NAME     ?? 'craftworldcentre',
  user:              process.env.DB_USER     ?? 'root',
  password:          process.env.DB_PASSWORD ?? '',
  connectionLimit:   parseInt(process.env.DB_CONNECTION_LIMIT ?? '10', 10),
  waitForConnections: true,
  queueLimit:        0,
  enableKeepAlive:   true,
  keepAliveInitialDelay: 30000,
  // Prevent SQL injection via prepared statements
  namedPlaceholders: false,
  // Return dates as JS Date objects
  dateStrings: false,
  timezone: '+00:00',
})

// ── Test connection on startup ────────────────────────────────
export async function testDatabaseConnection(): Promise<void> {
  try {
    const conn = await pool.getConnection()
    await conn.ping()
    conn.release()
    logger.info('✓ MySQL connection pool established')
  } catch (err) {
    logger.error('✗ MySQL connection failed:', err)
    process.exit(1)
  }
}

// ── Query helper — typed, always uses prepared statements ──────
export async function query<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const [rows] = await pool.query(sql, params)
  return rows as T[]
}

// ── Query one — returns first row or null ─────────────────────
export async function queryOne<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

// ── Execute — for INSERT/UPDATE/DELETE ────────────────────────
export interface ExecResult {
  affectedRows: number
  insertId:     number | bigint
  changedRows:  number
}

export async function execute(
  sql: string,
  params?: unknown[]
): Promise<ExecResult> {
  const [result] = await pool.query(sql, params)
  const r = result as mysql.ResultSetHeader
  return {
    affectedRows: r.affectedRows,
    insertId:     r.insertId,
    changedRows:  r.changedRows,
  }
}

// ── Transaction helper ────────────────────────────────────────
export async function withTransaction<T>(
  callback: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection()
  await conn.beginTransaction()
  try {
    const result = await callback(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export default pool
