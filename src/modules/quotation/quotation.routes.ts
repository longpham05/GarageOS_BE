// src/modules/quotation/quotation.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './quotation.controller';
import { submitQuotationSchema, rfqIdParamSchema } from './quotation.schema';

const router = Router();

router.use(authenticate);

// POST /api/quotations  (supplier submits a quote)
router.post('/', authorize('SUPPLIER'), validate(submitQuotationSchema), controller.submitQuotation);

// GET  /api/quotations/mine  (supplier sees their own quotes)
router.get('/mine', authorize('SUPPLIER'), controller.listMyQuotations);

// GET  /api/quotations/rfq/:rfqId  (garage or admin sees quotes for an RFQ)
router.get('/rfq/:rfqId', authorize('GARAGE', 'ADMIN'), validate(rfqIdParamSchema), controller.listQuotationsForRFQ);

export default router;
