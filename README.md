# CraftworldCentre — Backend API

> Node.js + Express + TypeScript + MySQL · Circular Economy Marketplace API

---

## Tech Stack

| Layer        | Technology                                   |
|--------------|----------------------------------------------|
| Runtime      | Node.js 22 + TypeScript                      |
| Framework    | Express 4                                    |
| Database     | MySQL 8 (mysql2 + raw queries)               |
| Auth         | JWT (access + refresh) + bcrypt              |
| Payments     | Paystack (inline + webhooks)                 |
| Media        | Cloudinary (upload, transform, delete)       |
| Email        | Nodemailer (SMTP)                            |
| Realtime     | Socket.io                                    |
| Validation   | express-validator                            |
| Security     | helmet, cors, rate-limit, cookie-parser      |
| Docs         | Swagger / OpenAPI 3.0                        |
| Testing      | Jest + supertest                             |
| Logging      | Winston                                      |

---

## Project Structure

```
src/
├── app.ts                   # Express factory (separated for testability)
├── server.ts                # Entry point — HTTP + Socket.io boot
├── config/
│   ├── database.ts          # MySQL2 connection pool + query helpers
│   ├── swagger.ts           # OpenAPI spec config
│   ├── migrate.ts           # Database migration runner
│   └── seed.ts              # Database seeder (brands, categories, products, admin)
├── controllers/
│   └── index.ts             # Auth, Product, Order, Payment, Address, Admin controllers
├── middleware/
│   ├── auth.middleware.ts   # JWT authenticate, requireRole, optionalAuth
│   ├── error.middleware.ts  # Global error handler, 404, asyncHandler
│   └── validate.middleware.ts # express-validator rules for all routes
├── models/
│   ├── auth.model.ts        # User + refresh token DB operations
│   ├── product.model.ts     # Product queries + DTO mapping
│   └── order.model.ts       # Order creation (transactional), listing, status
├── routes/
│   └── index.ts             # All API routes with Swagger JSDoc comments
├── services/
│   ├── email.service.ts     # Nodemailer templates (welcome, order, reset)
│   ├── paystack.service.ts  # Paystack verify + webhook validation
│   └── cloudinary.service.ts# Cloudinary upload/delete helpers
├── sockets/
│   └── index.ts             # Socket.io — order updates, admin dashboard
├── types/
│   └── index.ts             # All TypeScript interfaces
└── utils/
    ├── crypto.ts            # randomToken, hashToken, slugify, pagination
    ├── helpers.ts           # Sanitisation, validation, delivery fee calc
    ├── jwt.ts               # generateTokenPair, verifyAccessToken
    ├── logger.ts            # Winston logger
    └── response.ts          # ok(), created(), paginated(), badRequest() etc.
tests/
├── unit/
│   └── auth.test.ts         # JWT, crypto, helper unit tests
└── integration/
    └── products.test.ts     # Product route integration tests (mocked DB)
```

---

## Setup

### 1. Install dependencies
```bash
cd craftworldcentre-backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your values — see .env.example for all required variables
```

### 3. Create database and run migrations
```bash
# Make sure MySQL is running, then:
npm run db:migrate
```

### 4. Seed initial data
```bash
npm run db:seed
# Creates: 3 brands, 6 categories, 8 products, 1 admin user
```

### 5. Start development server
```bash
npm run dev
# Server:   http://localhost:5000
# API docs: http://localhost:5000/api/docs
```

---

## API Reference

Full Swagger documentation available at `http://localhost:5000/api/docs` when running in development.

### Base URL
```
http://localhost:5000/api/v1
```

### Authentication
All protected routes require:
```
Authorization: Bearer <access_token>
```

Obtain tokens via `POST /auth/login` or `POST /auth/register`.

### Key Endpoints

