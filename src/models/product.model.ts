import { v4 as uuidv4 } from 'uuid'
import { query, execute } from '@/config/database'
import type { ProductRow, ProductFilters } from '@/types'
import { slugify } from '@/utils/crypto'

// ── List with filters, pagination ────────────────────────────
export async function listProducts(filters: ProductFilters): Promise<{
  rows: ProductRow[]
  total: number
}> {
  const page   = Math.max(1, filters.page  ?? 1)
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 12))
  const offset = (page - 1) * limit

  const conditions: string[] = ['p.is_active = 1']
  const params:     unknown[] = []

  if (filters.brand) {
    conditions.push('p.brand_id = ?')
    params.push(filters.brand)
  }
  if (filters.category) {
    conditions.push('c.slug = ?')
    params.push(filters.category)
  }
  if (filters.search) {
    conditions.push('MATCH(p.name, p.description) AGAINST(? IN BOOLEAN MODE)')
    params.push(`${filters.search}*`)
  }
  if (filters.minPrice !== undefined) {
    conditions.push('p.price >= ?')
    params.push(filters.minPrice)
  }
  if (filters.maxPrice !== undefined) {
    conditions.push('p.price <= ?')
    params.push(filters.maxPrice)
  }
  if (filters.filter === 'new')        { conditions.push('p.is_new = 1') }
  if (filters.filter === 'featured')   { conditions.push('p.is_featured = 1') }
  if (filters.filter === 'bestsellers') { conditions.push('p.review_count > 20') }

  const WHERE = `WHERE ${conditions.join(' AND ')}`

  const sortMap: Record<string, string> = {
    'featured':   'p.is_featured DESC, p.created_at DESC',
    'newest':     'p.created_at DESC',
    'price-asc':  'p.price ASC',
    'price-desc': 'p.price DESC',
    'rating':     'p.rating DESC, p.review_count DESC',
  }
  const ORDER = `ORDER BY ${sortMap[filters.sort ?? 'featured'] ?? sortMap.featured}`

  const [rows, countRows] = await Promise.all([
    query<ProductRow>(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
              b.name AS brand_name, b.color AS brand_color, b.accent_color AS brand_accent_color
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN brands b ON b.id = p.brand_id
       ${WHERE} ${ORDER} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ),
    query<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN brands b ON b.id = p.brand_id
       ${WHERE}`,
      params
    ),
  ])

  return { rows, total: countRows[0]?.total ?? 0 }
}

// ── Find by slug ──────────────────────────────────────────────
export async function findBySlug(slug: string): Promise<ProductRow | null> {
  const rows = await query<ProductRow>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
            b.name AS brand_name, b.color AS brand_color, b.accent_color AS brand_accent_color
     FROM products p
     JOIN categories c ON c.id = p.category_id
     JOIN brands b ON b.id = p.brand_id
     WHERE p.slug = ? AND p.is_active = 1 LIMIT 1`,
    [slug]
  )
  return rows[0] ?? null
}

// ── Find by ID ────────────────────────────────────────────────
export async function findById(id: string): Promise<ProductRow | null> {
  const rows = await query<ProductRow>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
            b.name AS brand_name, b.color AS brand_color, b.accent_color AS brand_accent_color
     FROM products p
     JOIN categories c ON c.id = p.category_id
     JOIN brands b ON b.id = p.brand_id
     WHERE p.id = ? AND p.is_active = 1 LIMIT 1`,
    [id]
  )
  return rows[0] ?? null
}

// ── Featured products ─────────────────────────────────────────
export async function getFeatured(limit = 8): Promise<ProductRow[]> {
  return query<ProductRow>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
            b.name AS brand_name, b.color AS brand_color, b.accent_color AS brand_accent_color
     FROM products p
     JOIN categories c ON c.id = p.category_id
     JOIN brands b ON b.id = p.brand_id
     WHERE p.is_active = 1 AND p.is_featured = 1
     ORDER BY p.rating DESC, p.review_count DESC
     LIMIT ?`,
    [limit]
  )
}

// ── New arrivals ──────────────────────────────────────────────
export async function getNew(limit = 8): Promise<ProductRow[]> {
  return query<ProductRow>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
            b.name AS brand_name, b.color AS brand_color, b.accent_color AS brand_accent_color
     FROM products p
     JOIN categories c ON c.id = p.category_id
     JOIN brands b ON b.id = p.brand_id
     WHERE p.is_active = 1 AND p.is_new = 1
     ORDER BY p.created_at DESC
     LIMIT ?`,
    [limit]
  )
}

// ── Related products ──────────────────────────────────────────
export async function getRelated(
  productId: string,
  categoryId: string,
  brandId: string,
  limit = 4
): Promise<ProductRow[]> {
  return query<ProductRow>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
            b.name AS brand_name, b.color AS brand_color, b.accent_color AS brand_accent_color
     FROM products p
     JOIN categories c ON c.id = p.category_id
     JOIN brands b ON b.id = p.brand_id
     WHERE p.is_active = 1 AND p.id != ?
       AND (p.category_id = ? OR p.brand_id = ?)
     ORDER BY p.rating DESC
     LIMIT ?`,
    [productId, categoryId, brandId, limit]
  )
}

// ── Decrement stock (with check) ──────────────────────────────
export async function decrementStock(
  productId: string,
  quantity: number,
  conn?: import('mysql2/promise').PoolConnection
): Promise<boolean> {
  const sql = `UPDATE products SET stock = stock - ?
               WHERE id = ? AND stock >= ? AND is_active = 1`
  let affectedRows: number

  if (conn) {
    const [result] = await conn.execute(sql, [quantity, productId, quantity])
    affectedRows = (result as import('mysql2').ResultSetHeader).affectedRows
  } else {
    const res = await execute(sql, [quantity, productId, quantity])
    affectedRows = res.affectedRows
  }

  return affectedRows > 0
}

