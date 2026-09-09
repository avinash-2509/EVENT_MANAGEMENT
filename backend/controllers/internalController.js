import crypto from 'crypto';
import { releaseExpiredReservations } from '../services/reservationService.js';
import { AppError } from '../utils/errors.js';

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const releaseExpired = async (req, res, next) => {
  try {
    if (!process.env.INTERNAL_JOB_SECRET) {
      throw new AppError(503, 'INTERNAL_JOB_NOT_CONFIGURED', 'Internal job authentication is not configured.');
    }
    if (!safeEqual(req.get('x-internal-job-secret'), process.env.INTERNAL_JOB_SECRET)) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
    }
    const result = await releaseExpiredReservations({ limit: req.body?.limit });
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
};
