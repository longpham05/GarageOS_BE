// prisma/seed.ts
import { PrismaClient, UserRole, SupplierTier, Priority, RequestType, RFQStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Admin user ──────────────────────────────────────────────────
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@garageos.vn' },
    update: {},
    create: {
      email: 'admin@garageos.vn',
      passwordHash: await bcrypt.hash('Admin@123', 10),
      role: UserRole.ADMIN,
    },
  });
  console.log('✅ Admin user:', adminUser.email);

  // ── Garage ───────────────────────────────────────────────────────
  const garageUser = await prisma.user.upsert({
    where: { email: 'garage1@garageos.vn' },
    update: {},
    create: {
      email: 'garage1@garageos.vn',
      passwordHash: await bcrypt.hash('Garage@123', 10),
      role: UserRole.GARAGE,
      garage: {
        create: {
          name: 'Gara Minh Tuấn',
          phone: '0901234567',
          address: '123 Lý Thường Kiệt, Q.10, TP.HCM',
          contactPerson: 'Nguyễn Minh Tuấn',
        },
      },
    },
    include: { garage: true },
  });
  console.log('✅ Garage user:', garageUser.email);

  // ── Suppliers ────────────────────────────────────────────────────
  const supplier1User = await prisma.user.upsert({
    where: { email: 'supplier1@garageos.vn' },
    update: {},
    create: {
      email: 'supplier1@garageos.vn',
      passwordHash: await bcrypt.hash('Supplier@123', 10),
      role: UserRole.SUPPLIER,
      supplier: {
        create: {
          name: 'Phụ Tùng Sài Gòn',
          phone: '0912345678',
          address: '456 Võ Văn Tần, Q.3, TP.HCM',
          contactPerson: 'Trần Văn Hùng',
          tier: SupplierTier.GOLD,
        },
      },
    },
  });

  const supplier2User = await prisma.user.upsert({
    where: { email: 'supplier2@garageos.vn' },
    update: {},
    create: {
      email: 'supplier2@garageos.vn',
      passwordHash: await bcrypt.hash('Supplier@123', 10),
      role: UserRole.SUPPLIER,
      supplier: {
        create: {
          name: 'Lốp Xe Toàn Quốc',
          phone: '0923456789',
          address: '789 Nguyễn Thị Minh Khai, Q.1, TP.HCM',
          contactPerson: 'Lê Thị Lan',
          tier: SupplierTier.SILVER,
        },
      },
    },
  });
  console.log('✅ Suppliers created');

  // ── Vehicle ──────────────────────────────────────────────────────
  const garage = await prisma.garage.findFirst({ where: { userId: garageUser.id } });
  const vehicle = await prisma.vehicle.upsert({
    where: { licensePlate: '51F-123.45' },
    update: {},
    create: {
      licensePlate: '51F-123.45',
      brand: 'Toyota',
      model: 'Vios',
      year: 2021,
      garageId: garage?.id,
    },
  });
  console.log('✅ Vehicle:', vehicle.licensePlate);

  // ── Sample RFQ ───────────────────────────────────────────────────
  if (garage) {
    await prisma.rFQ.create({
      data: {
        garageId: garage.id,
        vehicleId: vehicle.id,
        requestType: RequestType.TYRE,
        description: 'Cần thay 2 lốp trước, size 185/65R15',
        priority: Priority.URGENT,
        status: RFQStatus.NEW,
      },
    });
    console.log('✅ Sample RFQ created');
  }

  console.log('\n🎉 Seed complete!\n');
  console.log('Demo credentials:');
  console.log('  Admin    → admin@garageos.vn      / Admin@123');
  console.log('  Garage   → garage1@garageos.vn    / Garage@123');
  console.log('  Supplier → supplier1@garageos.vn  / Supplier@123');
  console.log('  Supplier → supplier2@garageos.vn  / Supplier@123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
