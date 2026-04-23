/**
 * CraftworldCentre — Add Specifications Column to Products
 * Fixes: "Unknown column 'specifications' in 'field list'" error
 * Run: npm run db:migrate:add-specifications
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
  // ── Add specifications column if it doesn't exist ───────────
  `ALTER TABLE products ADD COLUMN specifications JSON NULL AFTER images`,
]

async function migrate() {
  console.log('🔄 Adding specifications column to products table…')
  
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
      
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }

  try {
    for (const sql of MIGRATIONS) {
      const preview = sql.trim().slice(0, 70).replace(/\n/g, ' ')
      try {
        await conn!.execute(sql)
        console.log(`  ✓ ${preview}…`)
      } catch (err: any) {
        // Column might already exist, skip error
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`  ⊘ ${preview}… (column already exists)`)
        } else {
          throw err
        }
      }
    }
    console.log('\n✅ Migration completed. The specifications column has been added to products table.\n')
  } catch (err) {
    console.error('\n❌ Migration failed:', err)
    process.exit(1)
  } finally {
    if (conn) {
      await conn.end()
    }
  }
}

migrate()
