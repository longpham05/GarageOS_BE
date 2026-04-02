# GarageOS Backend API

## Stack
- **Runtime**: Node.js + TypeScript
- **Framework**: Express
- **ORM**: Prisma (PostgreSQL)
- **Auth**: JWT (access + refresh token rotation)
- **Validation**: Zod
- **File uploads**: Multer (local disk; swap to S3 later)

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env and fill in your values
cp .env.example .env

# 3. Generate Prisma client
npm run prisma:generate

# 4. Run migrations (creates all tables)
npm run prisma:migrate

# 5. Seed demo data
npm run prisma:seed

# 6. Start dev server
npm run dev
```

---

## Demo Credentials (from seed)

| Role     | Email                     | Password      |
|----------|---------------------------|---------------|
| Admin    | admin@garageos.vn         | Admin@123     |
| Garage   | garage1@garageos.vn       | Garage@123    |
| Supplier | supplier1@garageos.vn     | Supplier@123  |
| Supplier | supplier2@garageos.vn     | Supplier@123  |

---

## Authentication

All protected endpoints require:
```
Authorization: Bearer <access_token>
```

### POST /api/auth/login
```json
{ "email": "garage1@garageos.vn", "password": "Garage@123" }
```
Returns `accessToken` (15min) + `refreshToken` (7 days).

### POST /api/auth/refresh
```json
{ "refreshToken": "<token>" }
```

### POST /api/auth/logout
```json
{ "refreshToken": "<token>" }
```

### POST /api/auth/register/garage
```json
{
  "email": "new@garage.vn",
  "password": "Password8",
  "name": "My Garage",
  "phone": "0901234567",
  "address": "123 Street",
  "contactPerson": "Nguyen Van A"
}
```

### GET /api/auth/me
Returns the current user's JWT payload.

---

## The Minimum Value Loop

### Step 1 – Garage submits an RFQ

**POST /api/rfqs** *(GARAGE only)*
```
Content-Type: multipart/form-data

licensePlate: 51F-123.45
requestType:  TYRE          # TYRE | OIL | OTHER
description:  Thay 2 lốp trước, size 185/65R15
priority:     URGENT        # NORMAL | URGENT
attachments:  <file>        # up to 5 files, 10MB each
```

Vehicle is auto-created/updated from the license plate — garages never need to pre-register a car.

---

### Step 2 – Supplier views RFQ inbox and quotes

**GET /api/rfqs** *(all roles)*
- Suppliers see all open RFQs
- Garages see only their own

Query params: `status`, `page`, `limit`

**GET /api/rfqs/:id**
Full RFQ detail including all quotations.

**POST /api/quotations** *(SUPPLIER only)*
```json
{
  "rfqId": "clx...",
  "price": 850000,
  "etaMinutes": 45,
  "notes": "Lốp Bridgestone chính hãng"
}
```
A supplier can update their quotation by submitting again (upsert). RFQ status auto-transitions NEW → QUOTING.

---

### Step 3 – Garage picks a quotation → Order created

**GET /api/quotations/rfq/:rfqId** *(GARAGE, ADMIN)*
Sorted by price ascending.

**POST /api/orders** *(GARAGE only)*
```json
{
  "rfqId": "clx...",
  "quotationId": "clx..."
}
```
This atomically:
1. Marks the selected quotation as SELECTED
2. Rejects all other quotations
3. Closes the RFQ
4. Creates the Order (status: CREATED)
5. Logs an ORDER_CREATED event

---

### Step 4 – Order tracking

**GET /api/orders** — list with optional `status` filter
**GET /api/orders/:id** — full order detail with event log

**PATCH /api/orders/:id/status** *(SUPPLIER, ADMIN)*
```json
{ "status": "CONFIRMED", "note": "optional reason" }
```

Valid transitions:
```
CREATED → CONFIRMED | CANCELLED
CONFIRMED → IN_TRANSIT | CANCELLED
IN_TRANSIT → DELIVERED | CANCELLED
```

---

## Admin Endpoints

All require ADMIN role.

| Method | Path                        | Description                          |
|--------|-----------------------------|--------------------------------------|
| GET    | /api/admin/dashboard        | Live metrics (RFQs, orders, alerts)  |
| GET    | /api/admin/rfqs             | All RFQs with filter                 |
| GET    | /api/admin/orders           | All orders with filter               |
| GET    | /api/admin/suppliers        | All suppliers + counts               |
| GET    | /api/admin/garages          | All garages + counts                 |
| POST   | /api/admin/rfqs/:id/reassign| Returns full RFQ context for manual outreach |

**GET /api/rfqs/stalled?minutes=5** *(ADMIN)*
RFQs with zero quotations after N minutes — the SLA alert list.

---

## Vehicles

| Method | Path                    | Auth           |
|--------|-------------------------|----------------|
| GET    | /api/vehicles           | Any            |
| GET    | /api/vehicles/:id       | Any            |
| GET    | /api/vehicles/plate/:p  | Any            |
| POST   | /api/vehicles           | GARAGE, ADMIN  |
| PATCH  | /api/vehicles/:id       | GARAGE, ADMIN  |

Vehicles can be created with only a license plate; all other fields are optional and can be filled in later.

---

## Data Model

```
User (1) ──── (1) Garage ──── (N) RFQ ──── (N) Quotation ──── (1) Order
                    └── (N) Vehicle ──┘         (1) Supplier        └── (N) OrderEvent
                                                     └── (N) Order
                                           SupplierPerformanceSnapshot
```

---

## Error Format

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "licensePlate", "message": "Required" }
  ]
}
```

HTTP codes used: `200`, `201`, `400`, `401`, `403`, `404`, `409`, `422`, `500`
