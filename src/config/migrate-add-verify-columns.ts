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
  `ALTER TABLE users ADD COLUMN verify_token VARCHAR(255) NULL`,
  
  // Add verify_token_expires if not exists
  `ALTER TABLE users ADD COLUMN verify_token_expires DATETIME NULL`,
  
  // Add indexes if they don't exist
  `ALTER TABLE users ADD INDEX idx_verify_token (verify_token)`,
  
  `ALTER TABLE users ADD INDEX idx_verify_expires (verify_token_expires)`,
]

async function migrate() {
  console.log('🔄 Running migration to add missing verification columns…')
  
  // Create a new connection for each migration to avoid connection resets
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const sql = MIGRATIONS[i]
    const preview = sql.trim().slice(0, 70).replace(/\n/g, ' ')
    
    let conn
    try {
      conn = await mysql.createConnection(DB_CONFIG)
      await conn.execute(sql)
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
      if (conn) await conn.end()
    }
  }
  
  console.log('\n✅ Migration completed.\n')
}

migrate().catch(console.error)

