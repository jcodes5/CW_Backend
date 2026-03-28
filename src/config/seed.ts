/**
 * CraftworldCentre — Database Seed
 * Run with: npm run db:seed
 * Seeds brands, categories, sample products, and the default admin user.
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

const DB_CONFIG = {
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '3306', 10),
  user:     process.env.DB_USER     ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME     ?? 'craftworldcentre',
  multipleStatements: false,
}

async function seed() {
  console.log('🌱 Seeding database…\n')
  const conn = await mysql.createConnection(DB_CONFIG)

  try {
    // ── Brands ──────────────────────────────────────────────
    console.log('→ Seeding brands…')
    const brands = [
      {
        id: 'craftworld', name: 'CraftworldCentre',
        tagline: 'Where Waste Becomes Wonder',
        description: 'The flagship brand driving the circular economy mission — curating the finest recycled, upcycled, and sustainable products across all categories.',
        color: '#1A7A8A', accent_color: '#7BC8D8', founded: '2020',
        focus: JSON.stringify(['Curated Marketplace', 'Circular Economy', 'Sustainability']),
      },
      {
        id: 'adulawo', name: 'Adúláwò',
        tagline: 'Honour in Every Craft',
        description: 'Adúláwò transforms reclaimed materials into artisanal pieces that celebrate African heritage and craftsmanship.',
        color: '#8B6914', accent_color: '#d4b896', founded: '2018',
        focus: JSON.stringify(['Artisan Crafts', 'African Heritage', 'Reclaimed Materials']),
      },
      {
        id: 'planet3r', name: 'Planet 3R',
        tagline: 'Reduce. Reuse. Rethink.',
        description: 'Planet 3R pioneers industrial upcycling — converting post-consumer waste into functional, design-forward lifestyle products.',
        color: '#3d6b2d', accent_color: '#a8d4a0', founded: '2019',
        focus: JSON.stringify(['Industrial Upcycling', 'Home & Lifestyle', 'Zero Waste']),
      },
    ]

    for (const brand of brands) {
      await conn.execute(
        `INSERT IGNORE INTO brands (id, name, tagline, description, color, accent_color, founded, focus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [brand.id, brand.name, brand.tagline, brand.description,
         brand.color, brand.accent_color, brand.founded, brand.focus]
      )
    }
    console.log('  ✓ 3 brands seeded')

    // ── Categories ──────────────────────────────────────────
    console.log('→ Seeding categories…')
    const categories = [
      { id: 'home-decor',   name: 'Home Décor',   slug: 'home-decor',   icon: '🏡', sort_order: 1 },
      { id: 'fashion',      name: 'Fashion',       slug: 'fashion',      icon: '👗', sort_order: 2 },
      { id: 'furniture',    name: 'Furniture',     slug: 'furniture',    icon: '🪑', sort_order: 3 },
      { id: 'art',          name: 'Art & Crafts',  slug: 'art',          icon: '🎨', sort_order: 4 },
      { id: 'accessories',  name: 'Accessories',   slug: 'accessories',  icon: '💍', sort_order: 5 },
      { id: 'stationery',   name: 'Stationery',    slug: 'stationery',   icon: '📝', sort_order: 6 },
    ]

    for (const cat of categories) {
      await conn.execute(
        `INSERT IGNORE INTO categories (id, name, slug, icon, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [cat.id, cat.name, cat.slug, cat.icon, cat.sort_order]
      )
    }
    console.log('  ✓ 6 categories seeded')

    // ── Products ────────────────────────────────────────────
    console.log('→ Seeding products…')
    const products = [
      {
        id: uuidv4(), name: 'Reclaimed Teak Coffee Table', slug: 'reclaimed-teak-coffee-table',
        description: 'Hand-crafted from reclaimed teak wood salvaged from decommissioned fishing boats along the Lagos coastline. Each piece bears the unique grain and weathering of its previous life on the water. Finished with natural beeswax polish.',
        price: 85000, compare_price: 110000, category_id: 'furniture', brand_id: 'craftworld',
        stock: 4, is_featured: 1, is_new: 0,
        images: JSON.stringify(['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80']),
        tags: JSON.stringify(['reclaimed', 'teak', 'furniture', 'handcrafted']),
        rating: 4.9, review_count: 38,
      },
      {
        id: uuidv4(), name: 'Aso-oke Fragment Tote Bag', slug: 'asooke-fragment-tote-bag',
        description: 'Woven from salvaged offcuts of aso-oke fabric — the premium handwoven textile used in Yoruba ceremonies. Each bag is uniquely patterned.',
        price: 15500, compare_price: 20000, category_id: 'fashion', brand_id: 'adulawo',
        stock: 20, is_featured: 1, is_new: 0,
        images: JSON.stringify(['https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&q=80']),
        tags: JSON.stringify(['aso-oke', 'tote', 'fashion', 'african-heritage']),
        rating: 5.0, review_count: 54,
      },
      {
        id: uuidv4(), name: 'Recycled Plastic Planter Set', slug: 'recycled-plastic-planter-set',
        description: 'Set of three planters moulded from post-consumer HDPE plastic — water sachets, shampoo bottles, and jerry cans collected from Lagos waste streams.',
        price: 13500, compare_price: 17000, category_id: 'home-decor', brand_id: 'planet3r',
        stock: 40, is_featured: 1, is_new: 0,
        images: JSON.stringify(['https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80']),
        tags: JSON.stringify(['plastic', 'planters', 'home', 'recycled-plastic']),
        rating: 4.8, review_count: 67,
      },
      {
        id: uuidv4(), name: 'Brass Offcut Pendant Necklace', slug: 'brass-offcut-pendant-necklace',
        description: 'Pendant cast from brass offcuts collected from a jewellery workshop in Ibadan. Hand-finished, unique.',
        price: 9800, compare_price: null, category_id: 'accessories', brand_id: 'adulawo',
        stock: 30, is_featured: 0, is_new: 1,
        images: JSON.stringify(['https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&q=80']),
        tags: JSON.stringify(['brass', 'necklace', 'jewellery', 'handcrafted']),
        rating: 4.9, review_count: 41,
      },
      {
        id: uuidv4(), name: 'Recycled Paper Stationery Set', slug: 'recycled-paper-stationery-set',
        description: 'Notebook, notepad, and pen made entirely from recycled office paper. Pen barrel crafted from a recycled aluminium tube.',
        price: 6500, compare_price: null, category_id: 'stationery', brand_id: 'planet3r',
        stock: 50, is_featured: 0, is_new: 1,
        images: JSON.stringify(['https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=800&q=80']),
        tags: JSON.stringify(['stationery', 'paper', 'recycled', 'notebook']),
        rating: 4.6, review_count: 45,
      },
      {
        id: uuidv4(), name: 'Ankara Fabric Earrings', slug: 'ankara-fabric-earrings',
        description: 'Lightweight statement earrings made from ankara print fabric offcuts, stiffened with natural cassava starch.',
        price: 4500, compare_price: null, category_id: 'accessories', brand_id: 'adulawo',
        stock: 45, is_featured: 1, is_new: 1,
        images: JSON.stringify(['https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&q=80']),
        tags: JSON.stringify(['ankara', 'earrings', 'jewellery', 'african-print']),
        rating: 4.9, review_count: 88,
      },
      {
        id: uuidv4(), name: 'Upcycled Tyre Garden Stool', slug: 'upcycled-tyre-garden-stool',
        description: 'Low stool constructed from a vulcanised tyre casing stuffed with compressed recycled fabric and topped with a woven sisal seat.',
        price: 22000, compare_price: 28000, category_id: 'furniture', brand_id: 'planet3r',
        stock: 7, is_featured: 1, is_new: 0,
        images: JSON.stringify(['https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800&q=80']),
        tags: JSON.stringify(['tyre', 'stool', 'furniture', 'upcycled']),
        rating: 4.9, review_count: 25,
      },
      {
        id: uuidv4(), name: 'Scrap Metal Desk Lamp', slug: 'scrap-metal-desk-lamp',
        description: 'Industrial-chic lamp fabricated from scrap steel and copper offcuts from a Kaduna metalworks factory. LED bulb included.',
        price: 32000, compare_price: null, category_id: 'home-decor', brand_id: 'craftworld',
        stock: 6, is_featured: 0, is_new: 1,
        images: JSON.stringify(['https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80']),
        tags: JSON.stringify(['lamp', 'metal', 'industrial', 'lighting']),
        rating: 4.6, review_count: 14,
      },
    ]

    for (const p of products) {
      await conn.execute(
        `INSERT IGNORE INTO products
         (id, name, slug, description, price, compare_price, images, category_id, brand_id,
          stock, tags, rating, review_count, is_featured, is_new)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.name, p.slug, p.description, p.price, p.compare_price, p.images,
         p.category_id, p.brand_id, p.stock, p.tags, p.rating, p.review_count,
         p.is_featured, p.is_new]
      )
    }
    console.log(`  ✓ ${products.length} products seeded`)

    // ── Admin User ──────────────────────────────────────────
    console.log('→ Seeding admin user…')
    const adminEmail    = process.env.ADMIN_EMAIL    ?? 'admin@craftworldcentre.com'
    const adminPassword = process.env.ADMIN_PASSWORD ?? 'AdminSecureP@ss123'
    const adminHash     = await bcrypt.hash(adminPassword, 12)
    const adminId       = uuidv4()

    await conn.execute(
      `INSERT IGNORE INTO users
       (id, first_name, last_name, email, password_hash, role, is_verified, is_active)
       VALUES (?, 'Admin', 'CraftworldCentre', ?, ?, 'admin', 1, 1)`,
      [adminId, adminEmail, adminHash]
    )
    console.log(`  ✓ Admin user created: ${adminEmail}`)

    console.log('\n✅ Database seeded successfully.\n')
  } catch (err) {
    console.error('\n❌ Seed failed:', err)
    process.exit(1)
  } finally {
    await conn.end()
  }
}

seed()
