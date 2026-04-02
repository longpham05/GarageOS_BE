// src/modules/auth/auth.schema.ts
import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  }),
});

export const registerGarageSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1),
    phone: z.string().min(1),
    address: z.string().optional(),
    contactPerson: z.string().optional(),
  }),
});

export const registerSupplierSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
    phone: z.string().min(1),
    address: z.string().optional(),
    contactPerson: z.string().optional(),
  }),
});
