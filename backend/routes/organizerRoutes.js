import { Router } from 'express';
import { getOrganizerEventOrders } from '../controllers/orderController.js';
import { protect, requireOrganizer } from '../middleware/authMiddleware.js';

const router = Router();
router.use(protect, requireOrganizer);
router.get('/events/:eventId/orders', getOrganizerEventOrders);
export default router;
