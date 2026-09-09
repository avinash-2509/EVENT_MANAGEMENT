import { Router } from 'express';
import { initiateBooking } from '../controllers/bookingController.js';
import { protect, requireUser } from '../middleware/authMiddleware.js';

const router = Router();
router.post('/', protect, requireUser, initiateBooking);
export default router;
