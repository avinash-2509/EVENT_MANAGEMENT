import { Router } from 'express';
import {
  getMyOrderById,
  getMyOrders,
  getMyOrderTickets,
  getMyPaymentStatus,
} from '../controllers/orderController.js';
import { protect, requireUser } from '../middleware/authMiddleware.js';

const router = Router();
router.use(protect, requireUser);
router.get('/', getMyOrders);
router.get('/:id/tickets', getMyOrderTickets);
router.get('/:id/payment-status', getMyPaymentStatus);
router.get('/:id', getMyOrderById);
export default router;
