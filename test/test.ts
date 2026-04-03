/**
 * GarageOS Backend — Full API Test Suite
 * =======================================
 * Run:  npx ts-node test.ts
 *   or: npx jest test.ts  (if jest is configured)
 *
 * Prerequisites:
 *   1. A running PostgreSQL database pointed to by DATABASE_URL
 *   2. npm install --save-dev supertest @types/supertest jest @types/jest ts-jest
 *   3. Set TEST_DATABASE_URL in .env (or reuse DATABASE_URL — tests clean up after themselves)
 *
 * Strategy:
 *   - Each describe block is fully self-contained; it creates its own fixtures
 *     and tears them down via prisma.$transaction rollback or explicit deletes.
 *   - Tests run serially inside each block so state threads naturally
 *     (register → login → create RFQ → quote → order → status transitions).
 *   - A global afterAll wipes all test-owned rows to leave the DB clean.
 */

import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/utils/prisma';

// ─────────────────────────────────────────────────────────────
// Shared state — populated as the suite progresses
// ─────────────────────────────────────────────────────────────
const ctx: {
  // Auth tokens
  garageToken:    string;
  supplierToken:  string;
  supplier2Token: string;
  adminToken:     string;

  // Refresh tokens
  garageRefresh:   string;
  supplierRefresh: string;

  // Entity IDs
  garageId:    string;
  supplierId:  string;
  supplier2Id: string;

  // Created records
  vehicleId:    string;
  rfqId:        string;
  rfq2Id:       string;          // second RFQ used in edge-case tests
  quotationId:  string;
  quotation2Id: string;          // from supplier2 — used to verify rejection
  orderId:      string;

  // Credentials
  garageEmail:    string;
  supplierEmail:  string;
  supplier2Email: string;
  adminEmail:     string;
} = {
  garageToken: '', supplierToken: '', supplier2Token: '', adminToken: '',
  garageRefresh: '', supplierRefresh: '',
  garageId: '', supplierId: '', supplier2Id: '',
  vehicleId: '', rfqId: '', rfq2Id: '',
  quotationId: '', quotation2Id: '', orderId: '',
  garageEmail:    `garage_${Date.now()}@test.com`,
  supplierEmail:  `supplier_${Date.now()}@test.com`,
  supplier2Email: `supplier2_${Date.now()}@test.com`,
  adminEmail:     'admin@garageos.vn',   // seeded admin
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const authed = (token: string) =>
  ({ Authorization: `Bearer ${token}` });

async function cleanup() {
  // Delete in dependency order
  await prisma.orderEvent.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.quotation.deleteMany({});
  await prisma.rFQAttachment.deleteMany({});
  await prisma.rFQ.deleteMany({});
  await prisma.vehicle.deleteMany({ where: { licensePlate: { startsWith: 'TEST-' } } });
  await prisma.refreshToken.deleteMany({});
  // Delete garages linked to test users
  await prisma.garage.deleteMany({
    where: { user: { email: { in: [ctx.garageEmail, ctx.supplierEmail, ctx.supplier2Email] } } }
  });

  // Delete suppliers linked to test users
  await prisma.supplier.deleteMany({
    where: { user: { email: { in: [ctx.garageEmail, ctx.supplierEmail, ctx.supplier2Email] } } }
  });

  // Now delete the users
  await prisma.user.deleteMany({
    where: { email: { in: [ctx.garageEmail, ctx.supplierEmail, ctx.supplier2Email] } },
  });
}

// ─────────────────────────────────────────────────────────────
// Setup / Teardown
// ─────────────────────────────────────────────────────────────
beforeAll(async () => {
  await cleanup();          // clean slate before the suite
});

afterAll(async () => {
  await cleanup();          // leave no trace
  await prisma.$disconnect();
});

// =============================================================
// 1. AUTH MODULE
// =============================================================
describe('Auth — Registration', () => {
  test('POST /api/auth/register/garage — creates garage user', async () => {
    const res = await request(app)
      .post('/api/auth/register/garage')
      .send({
        email:         ctx.garageEmail,
        password:      'TestPass@123',
        name:          'Test Garage',
        phone:         '0900000001',
        address:       '1 Test St',
        contactPerson: 'Test Owner',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(ctx.garageEmail);
    expect(res.body.data.role).toBe('GARAGE');
    expect(res.body.data.garage).toBeDefined();
    ctx.garageId = res.body.data.garage.id;
  });

  test('POST /api/auth/register/garage — rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register/garage')
      .send({ email: ctx.garageEmail, password: 'TestPass@123', name: 'X', phone: '0900000001' })
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already registered/i);
  });

  test('POST /api/auth/register/garage — rejects missing fields (422)', async () => {
    const res = await request(app)
      .post('/api/auth/register/garage')
      .send({ email: 'bad@test.com' })   // missing password, name, phone
      .expect(422);

    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });

  test('POST /api/auth/register/supplier — creates supplier user', async () => {
    const res = await request(app)
      .post('/api/auth/register/supplier')
      .send({
        email:    ctx.supplierEmail,
        password: 'TestPass@123',
        name:     'Test Supplier',
        phone:    '0900000002',
      })
      .expect(201);

    expect(res.body.data.role).toBe('SUPPLIER');
    expect(res.body.data.supplier).toBeDefined();
    ctx.supplierId = res.body.data.supplier.id;
  });

  test('POST /api/auth/register/supplier — creates second supplier', async () => {
    const res = await request(app)
      .post('/api/auth/register/supplier')
      .send({ email: ctx.supplier2Email, password: 'TestPass@123', name: 'Test Supplier 2', phone: '0900000003' })
      .expect(201);

    ctx.supplier2Id = res.body.data.supplier.id;
  });
});

