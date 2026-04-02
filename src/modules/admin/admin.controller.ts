// src/modules/admin/admin.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as adminService from './admin.service';
import { sendSuccess } from '../../utils/response';
import { RFQStatus, OrderStatus } from '@prisma/client';

export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.getDashboardMetrics();
    sendSuccess(res, result, 'Dashboard metrics');
  } catch (err) {
    next(err);
  }
};

export const listRFQs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, status } = req.query as Record<string, string>;
    const result = await adminService.listAllRFQs(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 30,
      status as RFQStatus | undefined
    );
    sendSuccess(res, result.items, undefined, 200, { page: result.page, limit: result.limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const listOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, status } = req.query as Record<string, string>;
    const result = await adminService.listAllOrders(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 30,
      status as OrderStatus | undefined
    );
    sendSuccess(res, result.items, undefined, 200, { page: result.page, limit: result.limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const listSuppliers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.listSuppliers();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

export const listGarages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.listGarages();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

export const reassignRFQ = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.reassignRFQ(req.params.id, req.body.note ?? '');
    sendSuccess(res, result, 'RFQ context ready for manual reassignment');
  } catch (err) {
    next(err);
  }
};
