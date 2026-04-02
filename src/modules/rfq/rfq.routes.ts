// src/modules/rfq/rfq.routes.ts
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './rfq.controller';
import { createRFQSchema, listRFQsSchema, rfqIdSchema } from './rfq.schema';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, process.env.UPLOAD_DIR || 'uploads'),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf/;
    const valid = allowed.test(path.extname(file.originalname).toLowerCase());
    cb(null, valid);
  },
});

const router = Router();

router.use(authenticate);

// GET  /api/rfqs
router.get('/', validate(listRFQsSchema), controller.listRFQs);

// GET  /api/rfqs/stalled  (admin only)
router.get('/stalled', authorize('ADMIN'), controller.listStalledRFQs);

// GET  /api/rfqs/:id
router.get('/:id', validate(rfqIdSchema), controller.getRFQ);

// POST /api/rfqs  (garage only)
router.post(
  '/',
  authorize('GARAGE'),
  upload.array('attachments', 5),
  validate(createRFQSchema),
  controller.createRFQ
);

// PATCH /api/rfqs/:id/cancel
router.patch('/:id/cancel', authorize('GARAGE', 'ADMIN'), validate(rfqIdSchema), controller.cancelRFQ);

export default router;
