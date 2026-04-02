// src/app.ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import 'dotenv/config';

import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

import authRoutes from './modules/auth/auth.routes';
import vehicleRoutes from './modules/vehicle/vehicle.routes';
import rfqRoutes from './modules/rfq/rfq.routes';
import quotationRoutes from './modules/quotation/quotation.routes';
import orderRoutes from './modules/order/order.routes';
import adminRoutes from './modules/admin/admin.routes';

const app = express();

// ── Global middleware ────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads')));

// Request logging
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/rfqs', rfqRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error handling ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
