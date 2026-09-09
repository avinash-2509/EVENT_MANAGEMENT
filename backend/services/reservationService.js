import mongoose from 'mongoose';
import EventShow from '../models/EventShow.js';
import Order from '../models/Order.js';
import Reservation from '../models/Reservation.js';
import { AppError } from '../utils/errors.js';

const releaseOne = async ({ orderId, status, orderStatus, failureCode = null, requireExpired = false }) => {
  let released = false;
  await mongoose.connection.transaction(async (session) => {
    const filter = { orderId, status: 'active' };
    if (requireExpired) filter.expiresAt = { $lte: new Date() };
    const reservation = await Reservation.findOneAndUpdate(
      filter,
      { $set: { status, releasedAt: new Date() } },
      { session, returnDocument: 'after' }
    );
    if (!reservation) return;

    const inventory = await EventShow.updateOne(
      { _id: reservation.showId, reservedCount: { $gte: reservation.quantity } },
      { $inc: { reservedCount: -reservation.quantity } },
      { session }
    );
    if (inventory.modifiedCount !== 1) {
      throw new AppError(409, 'INVENTORY_INCONSISTENT', 'Reserved inventory could not be released safely.');
    }

    await Order.updateOne(
      { _id: orderId, status: { $in: ['payment_initializing', 'pending_payment'] } },
      {
        $set: {
          status: orderStatus,
          failedAt: orderStatus === 'payment_failed' ? new Date() : null,
          failureCode,
        },
      },
      { session }
    );
    released = true;
  });
  return released;
};

export const releaseFailedReservation = (orderId, failureCode) => releaseOne({
  orderId,
  status: 'released',
  orderStatus: 'payment_failed',
  failureCode,
});

export const expireReservation = (orderId) => releaseOne({
  orderId,
  status: 'expired',
  orderStatus: 'expired',
  failureCode: 'RESERVATION_EXPIRED',
  requireExpired: true,
});

export const releaseExpiredReservations = async ({ limit = 100 } = {}) => {
  const reservations = await Reservation.find({ status: 'active', expiresAt: { $lte: new Date() } })
    .sort({ expiresAt: 1 })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 500))
    .select('orderId')
    .lean();
  let releasedCount = 0;
  for (const reservation of reservations) {
    if (await expireReservation(reservation.orderId)) releasedCount += 1;
  }
  return { scannedCount: reservations.length, releasedCount };
};