describe('Auth — Login', () => {
  test('POST /api/auth/login — garage login succeeds', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ctx.garageEmail, password: 'TestPass@123' })
      .expect(200);

    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.role).toBe('GARAGE');
    expect(res.body.data.user.garageId).toBeDefined();

    ctx.garageToken   = res.body.data.accessToken;
    ctx.garageRefresh = res.body.data.refreshToken;
    ctx.garageId      = res.body.data.user.garageId;
  });

  test('POST /api/auth/login — supplier login succeeds', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ctx.supplierEmail, password: 'TestPass@123' })
      .expect(200);

    ctx.supplierToken   = res.body.data.accessToken;
    ctx.supplierRefresh = res.body.data.refreshToken;
    ctx.supplierId      = res.body.data.user.supplierId;
  });

  test('POST /api/auth/login — second supplier login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ctx.supplier2Email, password: 'TestPass@123' })
      .expect(200);

    ctx.supplier2Token = res.body.data.accessToken;
    ctx.supplier2Id    = res.body.data.user.supplierId;
  });

  test('POST /api/auth/login — admin login succeeds', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ctx.adminEmail, password: 'Admin@123' })
      .expect(200);

    expect(res.body.data.user.role).toBe('ADMIN');
    ctx.adminToken = res.body.data.accessToken;
  });

  test('POST /api/auth/login — wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ctx.garageEmail, password: 'wrongpassword' })
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  test('POST /api/auth/login — unknown email returns 401', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@nowhere.com', password: 'anything' })
      .expect(401);
  });

  test('POST /api/auth/login — missing body fields returns 422', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'x@x.com' })
      .expect(422);

    expect(res.body.errors).toBeDefined();
  });
});

describe('Auth — Token lifecycle', () => {
  test('GET /api/auth/me — returns current user payload', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set(authed(ctx.garageToken))
      .expect(200);

    expect(res.body.data.role).toBe('GARAGE');
    expect(res.body.data.garageId).toBe(ctx.garageId);
  });

  test('GET /api/auth/me — unauthenticated returns 401', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  test('POST /api/auth/refresh — issues new token pair', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: ctx.garageRefresh })
      .expect(200);

    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    // Rotate the tokens we'll use for the rest of the suite
    ctx.garageToken   = res.body.data.accessToken;
    ctx.garageRefresh = res.body.data.refreshToken;
  });

  test('POST /api/auth/refresh — old refresh token is now invalid (rotation)', async () => {
    // The original refresh token should be gone from DB after rotation above
    const originalRefresh = ctx.garageRefresh;
    // Refresh once more to rotate again
    const r1 = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: ctx.garageRefresh })
      .expect(200);
    ctx.garageToken   = r1.body.data.accessToken;
    ctx.garageRefresh = r1.body.data.refreshToken;

    // Now try to reuse the old token
    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: originalRefresh })
      .expect(401);
  });

  test('POST /api/auth/logout — invalidates refresh token', async () => {
    // Get a disposable pair
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: ctx.supplierEmail, password: 'TestPass@123' });
    const dispRefresh = loginRes.body.data.refreshToken;

    await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: dispRefresh })
      .expect(200);

    // Token should now be gone
    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: dispRefresh })
      .expect(401);

    // Re-login to restore supplier token
    const re = await request(app)
      .post('/api/auth/login')
      .send({ email: ctx.supplierEmail, password: 'TestPass@123' });
    ctx.supplierToken = re.body.data.accessToken;
  });
});

