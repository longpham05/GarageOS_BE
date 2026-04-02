// src/modules/auth/auth.routes.ts
import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import * as controller from './auth.controller';
import {
  loginSchema,
  refreshSchema,
  registerGarageSchema,
  registerSupplierSchema,
} from './auth.schema';

const router = Router();

// POST /api/auth/login
router.post('/login', validate(loginSchema), controller.login);

// POST /api/auth/refresh
router.post('/refresh', validate(refreshSchema), controller.refresh);

// POST /api/auth/logout
router.post('/logout', validate(refreshSchema), controller.logout);

// POST /api/auth/register/garage
router.post('/register/garage', validate(registerGarageSchema), controller.registerGarage);

// POST /api/auth/register/supplier  (admin-only in production; open for now)
router.post('/register/supplier', validate(registerSupplierSchema), controller.registerSupplier);

// GET /api/auth/me
router.get('/me', authenticate, controller.me);

export default router;
