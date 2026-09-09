import { Router } from 'express';
import { releaseExpired } from '../controllers/internalController.js';

const router = Router();
router.post('/reservations/release-expired', releaseExpired);
export default router;
