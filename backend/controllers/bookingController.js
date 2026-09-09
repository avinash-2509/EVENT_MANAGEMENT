import { createBooking } from '../services/bookingService.js';
import { AppError } from '../utils/errors.js';
import { isObjectId } from '../utils/validation.js';

export const initiateBooking = async (req, res, next) => {
  try {
    const showId = String(req.body.showId || '');
    const quantity = Number(req.body.quantity);
    const idempotencyKey = String(req.get('idempotency-key') || '').trim();
    if (!isObjectId(showId)) throw new AppError(400, 'INVALID_SHOW_ID', 'A valid showId is required.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be an integer between 1 and 10.');
    }
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8-128 safe characters.');
    }
    const result = await createBooking({ userId: req.user._id, showId, quantity, idempotencyKey });
    return res.status(result.idempotentReplay ? 200 : 201).json({ data: result });
  } catch (error) {
    return next(error);
  }
};
