// src/modules/vehicle/vehicle.schema.ts
import { z } from 'zod';

export const createVehicleSchema = z.object({
  body: z.object({
    licensePlate: z.string().min(1),
    brand: z.string().optional(),
    model: z.string().optional(),
    year: z.number().int().min(1980).max(new Date().getFullYear() + 1).optional(),
  }),
});

export const updateVehicleSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    brand: z.string().optional(),
    model: z.string().optional(),
    year: z.number().int().min(1980).optional(),
  }),
});
