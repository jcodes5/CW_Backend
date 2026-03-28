/**
 * Product Routes Integration Tests
 * Spins up the Express app and hits the actual endpoints
 * Requires a running MySQL database with seeded data
 *
 * Run with: NODE_ENV=test npm test
 */

import request from 'supertest'

// We mock the DB so tests don't need a real MySQL connection
jest.mock('../../src/config/database', () => ({
  query:    jest.fn(),
  queryOne: jest.fn(),
  execute:  jest.fn(),
  withTransaction: jest.fn((cb: (conn: unknown) => Promise<unknown>) => cb({})),
  testDatabaseConnection: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), http: jest.fn() },
  httpLogStream: { write: jest.fn() },
}))

const mockProduct = {
  id: 'prod-001', name: 'Test Teak Table', slug: 'test-teak-table',
  description: 'A test product', price: '50000', compare_price: null,
  images: '["https://example.com/img.jpg"]', category_id: 'furniture',
  brand_id: 'craftworld', stock: 5, tags: '["test"]', rating: '4.8',
  review_count: 10, is_new: 0, is_featured: 1, is_active: 1,
  created_at: new Date(), updated_at: new Date(),
  category_name: 'Furniture', category_slug: 'furniture', category_icon: '🪑',
  brand_name: 'CraftworldCentre', brand_color: '#1A7A8A', brand_accent_color: '#7BC8D8',
}

import { query, queryOne } from '../../src/config/database'
const mockQuery = query as jest.MockedFunction<typeof query>
const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>

// Lazily import app after mocks are set up
let app: Express.Application

beforeAll(async () => {
  const { createApp } = await import('../../src/app')
  app = createApp()
})

afterEach(() => jest.clearAllMocks())

describe('GET /api/v1/products', () => {
  it('should return paginated products', async () => {
    mockQuery
      .mockResolvedValueOnce([mockProduct])           // products query
      .mockResolvedValueOnce([{ total: 1 }])           // count query

    const res = await request(app).get('/api/v1/products')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeInstanceOf(Array)
    expect(res.body.pagination).toBeDefined()
    expect(res.body.pagination.total).toBe(1)
  })

  it('should accept brand filter', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])

    const res = await request(app).get('/api/v1/products?brand=craftworld')
    expect(res.status).toBe(200)
  })

  it('should reject invalid sort option', async () => {
    const res = await request(app).get('/api/v1/products?sort=invalid')
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

describe('GET /api/v1/products/:slug', () => {
  it('should return a product by slug', async () => {
    mockQuery.mockResolvedValueOnce([mockProduct])

    const res = await request(app).get('/api/v1/products/test-teak-table')
    expect(res.status).toBe(200)
    expect(res.body.data.slug).toBe('test-teak-table')
  })

  it('should return 404 for unknown slug', async () => {
    mockQuery.mockResolvedValueOnce([])

    const res = await request(app).get('/api/v1/products/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })
})

describe('GET /api/v1/products/featured', () => {
  it('should return featured products', async () => {
    mockQuery.mockResolvedValueOnce([mockProduct])

    const res = await request(app).get('/api/v1/products/featured')
    expect(res.status).toBe(200)
    expect(res.body.data).toBeInstanceOf(Array)
  })
})

describe('GET /api/v1/health', () => {
  it('should return 200 with healthy status', async () => {
    const res = await request(app).get('/api/v1/health')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toContain('running')
  })
})

describe('GET /api/v1/categories', () => {
  it('should return list of categories', async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 'furniture', name: 'Furniture', slug: 'furniture', icon: '🪑', product_count: 3 },
    ])

    const res = await request(app).get('/api/v1/categories')
    expect(res.status).toBe(200)
    expect(res.body.data).toBeInstanceOf(Array)
  })
})
