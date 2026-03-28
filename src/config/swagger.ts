import swaggerJsdoc from 'swagger-jsdoc'

const PORT = process.env.PORT ?? '5000'

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'CraftworldCentre API',
      version:     '1.0.0',
      description: `
REST API for CraftworldCentre — Nigeria's circular economy marketplace.

**Authentication**: Most endpoints require a Bearer JWT token in the Authorization header.
Obtain tokens via \`POST /auth/login\` or \`POST /auth/register\`.

**Partner Brands**: CraftworldCentre, Adúláwò, Planet 3R

**Currency**: All prices are in Nigerian Naira (₦). Paystack processes payments in kobo (multiply by 100).
      `,
      contact: {
        name:  'CraftworldCentre Support',
        email: 'hello@craftworldcentre.com',
        url:   'https://craftworldcentre.com',
      },
    },
    servers: [
      {
        url:         `http://localhost:${PORT}/api/v1`,
        description: 'Development server',
      },
      {
        url:         'https://api.craftworldcentre.com/api/v1',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type:   'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token. Obtain via /auth/login',
        },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data:    { type: 'object' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id:         { type: 'string', format: 'uuid' },
            firstName:  { type: 'string' },
            lastName:   { type: 'string' },
            email:      { type: 'string', format: 'email' },
            phone:      { type: 'string', nullable: true },
            avatar:     { type: 'string', nullable: true },
            role:       { type: 'string', enum: ['customer', 'admin', 'vendor'] },
            isVerified: { type: 'boolean' },
            createdAt:  { type: 'string', format: 'date-time' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id:           { type: 'string', format: 'uuid' },
            name:         { type: 'string' },
            slug:         { type: 'string' },
            description:  { type: 'string' },
            price:        { type: 'number' },
            comparePrice: { type: 'number', nullable: true },
            images:       { type: 'array', items: { type: 'string' } },
            category:     { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
            brand:        { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
            stock:        { type: 'integer' },
            rating:       { type: 'number' },
            reviewCount:  { type: 'integer' },
            isNew:        { type: 'boolean' },
            isFeatured:   { type: 'boolean' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id:        { type: 'string', format: 'uuid' },
            reference: { type: 'string' },
            status:    { type: 'string', enum: ['pending','payment_pending','confirmed','processing','shipped','delivered','cancelled','refunded'] },
            pricing: {
              type: 'object',
              properties: {
                subtotal:    { type: 'number' },
                deliveryFee: { type: 'number' },
                discount:    { type: 'number' },
                total:       { type: 'number' },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page:  { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            pages: { type: 'integer' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors:  { type: 'object' },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { success: false, message: 'No authentication token provided' },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { success: false, message: 'Not found' },
            },
          },
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { success: false, message: 'Validation failed', errors: { email: ['Valid email is required'] } },
            },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: 'Auth',       description: 'Authentication and account management' },
      { name: 'Products',   description: 'Product browsing and discovery' },
      { name: 'Orders',     description: 'Order creation and management' },
      { name: 'Payments',   description: 'Paystack payment processing' },
      { name: 'Addresses',  description: 'Saved delivery addresses' },
      { name: 'Categories', description: 'Product categories' },
      { name: 'Brands',     description: 'Partner brands' },
      { name: 'Admin',      description: 'Admin-only endpoints (requires admin role)' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
}

export const swaggerSpec = swaggerJsdoc(options)
