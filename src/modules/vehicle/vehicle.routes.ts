// src/modules/vehicle/vehicle.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './vehicle.controller';
import { createVehicleSchema, updateVehicleSchema } from './vehicle.schema';

const router = Router();

router.use(authenticate);

// GET  /api/vehicles
router.get('/', controller.listVehicles);

// GET  /api/vehicles/plate/:plate
router.get('/plate/:plate', controller.getVehicleByPlate);

// GET  /api/vehicles/:id
router.get('/:id', controller.getVehicle);

// POST /api/vehicles
router.post('/', authorize('GARAGE', 'ADMIN'), validate(createVehicleSchema), controller.createVehicle);

// PATCH /api/vehicles/:id
router.patch('/:id', authorize('GARAGE', 'ADMIN'), validate(updateVehicleSchema), controller.updateVehicle);

export default router;
