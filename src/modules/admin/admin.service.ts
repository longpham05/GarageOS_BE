// src/modules/admin/admin.service.ts
import { prisma } from '../../utils/prisma';
import { RFQStatus, OrderStatus } from '@prisma/client';

export const getDashboardMetrics = async () => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    totalRFQsToday,
    openRFQs,
    rfqsWithNoQuotation,
    pendingOrders,
    inTransitOrders,
    totalSuppliers,
    totalGarages,
  ] = await Promise.all([
    prisma.rFQ.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.rFQ.count({ where: { status: { in: [RFQStatus.NEW, RFQStatus.QUOTING] } } }),
    prisma.rFQ.count({
      where: {
        status: RFQStatus.NEW,
        quotations: { none: {} },
        createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
      },
    }),
    prisma.order.count({ where: { status: { in: [OrderStatus.CREATED, OrderStatus.CONFIRMED] } } }),
    prisma.order.count({ where: { status: OrderStatus.IN_TRANSIT } }),
    prisma.supplier.count(),
    prisma.garage.count(),
  ]);

  return {
    rfqs: { today: totalRFQsToday, open: openRFQs, needsAttention: rfqsWithNoQuotation },
    orders: { pending: pendingOrders, inTransit: inTransitOrders },
    entities: { suppliers: totalSuppliers, garages: totalGarages },
  };
};

export const listAllRFQs = async (page = 1, limit = 30, status?: RFQStatus) => {
  const where = status ? { status } : {};
  const [total, items] = await Promise.all([
    prisma.rFQ.count({ where }),
    prisma.rFQ.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        vehicle: true,
        garage: { select: { id: true, name: true, phone: true } },
        _count: { select: { quotations: true } },
      },
    }),
  ]);
  return { items, total, page, limit };
};

export const listAllOrders = async (page = 1, limit = 30, status?: OrderStatus) => {
  const where = status ? { status } : {};
  const [total, items] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        rfq: { include: { vehicle: true } },
        garage: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { items, total, page, limit };
};

export const listSuppliers = async () => {
  return prisma.supplier.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { quotations: true, orders: true } },
    },
  });
};

export const listGarages = async () => {
  return prisma.garage.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { rfqs: true, orders: true } },
    },
  });
};

// Reassign an RFQ: forward it to a new set of suppliers
// In V1 this is a no-op data-wise — admin manually contacts suppliers.
// We just log a note and ensure the RFQ stays open.
export const reassignRFQ = async (rfqId: string, note: string) => {
  const rfq = await prisma.rFQ.findUnique({ where: { id: rfqId } });
  if (!rfq) throw new Error('RFQ not found');

  // Keep the RFQ in QUOTING status and return it with context for admin
  return prisma.rFQ.findUnique({
    where: { id: rfqId },
    include: {
      vehicle: true,
      garage: { select: { id: true, name: true, phone: true } },
      quotations: { include: { supplier: { select: { id: true, name: true, phone: true } } } },
    },
  });
};
