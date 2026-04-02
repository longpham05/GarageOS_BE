// src/modules/quotation/quotation.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as quotationService from './quotation.service';
import { sendSuccess, AppError } from '../../utils/response';

export const submitQuotation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplierId = req.user?.supplierId;
    if (!supplierId) throw new AppError('Supplier profile not found for this user', 400);

    const result = await quotationService.submitQuotation({ ...req.body, supplierId });
    sendSuccess(res, result, 'Quotation submitted', 201);
  } catch (err) {
    next(err);
  }
};

export const listQuotationsForRFQ = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await quotationService.listQuotationsForRFQ(req.params.rfqId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

export const listMyQuotations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplierId = req.user?.supplierId;
    if (!supplierId) throw new AppError('Supplier profile not found', 400);

    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const result = await quotationService.listQuotationsForSupplier(supplierId, page, limit);

    sendSuccess(res, result.items, undefined, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
};
