// src/modules/rfq/rfq.schema.ts
import { z } from 'zod';
import { RequestType, Priority, RFQStatus } from '@prisma/client';

export const createRFQSchema = z.object({
  body: z.object({
    licensePlate: z.string().min(1, 'License plate is required'),
    brand: z.string().optional(),
    model: z.string().optional(),
    year: z.number().int().optional(),
    requestType: z.nativeEnum(RequestType),
    description: z.string().min(1, 'Description is required'),
    priority: z.nativeEnum(Priority).optional(),
  }),
});

export const listRFQsSchema = z.object({
  query: z.object({
    status: z.nativeEnum(RFQStatus).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

export const rfqIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});
