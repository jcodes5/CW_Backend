/**
 * CraftworldCentre — Add Missing Columns Migration
 * This migration adds the verify_token and verify_token_expires columns to users table
 * if they don't already exist. This fixes the issue on production databases that may
 * not have been fully migrated.
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'

const DB_CONFIG = {
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '3306', 10),
  user:     process.env.DB_USER     ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME     ?? 'nigeriag_craftw_db',
}

const MIGRATIONS: string[] = [
  // Add verify_token if not exists
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token VARCHAR(255) NULL`,
  
  // Add verify_token_expires if not exists
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_expires DATETIME NULL`,
  
  // Add indexes if they don't exist
  `ALTER TABLE users ADD INDEX IF NOT EXISTS idx_verify_token (verify_token)`,
  
  `ALTER TABLE users ADD INDEX IF NOT EXISTS idx_verify_expires (verify_token_expires)`,
]

async function migrate() {
  console.log('🔄 Running migration to add missing verification columns…')
  const conn = await mysql.createConnection(DB_CONFIG)

  try {
    for (const sql of MIGRATIONS) {
      const preview = sql.trim().slice(0, 70).replace(/\n/g, ' ')
      await conn.execute(sql)
      console.log(`  ✓ ${preview}…`)
    }
    console.log('\n✅ Migration completed.\n')
  } catch (err) {
    console.error('\n❌ Migration failed:', err)
    process.exit(1)
  } finally {
    await conn.end()
  }
}

migrate().catch(console.error)
