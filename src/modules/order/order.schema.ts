// src/modules/order/order.schema.ts
import { z } from 'zod';
import { OrderStatus } from '@prisma/client';

export const createOrderSchema = z.object({
  body: z.object({
    rfqId: z.string().min(1),
    quotationId: z.string().min(1),
  }),
});

export const updateOrderStatusSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    status: z.nativeEnum(OrderStatus),
    note: z.string().optional(),
  }),
});

export const listOrdersSchema = z.object({
  query: z.object({
    status: z.nativeEnum(OrderStatus).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

export const orderIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});
