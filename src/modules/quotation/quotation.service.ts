// src/modules/quotation/quotation.service.ts
import { prisma } from '../../utils/prisma';
import { AppError } from '../../utils/response';
import { QuotationStatus, RFQStatus } from '@prisma/client';
import { markQuoting } from '../rfq/rfq.service';

export interface SubmitQuotationDto {
  rfqId: string;
  supplierId: string;
  price: number;
  etaMinutes: number;
  notes?: string;
}

export const submitQuotation = async (dto: SubmitQuotationDto) => {
  // Validate RFQ exists and is open for quoting
  const rfq = await prisma.rFQ.findUnique({ where: { id: dto.rfqId } });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (rfq.status === RFQStatus.CLOSED || rfq.status === RFQStatus.CANCELLED) {
    throw new AppError('RFQ is no longer accepting quotations', 400);
  }

  // Upsert: supplier may update their quotation while RFQ is still open
  const quotation = await prisma.quotation.upsert({
    where: { rfqId_supplierId: { rfqId: dto.rfqId, supplierId: dto.supplierId } },
    update: {
      price: dto.price,
      etaMinutes: dto.etaMinutes,
      notes: dto.notes,
      status: QuotationStatus.SUBMITTED,
    },
    create: {
      rfqId: dto.rfqId,
      supplierId: dto.supplierId,
      price: dto.price,
      etaMinutes: dto.etaMinutes,
      notes: dto.notes,
      status: QuotationStatus.SUBMITTED,
    },
    include: {
      supplier: { select: { id: true, name: true, tier: true } },
      rfq: { select: { id: true, status: true } },
    },
  });

  // Transition RFQ to QUOTING if it was NEW
  if (rfq.status === RFQStatus.NEW) {
    await markQuoting(dto.rfqId);
  }

  return quotation;
};

export const listQuotationsForRFQ = async (rfqId: string) => {
  return prisma.quotation.findMany({
    where: { rfqId },
    include: {
      supplier: { select: { id: true, name: true, tier: true } },
    },
    orderBy: { price: 'asc' },
  });
};

export const listQuotationsForSupplier = async (supplierId: string, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [total, items] = await Promise.all([
    prisma.quotation.count({ where: { supplierId } }),
    prisma.quotation.findMany({
      where: { supplierId },
      skip,
      take: limit,
      include: {
        rfq: {
          include: {
            vehicle: true,
            garage: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return { items, total, page, limit };
};

export const expireQuotations = async (rfqId: string, excludeQuotationId: string) => {
  await prisma.quotation.updateMany({
    where: {
      rfqId,
      id: { not: excludeQuotationId },
      status: QuotationStatus.SUBMITTED,
    },
    data: { status: QuotationStatus.REJECTED },
  });
};
