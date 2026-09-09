import { Router } from 'express';
import { getCategoryStats, getDashboardStats } from '../controllers/statsController.js';
import { protect, requireOrganizer } from '../middleware/authMiddleware.js';

const router = Router();
router.use(protect, requireOrganizer);
router.get('/dashboard', getDashboardStats);
router.get('/categories', getCategoryStats);
export default router;

