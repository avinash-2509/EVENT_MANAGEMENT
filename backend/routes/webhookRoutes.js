import { Router, raw } from 'express';
import { paymentWebhook } from '../controllers/webhookController.js';

const router = Router();
router.post('/razorpay', raw({ type: 'application/json', limit: '256kb' }), paymentWebhook('razorpay'));
if (process.env.NODE_ENV !== 'production') {
  router.post('/mock', raw({ type: 'application/json', limit: '256kb' }), paymentWebhook('mock'));
}
export default router;
