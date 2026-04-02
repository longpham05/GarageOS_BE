// src/modules/rfq/rfq.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as rfqService from './rfq.service';
import { sendSuccess, AppError } from '../../utils/response';

export const createRFQ = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const garageId = req.user?.garageId;
    if (!garageId) throw new AppError('Garage profile not found for this user', 400);

    // Collect uploaded file paths if any (populated by multer middleware)
    const files = req.files as Express.Multer.File[] | undefined;
    const attachmentUrls = files?.map((f) => `/uploads/${f.filename}`) ?? [];

    const result = await rfqService.createRFQ({ ...req.body, garageId }, attachmentUrls);
    sendSuccess(res, result, 'RFQ submitted successfully', 201);
  } catch (err) {
    next(err);
  }
};

export const listRFQs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, page, limit } = req.query as {
      status?: string;
      page?: string;
      limit?: string;
    };

    // Garages only see their own; admin/supplier see all (or filtered)
    const garageId = req.user?.role === 'GARAGE' ? req.user.garageId : undefined;

    const result = await rfqService.listRFQs({
      garageId,
      status: status as any,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });

    sendSuccess(res, result.items, undefined, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
};

export const getRFQ = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rfq = await rfqService.getRFQ(req.params.id);

    // Garages can only see their own RFQs
    if (req.user?.role === 'GARAGE' && rfq.garageId !== req.user.garageId) {
      throw new AppError('Forbidden', 403);
    }

    sendSuccess(res, rfq);
  } catch (err) {
    next(err);
  }
};

export const cancelRFQ = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const garageId = req.user?.role === 'GARAGE' ? req.user.garageId : undefined;
    const result = await rfqService.cancelRFQ(req.params.id, garageId);
    sendSuccess(res, result, 'RFQ cancelled');
  } catch (err) {
    next(err);
  }
};

export const listStalledRFQs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const minutes = req.query.minutes ? parseInt(req.query.minutes as string) : 5;
    const result = await rfqService.listStalledRFQs(minutes);
    sendSuccess(res, result, `RFQs with no quotation after ${minutes} minutes`);
  } catch (err) {
    next(err);
  }
};
