import { Router } from 'express';
import { checkInTicket, getMyTicket, getMyTicketQr } from '../controllers/ticketController.js';
import { protect, requireOrganizer, requireUser } from '../middleware/authMiddleware.js';

const router = Router();
router.post('/check-in', protect, requireOrganizer, checkInTicket);
router.get('/:id/qr', protect, requireUser, getMyTicketQr);
router.get('/:id', protect, requireUser, getMyTicket);
export default router;
