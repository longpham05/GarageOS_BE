// src/modules/order/order.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as orderService from './order.service';
import { sendSuccess, AppError } from '../../utils/response';
import { ActorType, OrderStatus } from '@prisma/client';

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const garageId = req.user?.garageId;
    if (!garageId) throw new AppError('Garage profile not found', 400);

    const result = await orderService.createOrder({ ...req.body, garageId });
    sendSuccess(res, result, 'Order created successfully', 201);
  } catch (err) {
    next(err);
  }
};

export const getOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await orderService.getOrder(req.params.id);

    // Scope check: garages/suppliers only see their own orders
    if (req.user?.role === 'GARAGE' && order.garageId !== req.user.garageId) {
      throw new AppError('Forbidden', 403);
    }
    if (req.user?.role === 'SUPPLIER' && order.supplierId !== req.user.supplierId) {
      throw new AppError('Forbidden', 403);
    }

    sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
};

export const listOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, page, limit } = req.query as Record<string, string | undefined>;

    const garageId = req.user?.role === 'GARAGE' ? req.user.garageId : undefined;
    const supplierId = req.user?.role === 'SUPPLIER' ? req.user.supplierId : undefined;

    const result = await orderService.listOrders({
      garageId,
      supplierId,
      status: status as OrderStatus | undefined,
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

export const updateOrderStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, note } = req.body;

    // Determine actor type from role
    let actor: ActorType;
    if (req.user?.role === 'ADMIN') actor = ActorType.ADMIN;
    else if (req.user?.role === 'SUPPLIER') actor = ActorType.SUPPLIER;
    else actor = ActorType.GARAGE;

    // Scope: suppliers can only update their own orders
    if (req.user?.role === 'SUPPLIER') {
      const order = await orderService.getOrder(req.params.id);
      if (order.supplierId !== req.user.supplierId) throw new AppError('Forbidden', 403);
    }

    const result = await orderService.updateOrderStatus(req.params.id, status, actor, note);
    sendSuccess(res, result, `Order status updated to ${status}`);
  } catch (err) {
    next(err);
  }
};