| Method | Path                          | Auth     | Description                    |
|--------|-------------------------------|----------|--------------------------------|
| POST   | `/auth/register`              | Public   | Create new account             |
| POST   | `/auth/login`                 | Public   | Login, returns JWT             |
| POST   | `/auth/logout`                | Public   | Clear refresh token cookie     |
| POST   | `/auth/refresh`               | Cookie   | Get new access token           |
| POST   | `/auth/forgot-password`       | Public   | Send reset link email          |
| POST   | `/auth/reset-password`        | Public   | Reset with token               |
| GET    | `/auth/me`                    | Auth     | Get current user               |
| PUT    | `/auth/me`                    | Auth     | Update profile                 |
| PUT    | `/auth/me/password`           | Auth     | Change password                |
| GET    | `/products`                   | Public   | List with filters/pagination   |
| GET    | `/products/featured`          | Public   | Featured products              |
| GET    | `/products/new`               | Public   | New arrivals                   |
| GET    | `/products/:slug`             | Public   | Product detail                 |
| GET    | `/products/:slug/related`     | Public   | Related products               |
| GET    | `/products/:slug/reviews`     | Public   | Product reviews                |
| POST   | `/products/:slug/reviews`     | Auth     | Submit review                  |
| GET    | `/categories`                 | Public   | All categories with count      |
| GET    | `/brands`                     | Public   | All brands                     |
| GET    | `/brands/:id/products`        | Public   | Products by brand              |
| POST   | `/orders`                     | Auth     | Create order (reserves stock)  |
| GET    | `/orders`                     | Auth     | My orders                      |
| GET    | `/orders/:reference`          | Auth     | Order detail with items        |
| POST   | `/orders/:reference/cancel`   | Auth     | Cancel order                   |
| POST   | `/payments/verify`            | Auth     | Verify Paystack payment        |
| POST   | `/payments/webhook`           | Paystack | Paystack webhook receiver      |
| GET    | `/addresses`                  | Auth     | My saved addresses             |
| POST   | `/addresses`                  | Auth     | Add address                    |
| PUT    | `/addresses/:id`              | Auth     | Update address                 |
| DELETE | `/addresses/:id`              | Auth     | Delete address                 |
| PATCH  | `/addresses/:id/default`      | Auth     | Set default address            |
| POST   | `/newsletter/subscribe`       | Public   | Email newsletter subscribe     |
| GET    | `/admin/dashboard`            | Admin    | Dashboard stats                |
| POST   | `/admin/products`             | Admin    | Create product                 |
| PUT    | `/admin/products/:id`         | Admin    | Update product                 |
| DELETE | `/admin/products/:id`         | Admin    | Deactivate product             |
| POST   | `/admin/products/:id/images`  | Admin    | Upload product images          |
| GET    | `/admin/orders`               | Admin    | All orders                     |
| PATCH  | `/admin/orders/:ref/status`   | Admin    | Update order status            |
| GET    | `/admin/users`                | Admin    | All users                      |

---

## Socket.io Events

### Client → Server
| Event                  | Payload          | Description               |
|------------------------|------------------|---------------------------|
| `admin:join_dashboard` | —                | Join admin real-time room |
| `order:track`          | `reference`      | Track specific order      |
| `order:untrack`        | `reference`      | Stop tracking order       |

### Server → Client
| Event                    | Payload                          | Description                  |
|--------------------------|----------------------------------|------------------------------|
| `order:confirmed`        | `{orderId, reference, total}`    | Payment verified             |
| `order:status_updated`   | `{reference, status}`            | Order status changed         |
| `product:stock_updated`  | `{productId, stock}`             | Stock level changed          |
| `admin:new_order`        | `{order}`                        | New order received (admin)   |
| `admin:stats_updated`    | `{metric, value}`                | Dashboard metric changed     |
| `notification`           | `{type, message}`                | General user notification    |

---

## Security

- **JWT**: Short-lived access tokens (15min) + long-lived refresh tokens (7d) stored in HTTP-only cookies
- **Bcrypt**: Password hashing with configurable rounds (default: 12)
- **Rate limiting**: Global + strict auth rate limits
- **Helmet**: Security headers (CSP, XSS, HSTS etc.)
- **Paystack webhooks**: HMAC-SHA512 signature validation
- **SQL injection**: 100% parameterised queries via mysql2 prepared statements
- **Input validation**: express-validator on all input-accepting routes
- **CORS**: Strict origin allowlist

---

## Testing
```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

---

## Default Admin Credentials
```
Email:    admin@craftworldcentre.com   (or your ADMIN_EMAIL env var)
Password: AdminSecureP@ss123           (or your ADMIN_PASSWORD env var)
```
⚠️ Change these immediately in production.
# CW_Backend
