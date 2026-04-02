// src/modules/order/order.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './order.controller';
import {
  createOrderSchema,
  updateOrderStatusSchema,
  listOrdersSchema,
  orderIdSchema,
} from './order.schema';

const router = Router();

router.use(authenticate);

// GET  /api/orders
router.get('/', validate(listOrdersSchema), controller.listOrders);

// GET  /api/orders/:id
router.get('/:id', validate(orderIdSchema), controller.getOrder);

// POST /api/orders  (garage confirms a quotation → creates an order)
router.post('/', authorize('GARAGE'), validate(createOrderSchema), controller.createOrder);

// PATCH /api/orders/:id/status  (supplier updates transit/delivered; admin can do anything)
router.patch(
  '/:id/status',
  authorize('SUPPLIER', 'ADMIN'),
  validate(updateOrderStatusSchema),
  controller.updateOrderStatus
);

export default router;
