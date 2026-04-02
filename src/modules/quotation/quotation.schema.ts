// src/modules/quotation/quotation.schema.ts
import { z } from 'zod';

export const submitQuotationSchema = z.object({
  body: z.object({
    rfqId: z.string().min(1),
    price: z.number().positive(),
    etaMinutes: z.number().int().positive(),
    notes: z.string().optional(),
  }),
});

export const rfqIdParamSchema = z.object({
  params: z.object({ rfqId: z.string().min(1) }),
});
