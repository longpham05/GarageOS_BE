// src/modules/rfq/rfq.service.ts
import { prisma } from '../../utils/prisma';
import { AppError } from '../../utils/response';
import { RequestType, Priority, RFQStatus } from '@prisma/client';
import * as vehicleService from '../vehicle/vehicle.service';

export interface CreateRFQDto {
  licensePlate: string;
  brand?: string;
  model?: string;
  year?: number;
  requestType: RequestType;
  description: string;
  priority?: Priority;
  garageId: string;
}

export interface ListRFQsFilter {
  garageId?: string;
  status?: RFQStatus;
  page?: number;
  limit?: number;
}

export const createRFQ = async (dto: CreateRFQDto, attachmentUrls: string[] = []) => {
  // Upsert vehicle by plate
  const vehicle = await vehicleService.createVehicle({
    licensePlate: dto.licensePlate,
    brand: dto.brand,
    model: dto.model,
    year: dto.year,
    garageId: dto.garageId,
  });

  const rfq = await prisma.rFQ.create({
    data: {
      garageId: dto.garageId,
      vehicleId: vehicle.id,
      requestType: dto.requestType,
      description: dto.description,
      priority: dto.priority ?? Priority.NORMAL,
      status: RFQStatus.NEW,
      attachments: attachmentUrls.length
        ? {
            create: attachmentUrls.map((url) => ({ fileUrl: url })),
          }
        : undefined,
    },
    include: {
      vehicle: true,
      attachments: true,
      garage: { select: { id: true, name: true } },
    },
  });

  return rfq;
};

export const listRFQs = async (filter: ListRFQsFilter) => {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const where = {
    ...(filter.garageId ? { garageId: filter.garageId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.rFQ.count({ where }),
    prisma.rFQ.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        vehicle: true,
        garage: { select: { id: true, name: true } },
        attachments: true,
        _count: { select: { quotations: true } },
      },
    }),
  ]);

  return { items, total, page, limit };
};

export const getRFQ = async (id: string) => {
  const rfq = await prisma.rFQ.findUnique({
    where: { id },
    include: {
      vehicle: true,
      garage: true,
      attachments: true,
      quotations: {
        include: { supplier: { select: { id: true, name: true, tier: true } } },
        orderBy: { createdAt: 'asc' },
      },
      order: true,
    },
  });
  if (!rfq) throw new AppError('RFQ not found', 404);
  return rfq;
};

export const cancelRFQ = async (id: string, garageId?: string) => {
  const rfq = await prisma.rFQ.findUnique({ where: { id } });
  if (!rfq) throw new AppError('RFQ not found', 404);

  // Garages can only cancel their own RFQs
  if (garageId && rfq.garageId !== garageId) {
    throw new AppError('Forbidden', 403);
  }

  if (rfq.status === RFQStatus.CLOSED) {
    throw new AppError('Cannot cancel a closed RFQ', 400);
  }

  return prisma.rFQ.update({
    where: { id },
    data: { status: RFQStatus.CANCELLED },
  });
};

// Called internally when a quotation is submitted
export const markQuoting = async (rfqId: string) => {
  await prisma.rFQ.update({
    where: { id: rfqId },
    data: { status: RFQStatus.QUOTING },
  });
};

// Called internally when an order is placed
export const markClosed = async (rfqId: string) => {
  await prisma.rFQ.update({
    where: { id: rfqId },
    data: { status: RFQStatus.CLOSED },
  });
};

// Admin: list RFQs with no quotations after N minutes
export const listStalledRFQs = async (afterMinutes = 5) => {
  const threshold = new Date(Date.now() - afterMinutes * 60 * 1000);
  return prisma.rFQ.findMany({
    where: {
      status: RFQStatus.NEW,
      createdAt: { lt: threshold },
      quotations: { none: {} },
    },
    include: {
      vehicle: true,
      garage: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
};
