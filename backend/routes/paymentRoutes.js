import { Router } from 'express';
import { verifyCheckoutPayment } from '../controllers/paymentController.js';
import { protect, requireUser } from '../middleware/authMiddleware.js';

const router = Router();
router.post('/verify', protect, requireUser, verifyCheckoutPayment);
export default router;
