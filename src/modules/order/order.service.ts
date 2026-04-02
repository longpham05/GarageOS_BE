// src/modules/order/order.service.ts
import { prisma } from '../../utils/prisma';
import { AppError } from '../../utils/response';
import { OrderStatus, OrderEventType, ActorType, QuotationStatus } from '@prisma/client';
import { expireQuotations } from '../quotation/quotation.service';
import { markClosed } from '../rfq/rfq.service';

export interface CreateOrderDto {
  rfqId: string;
  quotationId: string;
  garageId: string;
}

// ── Internal helper: append an OrderEvent ────────────────────────────────────
const logEvent = async (
  orderId: string,
  eventType: OrderEventType,
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
  createdBy: ActorType,
  note?: string
) => {
  return prisma.orderEvent.create({
    data: {
      orderId,
      eventType,
      fromStatus: fromStatus ?? undefined,
      toStatus,
      createdBy,
      note,
    },
  });
};

// ── Select a quotation and create an order ───────────────────────────────────
export const createOrder = async (dto: CreateOrderDto) => {
  const quotation = await prisma.quotation.findUnique({
    where: { id: dto.quotationId },
    include: { rfq: true },
  });

  if (!quotation) throw new AppError('Quotation not found', 404);
  if (quotation.rfqId !== dto.rfqId) throw new AppError('Quotation does not belong to this RFQ', 400);
  if (quotation.status !== QuotationStatus.SUBMITTED) {
    throw new AppError('Quotation is no longer available', 400);
  }
  if (quotation.rfq.garageId !== dto.garageId) throw new AppError('Forbidden', 403);

  // Check no existing order for this RFQ
  const existingOrder = await prisma.order.findUnique({ where: { rfqId: dto.rfqId } });
  if (existingOrder) throw new AppError('An order already exists for this RFQ', 409);

  // Transactionally: create order, mark selected quotation, reject others, close RFQ
  const order = await prisma.$transaction(async (tx) => {
    // Mark selected quotation
    await tx.quotation.update({
      where: { id: dto.quotationId },
      data: { status: QuotationStatus.SELECTED },
    });

    const newOrder = await tx.order.create({
      data: {
        rfqId: dto.rfqId,
        quotationId: dto.quotationId,
        garageId: dto.garageId,
        supplierId: quotation.supplierId,
        status: OrderStatus.CREATED,
      },
      include: {
        quotation: true,
        rfq: { include: { vehicle: true } },
        garage: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: newOrder.id,
        eventType: OrderEventType.ORDER_CREATED,
        toStatus: OrderStatus.CREATED,
        createdBy: ActorType.GARAGE,
      },
    });

    return newOrder;
  });

  // Outside transaction: reject other quotations, close RFQ
  await expireQuotations(dto.rfqId, dto.quotationId);
  await markClosed(dto.rfqId);

  return order;
};

// ── Status transition map ────────────────────────────────────────────────────
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.CREATED]:    [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]:  [OrderStatus.IN_TRANSIT, OrderStatus.CANCELLED],
  [OrderStatus.IN_TRANSIT]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]:  [],
  [OrderStatus.CANCELLED]:  [],
};

// ── Generic status update ────────────────────────────────────────────────────
export const updateOrderStatus = async (
  orderId: string,
  newStatus: OrderStatus,
  actor: ActorType,
  note?: string
) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', 404);

  const allowed = ALLOWED_TRANSITIONS[order.status];
  if (!allowed.includes(newStatus)) {
    throw new AppError(
      `Cannot transition from ${order.status} to ${newStatus}`,
      400
    );
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        confirmedAt: newStatus === OrderStatus.CONFIRMED ? new Date() : undefined,
        deliveredAt: newStatus === OrderStatus.DELIVERED ? new Date() : undefined,
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId,
        eventType:
          newStatus === OrderStatus.CANCELLED
            ? OrderEventType.CANCELLED
            : OrderEventType.STATUS_UPDATED,
        fromStatus: order.status,
        toStatus: newStatus,
        createdBy: actor,
        note,
      },
    });

    return updated;
  });

  return updatedOrder;
};

// ── Getters ──────────────────────────────────────────────────────────────────
export const getOrder = async (id: string) => {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      rfq: { include: { vehicle: true, attachments: true } },
      quotation: true,
      garage: { select: { id: true, name: true, phone: true } },
      supplier: { select: { id: true, name: true, phone: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) throw new AppError('Order not found', 404);
  return order;
};

export const listOrders = async (filter: {
  garageId?: string;
  supplierId?: string;
  status?: OrderStatus;
  page?: number;
  limit?: number;
}) => {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;

  const where = {
    ...(filter.garageId ? { garageId: filter.garageId } : {}),
    ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
  };

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
