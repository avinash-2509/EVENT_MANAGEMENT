import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import Order from './models/Order.js';
import Payment from './models/Payment.js';
import Reservation from './models/Reservation.js';
import Ticket from './models/Ticket.js';
import WebhookEvent from './models/WebhookEvent.js';
import authRoutes from './routes/authRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import internalRoutes from './routes/internalRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import organizerRoutes from './routes/organizerRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { getSystemMetrics } from './controllers/metricsController.js';
import { protect, requireOrganizer } from './middleware/authMiddleware.js';
import { metricsTracker } from './middleware/metrics.js';
import { injectRedis } from './middleware/redisMiddleware.js';
import { startReservationExpiryWorker } from './workers/reservationExpiryWorker.js';

if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  throw new Error('MONGO_URI and JWT_SECRET are required.');
}

const app = express();
const port = Number(process.env.PORT || 5000);
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed.'));
  },
  credentials: true,
}));
app.use('/api/v1/webhooks', webhookRoutes);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(injectRedis);
app.use(metricsTracker);

app.get('/api/v1/health/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/v1/health/ready', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  return res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/events', eventRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/organizer', organizerRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use('/api/v1/internal', internalRoutes);
app.get('/api/v1/internal/metrics', protect, requireOrganizer, getSystemMetrics);

app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found.' }));
app.use((error, _req, res, _next) => {
  const status = error?.status || (error?.message === 'Origin is not allowed.' ? 403 : 500);
  if (status >= 500) console.error(error);
  const code = error?.code || (status === 403 ? 'ORIGIN_FORBIDDEN' : 'INTERNAL_ERROR');
  return res.status(status).json({
    code,
    message: status < 500 ? error.message : 'Something went wrong.',
  });
});

const start = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([Order.init(), Payment.init(), Reservation.init(), Ticket.init(), WebhookEvent.init()]);
  startReservationExpiryWorker();
  app.listen(port, '0.0.0.0', () => {
    console.log(`Evently API listening on port ${port}`);
  });
};

start().catch((error) => {
  console.error('Evently failed to start:', error.message);
  process.exit(1);
});

export default app;
