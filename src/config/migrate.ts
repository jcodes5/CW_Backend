
import 'dotenv/config'
import mysql from 'mysql2/promise'

const DB_CONFIG = {
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '3306', 10),
  user:     process.env.DB_USER     ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME     ?? 'nigeriag_craftw_db',
  multipleStatements: true,
  connectionTimeout: 30000,
  waitForConnections: true,
}

const MIGRATIONS: string[] = [
  // ── Tables (using existing database from DB_NAME) ─────────────

  // ── Brands ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS brands (
    id           VARCHAR(20)   NOT NULL,
    name         VARCHAR(100)  NOT NULL,
    tagline      VARCHAR(200)  NOT NULL,
    description  TEXT          NOT NULL,
    color        VARCHAR(10)   NOT NULL DEFAULT '#1A7A8A',
    accent_color VARCHAR(10)   NOT NULL DEFAULT '#7BC8D8',
    logo         VARCHAR(500)  NULL,
    website      VARCHAR(300)  NULL,
    founded      VARCHAR(10)   NULL,
    focus        JSON          NOT NULL DEFAULT ('[]'),
    is_active    TINYINT(1)    NOT NULL DEFAULT 1,
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Categories ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS categories (
    id          VARCHAR(50)   NOT NULL,
    name        VARCHAR(100)  NOT NULL,
    slug        VARCHAR(100)  NOT NULL UNIQUE,
    icon        VARCHAR(10)   NOT NULL DEFAULT '📦',
    description TEXT          NULL,
    is_active   TINYINT(1)    NOT NULL DEFAULT 1,
    sort_order  INT           NOT NULL DEFAULT 0,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_slug (slug),
    INDEX idx_active (is_active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Users ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id            CHAR(36)      NOT NULL,
    first_name    VARCHAR(100)  NOT NULL,
    last_name     VARCHAR(100)  NOT NULL,
    email         VARCHAR(255)  NOT NULL UNIQUE,
    phone         VARCHAR(20)   NULL,
    password_hash VARCHAR(255)  NULL,
    avatar        VARCHAR(500)  NULL,
    role          ENUM('customer','admin','vendor') NOT NULL DEFAULT 'customer',
    is_verified   TINYINT(1)    NOT NULL DEFAULT 0,
    is_active     TINYINT(1)    NOT NULL DEFAULT 1,
    provider      ENUM('local','google','facebook') NOT NULL DEFAULT 'local',
    provider_id   VARCHAR(255)  NULL,
     reset_token   VARCHAR(255)  NULL,
     reset_token_expires DATETIME NULL,
     verify_token  VARCHAR(255)  NULL,
     verify_token_expires DATETIME NULL,
     last_login_at DATETIME      NULL,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
     INDEX idx_email (email),
     INDEX idx_role (role),
     INDEX idx_active (is_active),
     INDEX idx_provider (provider),
     INDEX idx_provider_id (provider_id),
     INDEX idx_verify_token (verify_token),
     INDEX idx_verify_expires (verify_token_expires),
     INDEX idx_is_verified (is_verified)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Refresh Tokens ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         CHAR(36)     NOT NULL,
    user_id    CHAR(36)     NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME     NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME     NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_token (token_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Products ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS products (
    id            CHAR(36)       NOT NULL,
    name          VARCHAR(255)   NOT NULL,
    slug          VARCHAR(255)   NOT NULL UNIQUE,
    description   TEXT           NOT NULL,
    price         DECIMAL(12,2)  NOT NULL,
    compare_price DECIMAL(12,2)  NULL,
    images        JSON           NOT NULL DEFAULT ('[]'),
    specifications JSON          NULL,
    category_id   VARCHAR(50)    NOT NULL,
    brand_id      VARCHAR(20)    NOT NULL,
    stock         INT            NOT NULL DEFAULT 0,
    tags          JSON           NOT NULL DEFAULT ('[]'),
    rating        DECIMAL(3,2)   NOT NULL DEFAULT 0.00,
    review_count  INT            NOT NULL DEFAULT 0,
    is_new        TINYINT(1)     NOT NULL DEFAULT 0,
    is_featured   TINYINT(1)     NOT NULL DEFAULT 0,
    is_active     TINYINT(1)     NOT NULL DEFAULT 1,
    cloudinary_ids JSON          NULL,
    created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_slug (slug),
    INDEX idx_brand (brand_id),
    INDEX idx_category (category_id),
    INDEX idx_active (is_active),
    INDEX idx_featured (is_featured),
    INDEX idx_new (is_new),
    INDEX idx_price (price),
    FULLTEXT INDEX ft_search (name, description),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (brand_id) REFERENCES brands(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Product Reviews ───────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS product_reviews (
    id          CHAR(36)   NOT NULL,
    product_id  CHAR(36)   NOT NULL,
    user_id     CHAR(36)   NOT NULL,
    rating      TINYINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title       VARCHAR(200) NULL,
    body        TEXT       NOT NULL,
    is_verified TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_user_product (user_id, product_id),
    INDEX idx_product (product_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Addresses ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS addresses (
    id             CHAR(36)     NOT NULL,
    user_id        CHAR(36)     NOT NULL,
    label          VARCHAR(50)  NOT NULL DEFAULT 'Home',
    first_name     VARCHAR(100) NOT NULL,
    last_name      VARCHAR(100) NOT NULL,
    email          VARCHAR(255) NOT NULL,
    phone          VARCHAR(20)  NOT NULL,
    address_line1  VARCHAR(300) NOT NULL,
    address_line2  VARCHAR(300) NULL,
    city           VARCHAR(100) NOT NULL,
    state          VARCHAR(100) NOT NULL,
    postal_code    VARCHAR(20)  NULL,
    country        VARCHAR(100) NOT NULL DEFAULT 'Nigeria',
    is_default     TINYINT(1)   NOT NULL DEFAULT 0,
    delivery_notes TEXT         NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Orders ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS orders (
    id                 CHAR(36)        NOT NULL,
    reference          VARCHAR(50)     NOT NULL UNIQUE,
    user_id            CHAR(36)        NOT NULL,
    status             ENUM('pending','payment_pending','payment_failed','confirmed',
                            'processing','shipped','delivered','cancelled','refunded')
                       NOT NULL DEFAULT 'pending',
    subtotal           DECIMAL(12,2)   NOT NULL,
    delivery_fee       DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    discount           DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    total              DECIMAL(12,2)   NOT NULL,
    payment_method     VARCHAR(50)     NOT NULL DEFAULT 'paystack',
    payment_channel    VARCHAR(50)     NULL,
    paystack_ref       VARCHAR(100)    NULL,
    shipping_address   JSON            NOT NULL,
    notes              TEXT            NULL,
    estimated_delivery VARCHAR(100)    NULL,
    created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_reference (reference),
    INDEX idx_user (user_id),
    INDEX idx_status (status),
    INDEX idx_created (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Order Items ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS order_items (
    id          CHAR(36)       NOT NULL,
    order_id    CHAR(36)       NOT NULL,
    product_id  CHAR(36)       NOT NULL,
    quantity    INT            NOT NULL,
    unit_price  DECIMAL(12,2)  NOT NULL,
    total_price DECIMAL(12,2)  NOT NULL,
    snapshot    JSON           NOT NULL,
    created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_order (order_id),
    INDEX idx_product (product_id),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Wishlists ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS wishlists (
    id         CHAR(36)  NOT NULL,
    user_id    CHAR(36)  NOT NULL,
    product_id CHAR(36)  NOT NULL,
    created_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_user_product (user_id, product_id),
    INDEX idx_user (user_id),
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Newsletter Subscribers ───────────────────────────────
  `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id            CHAR(36)     NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    subscribed_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unsubscribed_at DATETIME   NULL,
    PRIMARY KEY (id),
    INDEX idx_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Order Status History ─────────────────────────────────
  `CREATE TABLE IF NOT EXISTS order_status_history (
    id         CHAR(36)    NOT NULL,
    order_id   CHAR(36)    NOT NULL,
    status     VARCHAR(30) NOT NULL,
    note       TEXT        NULL,
    changed_by CHAR(36)    NULL,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_order (order_id),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Coupons ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS coupons (
    id             CHAR(36)       NOT NULL,
    code           VARCHAR(50)    NOT NULL UNIQUE,
    type           ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
    value          DECIMAL(10,2)  NOT NULL,
    min_order_amount DECIMAL(12,2) NULL,
    max_uses       INT            NULL,
    used_count     INT            NOT NULL DEFAULT 0,
    expires_at     DATETIME       NULL,
    description    VARCHAR(255)  NULL,
    is_active      TINYINT(1)     NOT NULL DEFAULT 1,
    created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_code (code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Rewards / Loyalty Points ────────────────────────────
  `CREATE TABLE IF NOT EXISTS user_rewards (
    id            CHAR(36)      NOT NULL,
    user_id       CHAR(36)      NOT NULL,
    points        INT           NOT NULL DEFAULT 0,
    tier          ENUM('bronze','silver','gold','platinum') NOT NULL DEFAULT 'bronze',
    lifetime_points INT         NOT NULL DEFAULT 0,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Reward Transactions ───────────────────────────────────
  `CREATE TABLE IF NOT EXISTS reward_transactions (
    id          CHAR(36)     NOT NULL,
    user_id     CHAR(36)     NOT NULL,
    order_id    CHAR(36)     NULL,
    type        ENUM('earned','redeemed','expired','bonus','adjusted') NOT NULL,
    points      INT          NOT NULL,
    description VARCHAR(255) NOT NULL,
    expires_at  DATETIME     NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_user (user_id),
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Reward Redemptions ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS reward_redemptions (
    id          CHAR(36)     NOT NULL,
    user_id     CHAR(36)     NOT NULL,
    type        ENUM('cashback','discount_code') NOT NULL,
    points_used INT          NOT NULL,
    value       DECIMAL(10,2) NOT NULL,
    coupon_id   CHAR(36)     NULL,
    status      ENUM('pending','applied','expired') NOT NULL DEFAULT 'pending',
    expires_at  DATETIME     NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_user (user_id),
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Order Tracking Events ────────────────────────────────
  `CREATE TABLE IF NOT EXISTS order_tracking (
    id          CHAR(36)     NOT NULL,
    order_id    CHAR(36)     NOT NULL,
    status      VARCHAR(50)  NOT NULL,
    title       VARCHAR(200) NOT NULL,
    description TEXT         NULL,
    location    VARCHAR(200) NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_order (order_id),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── DIY Videos ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS diy_videos (
    id           CHAR(36)     NOT NULL,
    title        VARCHAR(255) NOT NULL,
    description  TEXT         NULL,
    youtube_id   VARCHAR(20)  NOT NULL,
    thumbnail    VARCHAR(500) NULL,
    duration     VARCHAR(20)  NULL,
    category     VARCHAR(100) NOT NULL DEFAULT 'Upcycling',
    brand_id     VARCHAR(20)  NULL,
    tags         JSON         NOT NULL DEFAULT ('[]'),
    view_count   INT          NOT NULL DEFAULT 0,
    is_published TINYINT(1)   NOT NULL DEFAULT 1,
    sort_order   INT          NOT NULL DEFAULT 0,
    created_by   CHAR(36)     NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_published (is_published),
    INDEX idx_category (category),
    FOREIGN KEY (brand_id)   REFERENCES brands(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)  ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Coupon usages ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS coupon_usages (
    id         CHAR(36)  NOT NULL,
    coupon_id  CHAR(36)  NOT NULL,
    user_id    CHAR(36)  NOT NULL,
    order_id   CHAR(36)  NULL,
    used_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_coupon (coupon_id),
    INDEX idx_user (user_id),
    FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
    FOREIGN KEY (order_id)  REFERENCES orders(id)  ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Wallets ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS wallets (
    id          CHAR(36)      NOT NULL,
    user_id     CHAR(36)      NOT NULL UNIQUE,
    balance     DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Wallet Transactions ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS wallet_transactions (
    id          CHAR(36)      NOT NULL,
    wallet_id   CHAR(36)      NOT NULL,
    type        ENUM('deposit', 'payment', 'refund', 'withdrawal') NOT NULL,
    amount      DECIMAL(12,2) NOT NULL,
    reference   VARCHAR(255)  NOT NULL,
    description VARCHAR(500)  NOT NULL,
    status      ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    metadata    JSON          NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
    INDEX idx_wallet (wallet_id),
    INDEX idx_reference (reference),
    INDEX idx_type (type),
    INDEX idx_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Hero Images (Shop Page Carousel) ───────────────────────────
  `CREATE TABLE IF NOT EXISTS hero_images (
    id        CHAR(36)      NOT NULL,
    image_url VARCHAR(500)  NOT NULL,
    title     VARCHAR(255)  NOT NULL,
    subtitle  VARCHAR(500)  NOT NULL,
    tag       VARCHAR(100)  NOT NULL,
    alt_text  VARCHAR(255)  NOT NULL,
    sort_order INT          NOT NULL DEFAULT 0,
    is_active TINYINT(1)    NOT NULL DEFAULT 1,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_active (is_active),
    INDEX idx_sort (sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Webhook Event IDs (for deduplication & tracking) ──────────
  `ALTER TABLE orders ADD COLUMN webhook_event_id VARCHAR(255) UNIQUE NULL AFTER paystack_ref`,
  `ALTER TABLE orders ADD COLUMN webhook_processed_at DATETIME NULL AFTER webhook_event_id`,
  `CREATE INDEX idx_webhook_event ON orders (webhook_event_id)`,
  `CREATE INDEX idx_webhook_processed ON orders (webhook_processed_at)`,
]

async function migrate() {
  console.log('🔄 Running database migrations…')
  const conn = await mysql.createConnection(DB_CONFIG)

  try {
    for (const sql of MIGRATIONS) {
      const preview = sql.trim().slice(0, 60).replace(/\n/g, ' ')
      try {
        await conn.execute(sql)
        console.log(`  ✓ ${preview}…`)
      } catch (err: any) {
        if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME') {
          console.log(`  ⚠ Skipped (already exists): ${preview}…`)
        } else {
          throw err
        }
      }
    }
    console.log('\n✅ All migrations completed successfully.\n')
  } catch (err) {
    console.error('\n❌ Migration failed:', err)
    process.exit(1)
  } finally {
    await conn.end()
  }
}

migrate()