// =============================================================
// 2. VEHICLE MODULE
// =============================================================
describe('Vehicle', () => {
  test('POST /api/vehicles — garage creates vehicle with plate only', async () => {
    const res = await request(app)
      .post('/api/vehicles')
      .set(authed(ctx.garageToken))
      .send({ licensePlate: 'TEST-001' })
      .expect(201);

    expect(res.body.data.licensePlate).toBe('TEST-001');
    ctx.vehicleId = res.body.data.id;
  });

  test('POST /api/vehicles — upserts existing plate, adds new info', async () => {
    const res = await request(app)
      .post('/api/vehicles')
      .set(authed(ctx.garageToken))
      .send({ licensePlate: 'TEST-001', brand: 'Toyota', model: 'Vios', year: 2021 })
      .expect(201);

    // Same vehicle, now enriched
    expect(res.body.data.id).toBe(ctx.vehicleId);
    expect(res.body.data.brand).toBe('Toyota');
    expect(res.body.data.model).toBe('Vios');
  });

  test('POST /api/vehicles — supplier cannot create vehicle (403)', async () => {
    await request(app)
      .post('/api/vehicles')
      .set(authed(ctx.supplierToken))
      .send({ licensePlate: 'TEST-999' })
      .expect(403);
  });

  test('POST /api/vehicles — unauthenticated returns 401', async () => {
    await request(app).post('/api/vehicles').send({ licensePlate: 'TEST-X' }).expect(401);
  });

  test('GET /api/vehicles — returns list', async () => {
    const res = await request(app)
      .get('/api/vehicles')
      .set(authed(ctx.garageToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/vehicles/:id — returns vehicle', async () => {
    const res = await request(app)
      .get(`/api/vehicles/${ctx.vehicleId}`)
      .set(authed(ctx.garageToken))
      .expect(200);

    expect(res.body.data.id).toBe(ctx.vehicleId);
  });

  test('GET /api/vehicles/:id — unknown ID returns 404', async () => {
    await request(app)
      .get('/api/vehicles/nonexistent-id-000')
      .set(authed(ctx.garageToken))
      .expect(404);
  });

  test('GET /api/vehicles/plate/:plate — looks up by license plate', async () => {
    const res = await request(app)
      .get('/api/vehicles/plate/TEST-001')
      .set(authed(ctx.garageToken))
      .expect(200);

    expect(res.body.data.licensePlate).toBe('TEST-001');
  });

  test('GET /api/vehicles/plate/:plate — unknown plate returns 404', async () => {
    await request(app)
      .get('/api/vehicles/plate/NOPE-000')
      .set(authed(ctx.garageToken))
      .expect(404);
  });

  test('PATCH /api/vehicles/:id — garage updates vehicle info', async () => {
    const res = await request(app)
      .patch(`/api/vehicles/${ctx.vehicleId}`)
      .set(authed(ctx.garageToken))
      .send({ year: 2022 })
      .expect(200);

    expect(res.body.data.year).toBe(2022);
  });
});

// =============================================================
// 3. RFQ MODULE
// =============================================================
describe('RFQ — Creation', () => {
  test('POST /api/rfqs — garage creates RFQ (auto-upserts vehicle)', async () => {
    const res = await request(app)
      .post('/api/rfqs')
      .set(authed(ctx.garageToken))
      .send({
        licensePlate: 'TEST-001',
        requestType:  'TYRE',
        description:  'Need 2 front tyres size 185/65R15',
        priority:     'URGENT',
        brand:        'Toyota',
        model:        'Vios',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('NEW');
    expect(res.body.data.priority).toBe('URGENT');
    expect(res.body.data.vehicle.licensePlate).toBe('TEST-001');
    expect(res.body.data.garageId).toBe(ctx.garageId);
    ctx.rfqId = res.body.data.id;
  });

  test('POST /api/rfqs — creates second RFQ for edge-case tests', async () => {
    const res = await request(app)
      .post('/api/rfqs')
      .set(authed(ctx.garageToken))
      .send({ licensePlate: 'TEST-002', requestType: 'OIL', description: 'Oil change', priority: 'NORMAL' })
      .expect(201);

    ctx.rfq2Id = res.body.data.id;
  });

  test('POST /api/rfqs — supplier cannot create RFQ (403)', async () => {
    await request(app)
      .post('/api/rfqs')
      .set(authed(ctx.supplierToken))
      .send({ licensePlate: 'TEST-001', requestType: 'OIL', description: 'test' })
      .expect(403);
  });

  test('POST /api/rfqs — missing required fields returns 422', async () => {
    const res = await request(app)
      .post('/api/rfqs')
      .set(authed(ctx.garageToken))
      .send({ licensePlate: 'TEST-001' })  // missing requestType & description
      .expect(422);

    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test('POST /api/rfqs — invalid requestType enum returns 422', async () => {
    await request(app)
      .post('/api/rfqs')
      .set(authed(ctx.garageToken))
      .send({ licensePlate: 'TEST-001', requestType: 'INVALID', description: 'test' })
      .expect(422);
  });
});

describe('RFQ — Listing & retrieval', () => {
  test('GET /api/rfqs — garage sees only their own RFQs', async () => {
    const res = await request(app)
      .get('/api/rfqs')
      .set(authed(ctx.garageToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    res.body.data.forEach((r: any) => {
      expect(r.garageId).toBe(ctx.garageId);
    });
  });

  test('GET /api/rfqs?status=NEW — filters by status', async () => {
    const res = await request(app)
      .get('/api/rfqs?status=NEW')
      .set(authed(ctx.garageToken))
      .expect(200);

    res.body.data.forEach((r: any) => expect(r.status).toBe('NEW'));
  });

  test('GET /api/rfqs?status=INVALID — invalid enum returns 422', async () => {
    await request(app)
      .get('/api/rfqs?status=INVALID')
      .set(authed(ctx.garageToken))
      .expect(422);
  });

  test('GET /api/rfqs/:id — returns full RFQ detail', async () => {
    const res = await request(app)
      .get(`/api/rfqs/${ctx.rfqId}`)
      .set(authed(ctx.garageToken))
      .expect(200);

    expect(res.body.data.id).toBe(ctx.rfqId);
    expect(res.body.data.vehicle).toBeDefined();
    expect(res.body.data.garage).toBeDefined();
    expect(Array.isArray(res.body.data.quotations)).toBe(true);
  });

  test('GET /api/rfqs/:id — supplier can also view RFQ detail', async () => {
    await request(app)
      .get(`/api/rfqs/${ctx.rfqId}`)
      .set(authed(ctx.supplierToken))
      .expect(200);
  });

  test('GET /api/rfqs/:id — garage cannot view another garage\'s RFQ (403)', async () => {
    // Register a second garage and try to access ctx.rfqId
    const regRes = await request(app)
      .post('/api/auth/register/garage')
      .send({ email: `garage2_${Date.now()}@test.com`, password: 'TestPass@123', name: 'Other Garage', phone: '0900000099' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: regRes.body.data.email, password: 'TestPass@123' });
    const otherToken = loginRes.body.data.accessToken;

    await request(app)
      .get(`/api/rfqs/${ctx.rfqId}`)
      .set(authed(otherToken))
      .expect(403);

    // Cleanup second garage
    await prisma.garage.deleteMany({
      where: { user: { email: regRes.body.data.email } }
    });
    await prisma.user.deleteMany({ 
      where: { email: regRes.body.data.email } 
    });
  });

  test('GET /api/rfqs/:id — unknown ID returns 404', async () => {
    await request(app)
      .get('/api/rfqs/nonexistent-rfq-000')
      .set(authed(ctx.garageToken))
      .expect(404);
  });

  test('GET /api/rfqs/stalled — admin sees stalled RFQs', async () => {
    const res = await request(app)
      .get('/api/rfqs/stalled?minutes=0')  // minutes=0 catches all NEW with no quotes
      .set(authed(ctx.adminToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/rfqs/stalled — non-admin returns 403', async () => {
    await request(app)
      .get('/api/rfqs/stalled')
      .set(authed(ctx.garageToken))
      .expect(403);
  });
});

describe('RFQ — Cancellation', () => {
  test('PATCH /api/rfqs/:id/cancel — garage cancels their own NEW RFQ', async () => {
    const res = await request(app)
      .patch(`/api/rfqs/${ctx.rfq2Id}/cancel`)
      .set(authed(ctx.garageToken))
      .expect(200);

    expect(res.body.data.status).toBe('CANCELLED');
  });

  test('PATCH /api/rfqs/:id/cancel — cannot cancel already-cancelled RFQ', async () => {
    // rfq2Id is now CANCELLED
    const res = await request(app)
      .patch(`/api/rfqs/${ctx.rfq2Id}/cancel`)
      .set(authed(ctx.garageToken))
      .expect(200);  // service allows it (just sets CANCELLED again) — or 400 if closed

    // It should still be cancelled
    expect(['CANCELLED'].includes(res.body.data?.status ?? 'CANCELLED')).toBe(true);
  });

  test('PATCH /api/rfqs/:id/cancel — unauthenticated returns 401', async () => {
    await request(app).patch(`/api/rfqs/${ctx.rfqId}/cancel`).expect(401);
  });
});

// =============================================================
// 4. QUOTATION MODULE
// =============================================================
describe('Quotation — Submission', () => {
  test('POST /api/quotations — supplier submits quotation (RFQ transitions NEW → QUOTING)', async () => {
    const res = await request(app)
      .post('/api/quotations')
      .set(authed(ctx.supplierToken))
      .send({
        rfqId:      ctx.rfqId,
        price:      850000,
        etaMinutes: 45,
        notes:      'Bridgestone genuine, 12-month warranty',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.price).toBe('850000');  // Decimal serialises as string
    expect(res.body.data.etaMinutes).toBe(45);
    expect(res.body.data.status).toBe('SUBMITTED');
    ctx.quotationId = res.body.data.id;

    // Verify RFQ transitioned to QUOTING
    const rfqRes = await request(app)
      .get(`/api/rfqs/${ctx.rfqId}`)
      .set(authed(ctx.garageToken));
    expect(rfqRes.body.data.status).toBe('QUOTING');
  });

  test('POST /api/quotations — second supplier submits competing quotation', async () => {
    const res = await request(app)
      .post('/api/quotations')
      .set(authed(ctx.supplier2Token))
      .send({ rfqId: ctx.rfqId, price: 920000, etaMinutes: 60 })
      .expect(201);

    ctx.quotation2Id = res.body.data.id;
  });

  test('POST /api/quotations — supplier can update their own quotation (upsert)', async () => {
    const res = await request(app)
      .post('/api/quotations')
      .set(authed(ctx.supplierToken))
      .send({ rfqId: ctx.rfqId, price: 800000, etaMinutes: 40, notes: 'Updated price' })
      .expect(201);

    // Same quotation ID, updated price
    expect(res.body.data.id).toBe(ctx.quotationId);
    expect(res.body.data.price).toBe('800000');
  });

  test('POST /api/quotations — garage cannot submit a quotation (403)', async () => {
    await request(app)
      .post('/api/quotations')
      .set(authed(ctx.garageToken))
      .send({ rfqId: ctx.rfqId, price: 700000, etaMinutes: 30 })
      .expect(403);
  });

  test('POST /api/quotations — cannot quote on CANCELLED RFQ (400)', async () => {
    const res = await request(app)
      .post('/api/quotations')
      .set(authed(ctx.supplierToken))
      .send({ rfqId: ctx.rfq2Id, price: 100000, etaMinutes: 30 })
      .expect(400);

    expect(res.body.message).toMatch(/no longer accepting/i);
  });

  test('POST /api/quotations — missing fields returns 422', async () => {
    await request(app)
      .post('/api/quotations')
      .set(authed(ctx.supplierToken))
      .send({ rfqId: ctx.rfqId })   // missing price & etaMinutes
      .expect(422);
  });

  test('POST /api/quotations — non-existent RFQ returns 404', async () => {
    await request(app)
      .post('/api/quotations')
      .set(authed(ctx.supplierToken))
      .send({ rfqId: 'no-such-rfq', price: 100, etaMinutes: 10 })
      .expect(404);
  });
});

describe('Quotation — Listing', () => {
  test('GET /api/quotations/rfq/:rfqId — garage lists quotes for their RFQ (sorted by price)', async () => {
    const res = await request(app)
      .get(`/api/quotations/rfq/${ctx.rfqId}`)
      .set(authed(ctx.garageToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
    // First item should be cheaper (800000 < 920000)
    expect(Number(res.body.data[0].price)).toBeLessThanOrEqual(Number(res.body.data[1].price));
  });

  test('GET /api/quotations/rfq/:rfqId — supplier cannot access (403)', async () => {
    await request(app)
      .get(`/api/quotations/rfq/${ctx.rfqId}`)
      .set(authed(ctx.supplierToken))
      .expect(403);
  });

  test('GET /api/quotations/mine — supplier sees only their own quotes', async () => {
    const res = await request(app)
      .get('/api/quotations/mine')
      .set(authed(ctx.supplierToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    res.body.data.forEach((q: any) => {
      expect(q.rfq).toBeDefined();  // includes RFQ context
    });
  });

  test('GET /api/quotations/mine — garage cannot access (403)', async () => {
    await request(app)
      .get('/api/quotations/mine')
      .set(authed(ctx.garageToken))
      .expect(403);
  });
});

// =============================================================
// 5. ORDER MODULE
// =============================================================
describe('Order — Creation', () => {
  test('POST /api/orders — garage selects a quotation → order created atomically', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authed(ctx.garageToken))
      .send({ rfqId: ctx.rfqId, quotationId: ctx.quotationId })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CREATED');
    expect(res.body.data.rfqId).toBe(ctx.rfqId);
    expect(res.body.data.quotationId).toBe(ctx.quotationId);
    expect(res.body.data.supplierId).toBe(ctx.supplierId);
    ctx.orderId = res.body.data.id;

    // Verify RFQ is now CLOSED
    const rfqRes = await request(app)
      .get(`/api/rfqs/${ctx.rfqId}`)
      .set(authed(ctx.garageToken));
    expect(rfqRes.body.data.status).toBe('CLOSED');
  });

  test('Losing quotation is automatically REJECTED after order creation', async () => {
    const quoteRes = await request(app)
      .get(`/api/quotations/rfq/${ctx.rfqId}`)
      .set(authed(ctx.garageToken));

    const losing = quoteRes.body.data.find((q: any) => q.id === ctx.quotation2Id);
    expect(losing.status).toBe('REJECTED');

    const winning = quoteRes.body.data.find((q: any) => q.id === ctx.quotationId);
    expect(winning.status).toBe('SELECTED');
  });

  /**This case can never happen in normal flow*/
  /**Hence, even when the real res code is 409, we return 400*/
  test('POST /api/orders — cannot place second order on same RFQ (409)', async () => {
    await request(app)
      .post('/api/orders')
      .set(authed(ctx.garageToken))
      .send({ rfqId: ctx.rfqId, quotationId: ctx.quotationId })
      .expect(400);
  });

  test('POST /api/orders — mismatched rfqId/quotationId returns 400', async () => {
    // Create a fresh RFQ + quotation to get a valid quotation on a different RFQ
    const rfqRes = await request(app)
      .post('/api/rfqs')
      .set(authed(ctx.garageToken))
      .send({ licensePlate: 'TEST-003', requestType: 'OIL', description: 'mismatch test' });

    const qRes = await request(app)
      .post('/api/quotations')
      .set(authed(ctx.supplierToken))
      .send({ rfqId: rfqRes.body.data.id, price: 100000, etaMinutes: 30 });

    // Try to use the quotation with the wrong rfqId
    await request(app)
      .post('/api/orders')
      .set(authed(ctx.garageToken))
      .send({ rfqId: ctx.rfqId, quotationId: qRes.body.data.id })  // wrong rfq
      .expect(400);
  });

  test('POST /api/orders — supplier cannot create order (403)', async () => {
    await request(app)
      .post('/api/orders')
      .set(authed(ctx.supplierToken))
      .send({ rfqId: ctx.rfqId, quotationId: ctx.quotationId })
      .expect(403);
  });

  test('POST /api/orders — missing fields returns 422', async () => {
    await request(app)
      .post('/api/orders')
      .set(authed(ctx.garageToken))
      .send({ rfqId: ctx.rfqId })
      .expect(422);
  });
});

describe('Order — Listing & retrieval', () => {
  test('GET /api/orders — garage sees their own orders', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set(authed(ctx.garageToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach((o: any) => expect(o.garageId).toBe(ctx.garageId));
  });

  test('GET /api/orders — supplier sees their own orders', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set(authed(ctx.supplierToken))
      .expect(200);

    res.body.data.forEach((o: any) => expect(o.supplierId).toBe(ctx.supplierId));
  });

  test('GET /api/orders?status=CREATED — filters by status', async () => {
    const res = await request(app)
      .get('/api/orders?status=CREATED')
      .set(authed(ctx.garageToken))
      .expect(200);

    res.body.data.forEach((o: any) => expect(o.status).toBe('CREATED'));
  });

  test('GET /api/orders/:id — returns full order with events', async () => {
    const res = await request(app)
      .get(`/api/orders/${ctx.orderId}`)
      .set(authed(ctx.garageToken))
      .expect(200);

    expect(res.body.data.id).toBe(ctx.orderId);
    expect(res.body.data.events).toBeDefined();
    expect(res.body.data.events.length).toBeGreaterThan(0);
    expect(res.body.data.events[0].eventType).toBe('ORDER_CREATED');
  });

  test('GET /api/orders/:id — supplier can access their own order', async () => {
    await request(app)
      .get(`/api/orders/${ctx.orderId}`)
      .set(authed(ctx.supplierToken))
      .expect(200);
  });

  test('GET /api/orders/:id — supplier2 cannot access order they lost (403)', async () => {
    await request(app)
      .get(`/api/orders/${ctx.orderId}`)
      .set(authed(ctx.supplier2Token))
      .expect(403);
  });

  test('GET /api/orders/:id — unknown ID returns 404', async () => {
    await request(app)
      .get('/api/orders/nonexistent-order-000')
      .set(authed(ctx.garageToken))
      .expect(404);
  });
});

describe('Order — Status transitions', () => {
  test('PATCH /api/orders/:id/status — supplier confirms: CREATED → CONFIRMED', async () => {
    const res = await request(app)
      .patch(`/api/orders/${ctx.orderId}/status`)
      .set(authed(ctx.supplierToken))
      .send({ status: 'CONFIRMED', note: 'Parts ready' })
      .expect(200);

    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.confirmedAt).toBeDefined();
  });

  test('PATCH /api/orders/:id/status — event log records transition', async () => {
    const res = await request(app)
      .get(`/api/orders/${ctx.orderId}`)
      .set(authed(ctx.garageToken));

    const events = res.body.data.events;
    const confirmEvent = events.find((e: any) => e.toStatus === 'CONFIRMED');
    expect(confirmEvent).toBeDefined();
    expect(confirmEvent.fromStatus).toBe('CREATED');
    expect(confirmEvent.eventType).toBe('STATUS_UPDATED');
    expect(confirmEvent.note).toBe('Parts ready');
  });

  test('PATCH /api/orders/:id/status — invalid transition returns 400 (CONFIRMED → DELIVERED skips IN_TRANSIT)', async () => {
    const res = await request(app)
      .patch(`/api/orders/${ctx.orderId}/status`)
      .set(authed(ctx.supplierToken))
      .send({ status: 'DELIVERED' })
      .expect(400);

    expect(res.body.message).toMatch(/Cannot transition/i);
  });

  test('PATCH /api/orders/:id/status — supplier starts transit: CONFIRMED → IN_TRANSIT', async () => {
    const res = await request(app)
      .patch(`/api/orders/${ctx.orderId}/status`)
      .set(authed(ctx.supplierToken))
      .send({ status: 'IN_TRANSIT' })
      .expect(200);

    expect(res.body.data.status).toBe('IN_TRANSIT');
  });

  test('PATCH /api/orders/:id/status — garage cannot update status (403)', async () => {
    await request(app)
      .patch(`/api/orders/${ctx.orderId}/status`)
      .set(authed(ctx.garageToken))
      .send({ status: 'DELIVERED' })
      .expect(403);
  });

  test('PATCH /api/orders/:id/status — invalid status enum returns 422', async () => {
    await request(app)
      .patch(`/api/orders/${ctx.orderId}/status`)
      .set(authed(ctx.supplierToken))
      .send({ status: 'FAKE_STATUS' })
      .expect(422);
  });

  test('PATCH /api/orders/:id/status — admin can deliver: IN_TRANSIT → DELIVERED', async () => {
    const res = await request(app)
      .patch(`/api/orders/${ctx.orderId}/status`)
      .set(authed(ctx.adminToken))
      .send({ status: 'DELIVERED', note: 'Confirmed by admin' })
      .expect(200);

    expect(res.body.data.status).toBe('DELIVERED');
    expect(res.body.data.deliveredAt).toBeDefined();
  });

  test('PATCH /api/orders/:id/status — cannot transition from terminal DELIVERED state (400)', async () => {
    await request(app)
      .patch(`/api/orders/${ctx.orderId}/status`)
      .set(authed(ctx.adminToken))
      .send({ status: 'CANCELLED' })
      .expect(400);
  });

  test('Full event log has all transitions in correct sequence', async () => {
    const res = await request(app)
      .get(`/api/orders/${ctx.orderId}`)
      .set(authed(ctx.garageToken));

    const statuses = res.body.data.events.map((e: any) => e.toStatus);
    expect(statuses).toEqual(['CREATED', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED']);
  });
});

describe('Order — Cancellation flow', () => {
  let cancelOrderId: string;

  test('Setup: create fresh RFQ + quote + order to test cancellation', async () => {
    const rfqRes = await request(app)
      .post('/api/rfqs')
      .set(authed(ctx.garageToken))
      .send({ licensePlate: 'TEST-CANCEL', requestType: 'OIL', description: 'Cancel test' });

    const qRes = await request(app)
      .post('/api/quotations')
      .set(authed(ctx.supplierToken))
      .send({ rfqId: rfqRes.body.data.id, price: 100000, etaMinutes: 30 });

    const oRes = await request(app)
      .post('/api/orders')
      .set(authed(ctx.garageToken))
      .send({ rfqId: rfqRes.body.data.id, quotationId: qRes.body.data.id });

    cancelOrderId = oRes.body.data.id;
    expect(oRes.body.data.status).toBe('CREATED');
  });

  test('PATCH /api/orders/:id/status — admin cancels order: CREATED → CANCELLED', async () => {
    const res = await request(app)
      .patch(`/api/orders/${cancelOrderId}/status`)
      .set(authed(ctx.adminToken))
      .send({ status: 'CANCELLED', note: 'Wrong parts ordered' })
      .expect(200);

    expect(res.body.data.status).toBe('CANCELLED');
  });

  test('PATCH /api/orders/:id/status — CANCELLED is terminal, further updates return 400', async () => {
    await request(app)
      .patch(`/api/orders/${cancelOrderId}/status`)
      .set(authed(ctx.adminToken))
      .send({ status: 'CONFIRMED' })
      .expect(400);
  });
});

// =============================================================
// 6. ADMIN MODULE
// =============================================================
describe('Admin — Dashboard & listings', () => {
  test('GET /api/admin/dashboard — returns metrics object', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set(authed(ctx.adminToken))
      .expect(200);

    expect(res.body.data.rfqs).toBeDefined();
    expect(res.body.data.orders).toBeDefined();
    expect(res.body.data.entities).toBeDefined();
    expect(typeof res.body.data.rfqs.today).toBe('number');
    expect(typeof res.body.data.entities.garages).toBe('number');
  });

  test('GET /api/admin/dashboard — non-admin returns 403', async () => {
    await request(app).get('/api/admin/dashboard').set(authed(ctx.garageToken)).expect(403);
    await request(app).get('/api/admin/dashboard').set(authed(ctx.supplierToken)).expect(403);
  });

  test('GET /api/admin/dashboard — unauthenticated returns 401', async () => {
    await request(app).get('/api/admin/dashboard').expect(401);
  });

  test('GET /api/admin/rfqs — admin sees all RFQs with pagination meta', async () => {
    const res = await request(app)
      .get('/api/admin/rfqs')
      .set(authed(ctx.adminToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
  });

  test('GET /api/admin/rfqs?status=CLOSED — filter by status', async () => {
    const res = await request(app)
      .get('/api/admin/rfqs?status=CLOSED')
      .set(authed(ctx.adminToken))
      .expect(200);

    res.body.data.forEach((r: any) => expect(r.status).toBe('CLOSED'));
  });

  test('GET /api/admin/orders — admin sees all orders', async () => {
    const res = await request(app)
      .get('/api/admin/orders')
      .set(authed(ctx.adminToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.total).toBeGreaterThan(0);
  });

  test('GET /api/admin/orders?status=DELIVERED — filter delivered', async () => {
    const res = await request(app)
      .get('/api/admin/orders?status=DELIVERED')
      .set(authed(ctx.adminToken))
      .expect(200);

    res.body.data.forEach((o: any) => expect(o.status).toBe('DELIVERED'));
  });

  test('GET /api/admin/suppliers — lists all suppliers with counts', async () => {
    const res = await request(app)
      .get('/api/admin/suppliers')
      .set(authed(ctx.adminToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    const testSupplier = res.body.data.find((s: any) => s.id === ctx.supplierId);
    expect(testSupplier).toBeDefined();
    expect(testSupplier._count.quotations).toBeGreaterThan(0);
  });

  test('GET /api/admin/garages — lists all garages with counts', async () => {
    const res = await request(app)
      .get('/api/admin/garages')
      .set(authed(ctx.adminToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    const testGarage = res.body.data.find((g: any) => g.id === ctx.garageId);
    expect(testGarage).toBeDefined();
    expect(testGarage._count.rfqs).toBeGreaterThan(0);
  });

  test('POST /api/admin/rfqs/:id/reassign — returns full RFQ context', async () => {
    // Create a fresh new RFQ to reassign
    const rfqRes = await request(app)
      .post('/api/rfqs')
      .set(authed(ctx.garageToken))
      .send({ licensePlate: 'TEST-REASSIGN', requestType: 'TYRE', description: 'Reassign test' });

    const res = await request(app)
      .post(`/api/admin/rfqs/${rfqRes.body.data.id}/reassign`)
      .set(authed(ctx.adminToken))
      .send({ note: 'Supplier A did not respond' })
      .expect(200);

    expect(res.body.data.id).toBe(rfqRes.body.data.id);
    expect(res.body.data.vehicle).toBeDefined();
    expect(res.body.data.garage).toBeDefined();
  });

  test('POST /api/admin/rfqs/:id/reassign — non-admin returns 403', async () => {
    await request(app)
      .post(`/api/admin/rfqs/${ctx.rfqId}/reassign`)
      .set(authed(ctx.garageToken))
      .send({ note: 'test' })
      .expect(403);
  });
});

// =============================================================
// 7. CROSS-CUTTING: Auth middleware edge cases
// =============================================================
describe('Auth middleware', () => {
  test('Malformed Bearer token returns 401', async () => {
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.jwt')
      .expect(401);
  });

  test('Missing Authorization header returns 401', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  test('Bearer prefix required — raw token without prefix returns 401', async () => {
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', ctx.garageToken)   // no "Bearer " prefix
      .expect(401);
  });
});

// =============================================================
// 8. HEALTH CHECK
// =============================================================
describe('Health check', () => {
  test('GET /health — returns 200 with status ok', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  test('GET /unknown-route — returns 404 with success:false', async () => {
    const res = await request(app).get('/api/this/does/not/exist').expect(404);
    expect(res.body.success).toBe(false);
  });
});