/**
 * Hero Image Model
 * Manages hero carousel images for the shop page
 */

import { query, queryOne, execute } from '@/config/database'
import { v4 as uuidv4 } from 'uuid'

export interface HeroImage {
  id: string
  image_url: string
  title: string
  subtitle: string
  tag: string
  alt_text: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateHeroImageInput {
  image_url: string
  title: string
  subtitle: string
  tag: string
  alt_text: string
  sort_order?: number
}

export interface UpdateHeroImageInput {
  image_url?: string
  title?: string
  subtitle?: string
  tag?: string
  alt_text?: string
  sort_order?: number
  is_active?: boolean
}

/**
 * Get all active hero images ordered by sort_order
 */
export async function getAllHeroImages(): Promise<HeroImage[]> {
  const results = await query<HeroImage>(
    `SELECT * FROM hero_images 
     WHERE is_active = 1 
     ORDER BY sort_order ASC`
  )
  return results
}

/**
 * Get a single hero image by ID
 */
export async function getHeroImageById(id: string): Promise<HeroImage | null> {
  const result = await queryOne<HeroImage>(
    'SELECT * FROM hero_images WHERE id = ?',
    [id]
  )
  return result || null
}

/**
 * Create a new hero image
 */
export async function createHeroImage(input: CreateHeroImageInput): Promise<HeroImage> {
  const id = uuidv4()
  const now = new Date().toISOString()
  const sort_order = input.sort_order ?? 999

  await execute(
    `INSERT INTO hero_images 
     (id, image_url, title, subtitle, tag, alt_text, sort_order, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  , [id, input.image_url, input.title, input.subtitle, input.tag, input.alt_text, sort_order, now, now])

  const heroImage = await getHeroImageById(id)
  if (!heroImage) throw new Error('Failed to create hero image')

  return heroImage
}

/**
 * Update a hero image
 */
export async function updateHeroImage(id: string, input: UpdateHeroImageInput): Promise<HeroImage> {
  const fields: string[] = []
  const values: any[] = []

  if (input.image_url !== undefined) {
    fields.push('image_url = ?')
    values.push(input.image_url)
  }
  if (input.title !== undefined) {
    fields.push('title = ?')
    values.push(input.title)
  }
  if (input.subtitle !== undefined) {
    fields.push('subtitle = ?')
    values.push(input.subtitle)
  }
  if (input.tag !== undefined) {
    fields.push('tag = ?')
    values.push(input.tag)
  }
  if (input.alt_text !== undefined) {
    fields.push('alt_text = ?')
    values.push(input.alt_text)
  }
  if (input.sort_order !== undefined) {
    fields.push('sort_order = ?')
    values.push(input.sort_order)
  }
  if (input.is_active !== undefined) {
    fields.push('is_active = ?')
    values.push(input.is_active ? 1 : 0)
  }

  if (fields.length === 0) {
    const existing = await getHeroImageById(id)
    if (!existing) throw new Error('Hero image not found')
    return existing
  }

  fields.push('updated_at = ?')
  values.push(new Date().toISOString())

  values.push(id)

  await execute(
    `UPDATE hero_images SET ${fields.join(', ')} WHERE id = ?`,
    values
  )

  const updated = await getHeroImageById(id)
  if (!updated) throw new Error('Failed to update hero image')

  return updated
}

/**
 * Delete a hero image (soft delete - deactivate)
 */
export async function deleteHeroImage(id: string): Promise<void> {
  const exists = await getHeroImageById(id)
  if (!exists) throw new Error('Hero image not found')

  await execute(
    'UPDATE hero_images SET is_active = 0, updated_at = ? WHERE id = ?',
    [new Date().toISOString(), id]
  )
}

/**
 * Permanently delete a hero image
 */
export async function permanentlyDeleteHeroImage(id: string): Promise<void> {
  const exists = await getHeroImageById(id)
  if (!exists) throw new Error('Hero image not found')

  await execute(
    'DELETE FROM hero_images WHERE id = ?',
    [id]
  )
}

/**
 * Reorder hero images
 */
export async function reorderHeroImages(order: Record<string, number>): Promise<void> {
  const now = new Date().toISOString()
  const updates = Object.entries(order).map(([id, sort_order]) =>
    execute(
      'UPDATE hero_images SET sort_order = ?, updated_at = ? WHERE id = ?',
      [sort_order, now, id]
    )
  )
  await Promise.all(updates)
}
