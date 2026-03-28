/**
 * CraftworldCentre — Additional Migrations
 * Sprint 5: Rewards, Coupons (extended), DIY Videos, Order Tracking
 * Run after the base migration: npm run db:migrate:v2
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'

const DB_CONFIG = {
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '3306', 10),
  user:     process.env.DB_USER     ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME     ?? 'craftworldcentre',
}

const MIGRATIONS: string[] = [

  // ── Rewards Accounts ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS rewards_accounts (
    id                CHAR(36)        NOT NULL,
    user_id           CHAR(36)        NOT NULL UNIQUE,
    points            INT             NOT NULL DEFAULT 0,
    lifetime_points   INT             NOT NULL DEFAULT 0,
    tier              ENUM('bronze','silver','gold','platinum') NOT NULL DEFAULT 'bronze',
    created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Rewards Transactions ──────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS rewards_transactions (
    id          CHAR(36)      NOT NULL,
    user_id     CHAR(36)      NOT NULL,
    type        ENUM('earn','redeem','expire','bonus','adjustment') NOT NULL,
    points      INT           NOT NULL,
    description VARCHAR(300)  NOT NULL,
    order_id    CHAR(36)      NULL,
    expires_at  DATETIME      NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_user (user_id),
    INDEX idx_order (order_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Coupons (extended from base migration) ────────────────────
  `CREATE TABLE IF NOT EXISTS coupons (
    id               CHAR(36)        NOT NULL,
    code             VARCHAR(50)     NOT NULL UNIQUE,
    type             ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
    value            DECIMAL(10,2)   NOT NULL,
    min_order_amount DECIMAL(12,2)   NULL,
    max_uses         INT             NULL,
    used_count       INT             NOT NULL DEFAULT 0,
    expires_at       DATETIME        NULL,
    is_active        TINYINT(1)      NOT NULL DEFAULT 1,
    description      VARCHAR(200)    NULL,
    created_by       CHAR(36)        NULL,
    created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_code (code),
    INDEX idx_active (is_active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Coupon Usage (track who used what) ───────────────────────
  `CREATE TABLE IF NOT EXISTS coupon_usage (
    id         CHAR(36) NOT NULL,
    coupon_id  CHAR(36) NOT NULL,
    user_id    CHAR(36) NOT NULL,
    order_id   CHAR(36) NULL,
    used_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_coupon (coupon_id),
    INDEX idx_user (user_id),
    FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── DIY Videos ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS diy_videos (
    id           CHAR(36)      NOT NULL,
    title        VARCHAR(300)  NOT NULL,
    description  TEXT          NULL,
    youtube_id   VARCHAR(50)   NOT NULL,
    thumbnail    VARCHAR(500)  NULL,
    duration     VARCHAR(20)   NULL,
    category     VARCHAR(100)  NOT NULL DEFAULT 'Upcycling',
    brand_id     VARCHAR(20)   NULL,
    tags         JSON          NOT NULL DEFAULT ('[]'),
    view_count   INT           NOT NULL DEFAULT 0,
    is_published TINYINT(1)    NOT NULL DEFAULT 1,
    sort_order   INT           NOT NULL DEFAULT 0,
    created_by   CHAR(36)      NULL,
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_published (is_published),
    INDEX idx_category (category),
    INDEX idx_brand (brand_id),
    INDEX idx_sort (sort_order),
    FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Seed default coupons ──────────────────────────────────────
  `INSERT IGNORE INTO coupons (id, code, type, value, min_order_amount, max_uses, description)
   VALUES
   (UUID(), 'CIRCULAR10', 'percent', 10, 10000, 100, '10% off for circular economy supporters'),
   (UUID(), 'WELCOME500',  'fixed',   500, 5000, 50, '₦500 off your first order'),
   (UUID(), 'PLANET3R15', 'percent', 15, 15000, NULL, '15% off Planet 3R products')`,

  // ── Seed DIY videos ───────────────────────────────────────────
  `INSERT IGNORE INTO diy_videos
   (id, title, description, youtube_id, duration, category, brand_id, tags, is_published, sort_order)
   VALUES
   (UUID(), 'How We Turn Plastic Bottles into Stylish Planters',
    'Watch our Planet 3R team transform post-consumer HDPE bottles into beautiful planters.',
    'dQw4w9WgXcQ', '12:34', 'Upcycling', 'planet3r', '["plastic","planters","upcycling"]', 1, 1),
   (UUID(), 'Weaving Aso-Oke Offcuts into a Tote Bag — Full Process',
    'Adúláwò artisan Mama Folake walks through the full process of collecting and weaving fabric offcuts.',
    'dQw4w9WgXcQ', '18:05', 'Textile Arts', 'adulawo', '["aso-oke","weaving","tote"]', 1, 2),
   (UUID(), 'Reclaimed Teak — From Fishing Boat to Coffee Table',
    'Follow the journey of a decommissioned fishing boat from Badagry to our Lagos workshop.',
    'dQw4w9WgXcQ', '22:17', 'Furniture', 'craftworld', '["teak","furniture","woodworking"]', 1, 3),
   (UUID(), 'Natural Indigo Dyeing: The Ancient Adire Process',
    'Join us in Abeokuta for the centuries-old adire eleko starch-resist dyeing technique.',
    'dQw4w9WgXcQ', '15:48', 'Traditional Craft', 'adulawo', '["adire","dyeing","indigo"]', 1, 4),
   (UUID(), 'Making Bookends from Construction Waste Earth',
    'Planet 3R shows how excess laterite soil from building excavations becomes weighted bookends.',
    'dQw4w9WgXcQ', '9:22', 'Upcycling', 'planet3r', '["earth","bookends","construction-waste"]', 1, 5)`,
]

async function migrate() {
  console.log('🔄 Running Sprint 5 migrations…')
  const conn = await mysql.createConnection(DB_CONFIG)

  try {
    for (const sql of MIGRATIONS) {
      const preview = sql.trim().slice(0, 70).replace(/\n/g, ' ')
      await conn.execute(sql)
      console.log(`  ✓ ${preview}…`)
    }
    console.log('\n✅ Sprint 5 migrations completed.\n')
  } catch (err) {
    console.error('\n❌ Migration failed:', err)
    process.exit(1)
  } finally {
    await conn.end()
  }
}

migrate()
