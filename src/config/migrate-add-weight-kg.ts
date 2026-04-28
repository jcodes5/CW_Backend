/**
 * CraftworldCentre — Add weight_kg Column to Products
 * Fixes: "Unknown column 'weight_kg' in 'field list'" error
 * Run: npm run db:migrate:add-weight-kg
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'

const DB_CONFIG = {
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '3306', 10),
  user:     process.env.DB_USER     ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME     ?? 'craftworldcentre',
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : undefined,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000,
  charset: 'utf8mb4',
  timezone: '+00:00',
}

const MIGRATIONS: string[] = [
  // ── Add weight_kg column if it doesn't exist ──────────────
  `ALTER TABLE products ADD COLUMN weight_kg DECIMAL(5,2) NOT NULL DEFAULT 0.5`,
]

async function migrate() {
  console.log('🔄 Adding weight_kg column to products table…')
  
  let conn: mysql.Connection | null = null
  let retries = 3
  
  while(retries > 0) {
    try {
      conn = await mysql.createConnection(DB_CONFIG)
      break
    } catch (err: any) {
      retries--
      console.log(`⚠️ Connection attempt failed, ${retries} retries remaining. Error: ${err.message}`)
      
      if (retries === 0) {
        console.error('\n❌ Failed to connect to database after multiple attempts.')
        process.exit(1)
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  if (!conn) {
    console.error('❌ Connection failed')
    process.exit(1)
  }

  // Create a new connection for each migration to avoid connection resets
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const sql = MIGRATIONS[i]
    const preview = sql.trim().slice(0, 70).replace(/\n/g, ' ')
    
    let migConn
    try {
      migConn = await mysql.createConnection(DB_CONFIG)
      await migConn.execute(sql)
      console.log(`  ✓ ${preview}…`)
    } catch (err: any) {
      // Ignore duplicate column (1060) and duplicate key (1061) errors
      if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME' || err.errno === 1060 || err.errno === 1061) {
        console.log(`  ⚠ Skipped (already exists): ${preview}…`)
      } else {
        console.error(`\n❌ Migration failed at step ${i + 1}:`, err.message)
        process.exit(1)
      }
    } finally {
      if (migConn) await migConn.end()
    }
  }

  if (conn) await conn.end()
  console.log('✅ Migration completed successfully!')
}

// Run migration
migrate().catch(err => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
