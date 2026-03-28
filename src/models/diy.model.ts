import { v4 as uuidv4 } from 'uuid'
import { query, queryOne, execute } from '@/config/database'

export interface DiyVideoRow {
  id: string; title: string; description: string | null; youtube_id: string
  thumbnail: string | null; duration: string | null; category: string
  brand_id: string | null; tags: string; view_count: number
  is_published: number; sort_order: number; created_by: string | null
  created_at: Date; updated_at: Date
  brand_name?: string; brand_color?: string
}

// ── List published videos ─────────────────────────────────────
export async function listPublished(
  category?: string, search?: string, page = 1, limit = 12
): Promise<{ rows: DiyVideoRow[]; total: number }> {
  const offset = (page - 1) * limit
  const conditions = ['d.is_published = 1']
  const params: unknown[] = []

  if (category && category !== 'All') {
    conditions.push('d.category = ?')
    params.push(category)
  }
  if (search) {
    conditions.push('(d.title LIKE ? OR d.description LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }

  const WHERE = `WHERE ${conditions.join(' AND ')}`

  const [rows, count] = await Promise.all([
    query<DiyVideoRow>(
      `SELECT d.*, b.name AS brand_name, b.color AS brand_color
       FROM diy_videos d
       LEFT JOIN brands b ON b.id = d.brand_id
       ${WHERE}
       ORDER BY d.sort_order ASC, d.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ),
    query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM diy_videos d ${WHERE}`,
      params
    ),
  ])

  return { rows, total: count[0]?.total ?? 0 }
}

// ── Admin: list all ───────────────────────────────────────────
export async function listAll(page = 1, limit = 20): Promise<{ rows: DiyVideoRow[]; total: number }> {
  const offset = (page - 1) * limit
  const [rows, count] = await Promise.all([
    query<DiyVideoRow>(
      `SELECT d.*, b.name AS brand_name
       FROM diy_videos d
       LEFT JOIN brands b ON b.id = d.brand_id
       ORDER BY d.sort_order ASC, d.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    ),
    query<{ total: number }>('SELECT COUNT(*) AS total FROM diy_videos'),
  ])
  return { rows, total: count[0]?.total ?? 0 }
}

// ── Create ─────────────────────────────────────────────────────
export async function createVideo(data: {
  title: string; description?: string; youtubeId: string; thumbnail?: string
  duration?: string; category: string; brandId?: string; tags?: string[]
  sortOrder?: number; createdBy: string
}): Promise<DiyVideoRow> {
  const id = uuidv4()
  await execute(
    `INSERT INTO diy_videos
     (id, title, description, youtube_id, thumbnail, duration, category, brand_id, tags, sort_order, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, data.title, data.description ?? null, data.youtubeId,
      data.thumbnail ?? null, data.duration ?? null, data.category,
      data.brandId ?? null, JSON.stringify(data.tags ?? []),
      data.sortOrder ?? 0, data.createdBy,
    ]
  )
  return queryOne<DiyVideoRow>('SELECT * FROM diy_videos WHERE id = ?', [id]) as Promise<DiyVideoRow>
}

// ── Update ─────────────────────────────────────────────────────
export async function updateVideo(
  id: string,
  data: Partial<{
    title: string; description: string; youtubeId: string; thumbnail: string
    duration: string; category: string; brandId: string | null
    tags: string[]; sortOrder: number; isPublished: boolean
  }>
): Promise<DiyVideoRow | null> {
  const fields: string[] = []
  const values: unknown[] = []

  if (data.title !== undefined)       { fields.push('title = ?');        values.push(data.title) }
  if (data.description !== undefined) { fields.push('description = ?');  values.push(data.description) }
  if (data.youtubeId !== undefined)   { fields.push('youtube_id = ?');   values.push(data.youtubeId) }
  if (data.thumbnail !== undefined)   { fields.push('thumbnail = ?');    values.push(data.thumbnail) }
  if (data.duration !== undefined)    { fields.push('duration = ?');     values.push(data.duration) }
  if (data.category !== undefined)    { fields.push('category = ?');     values.push(data.category) }
  if (data.brandId !== undefined)     { fields.push('brand_id = ?');     values.push(data.brandId) }
  if (data.tags !== undefined)        { fields.push('tags = ?');         values.push(JSON.stringify(data.tags)) }
  if (data.sortOrder !== undefined)   { fields.push('sort_order = ?');   values.push(data.sortOrder) }
  if (data.isPublished !== undefined) { fields.push('is_published = ?'); values.push(data.isPublished ? 1 : 0) }

  if (fields.length === 0) return queryOne<DiyVideoRow>('SELECT * FROM diy_videos WHERE id = ?', [id])

  values.push(id)
  await execute(`UPDATE diy_videos SET ${fields.join(', ')} WHERE id = ?`, values)
  return queryOne<DiyVideoRow>('SELECT * FROM diy_videos WHERE id = ?', [id])
}

// ── Delete ─────────────────────────────────────────────────────
export async function deleteVideo(id: string): Promise<void> {
  await execute('DELETE FROM diy_videos WHERE id = ?', [id])
}

// ── Increment view count ──────────────────────────────────────
export async function incrementViews(id: string): Promise<void> {
  await execute('UPDATE diy_videos SET view_count = view_count + 1 WHERE id = ?', [id])
}

// ── DTO ───────────────────────────────────────────────────────
export function toDiyDTO(row: DiyVideoRow) {
  return {
    id:          row.id,
    title:       row.title,
    description: row.description ?? undefined,
    youtubeId:   row.youtube_id,
    thumbnail:   row.thumbnail ?? `https://img.youtube.com/vi/${row.youtube_id}/hqdefault.jpg`,
    duration:    row.duration ?? undefined,
    category:    row.category,
    brand:       row.brand_name ? { name: row.brand_name, color: row.brand_color } : null,
    tags:        typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
    viewCount:   row.view_count,
    isPublished: row.is_published === 1,
    sortOrder:   row.sort_order,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}
