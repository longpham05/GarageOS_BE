// src/modules/admin/admin.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as controller from './admin.controller';

const router = Router();

router.use(authenticate, authorize('ADMIN'));

// GET  /api/admin/dashboard
router.get('/dashboard', controller.getDashboard);

// GET  /api/admin/rfqs
router.get('/rfqs', controller.listRFQs);

// GET  /api/admin/orders
router.get('/orders', controller.listOrders);

// GET  /api/admin/suppliers
router.get('/suppliers', controller.listSuppliers);

// GET  /api/admin/garages
router.get('/garages', controller.listGarages);

// POST /api/admin/rfqs/:id/reassign
router.post('/rfqs/:id/reassign', controller.reassignRFQ);

export default router;