// ── Admin: create product ─────────────────────────────────────
export async function createProduct(data: {
  name: string; description: string; price: number; comparePrice?: number
  images: string[]; specifications?: Record<string, string>; categoryId: string; brandId: string; stock: number
  weightKg?: number; tags: string[]; isFeatured?: boolean; isNew?: boolean
}): Promise<ProductRow> {
  const id   = uuidv4()
  const slug = slugify(data.name)

  await execute(
    `INSERT INTO products
     (id, name, slug, description, price, compare_price, images, specifications, category_id, brand_id,
      stock, weight_kg, tags, is_featured, is_new)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, data.name, slug, data.description, data.price,
      data.comparePrice ?? null, JSON.stringify(data.images),
      data.specifications ? JSON.stringify(data.specifications) : null,
      data.categoryId, data.brandId, data.stock,
      data.weightKg ?? 0.5, JSON.stringify(data.tags), 
      data.isFeatured ? 1 : 0, data.isNew ? 1 : 0,
    ]
  )

  return findById(id) as Promise<ProductRow>
}

// ── Admin: update product ─────────────────────────────────────
export async function updateProduct(
  id: string,
  data: Partial<{
    name: string; description: string; price: number; comparePrice: number | null
    images: string[]; specifications: Record<string, string>; categoryId: string; brandId: string; stock: number
    weightKg: number; tags: string[]; isFeatured: boolean; isNew: boolean; isActive: boolean
  }>
): Promise<ProductRow | null> {
  const fields: string[] = []
  const values: unknown[] = []

  if (data.name !== undefined)         { fields.push('name = ?');          values.push(data.name);                    fields.push('slug = ?'); values.push(slugify(data.name)) }
  if (data.description !== undefined)  { fields.push('description = ?');   values.push(data.description)              }
  if (data.price !== undefined)        { fields.push('price = ?');          values.push(data.price)                    }
  if (data.comparePrice !== undefined) { fields.push('compare_price = ?'); values.push(data.comparePrice)             }
  if (data.images !== undefined)       { fields.push('images = ?');         values.push(JSON.stringify(data.images))  }
  if (data.specifications !== undefined) { fields.push('specifications = ?'); values.push(JSON.stringify(data.specifications)) }
  if (data.categoryId !== undefined)   { fields.push('category_id = ?');   values.push(data.categoryId)               }
  if (data.brandId !== undefined)      { fields.push('brand_id = ?');      values.push(data.brandId)                 }
  if (data.stock !== undefined)        { fields.push('stock = ?');          values.push(data.stock)                   }
  if (data.weightKg !== undefined)     { fields.push('weight_kg = ?');     values.push(data.weightKg)                }
  if (data.tags !== undefined)         { fields.push('tags = ?');           values.push(JSON.stringify(data.tags))    }
  if (data.isFeatured !== undefined)   { fields.push('is_featured = ?');   values.push(data.isFeatured ? 1 : 0)       }
  if (data.isNew !== undefined)        { fields.push('is_new = ?');         values.push(data.isNew ? 1 : 0)           }
  if (data.isActive !== undefined)     { fields.push('is_active = ?');      values.push(data.isActive ? 1 : 0)        }

  if (fields.length === 0) return findById(id)

  values.push(id)
  await execute(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values)
  return findById(id)
}

// ── Recalculate rating after review ──────────────────────────
export async function recalculateRating(productId: string): Promise<void> {
  await execute(
    `UPDATE products p
     SET p.rating = (
       SELECT COALESCE(AVG(r.rating), 0) FROM product_reviews r WHERE r.product_id = p.id
     ),
     p.review_count = (
       SELECT COUNT(*) FROM product_reviews r WHERE r.product_id = p.id
     )
     WHERE p.id = ?`,
    [productId]
  )
}

// ── Map row to DTO ────────────────────────────────────────────
export function toProductDTO(row: ProductRow) {
  return {
    id:           row.id,
    name:         row.name,
    slug:         row.slug,
    description:  row.description,
    price:        Number(row.price),
    comparePrice: row.compare_price ? Number(row.compare_price) : undefined,
    images:       parseImagesField(row.images),
    specifications: typeof row.specifications === 'string' ? safelyParseJSON(row.specifications, {}) : (row.specifications || {}),
    category: {
      id:   row.category_id,
      name: row.category_name ?? '',
      slug: row.category_slug ?? '',
      icon: row.category_icon ?? '📦',
    },
    brand: {
      id:          row.brand_id,
      name:        row.brand_name ?? '',
      color:       row.brand_color ?? '#1A7A8A',
      accentColor: row.brand_accent_color ?? '#7BC8D8',
    },
    stock:       row.stock,
    tags:        typeof row.tags === 'string' ? safelyParseJSON(row.tags, []) : row.tags,
    rating:      Number(row.rating),
    reviewCount: row.review_count,
    isNew:       row.is_new === 1,
    isFeatured:  row.is_featured === 1,
    createdAt:   row.created_at,
  }
}

function parseImagesField(images: any): string[] {
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error parsing images field:', error);
      return [];
    }
  }
  return Array.isArray(images) ? images : (images || []);
}

function safelyParseJSON(jsonString: string, defaultValue: any) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error parsing JSON field:', error);
    return defaultValue;
  }
}
