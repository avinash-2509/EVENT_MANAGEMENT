import mongoose from 'mongoose';
import Event from '../models/events.js';
import EventShow from '../models/EventShow.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Reservation from '../models/Reservation.js';
import { AppError } from '../utils/errors.js';
import { createProviderOrder, getPaymentCheckoutKey } from './payments/paymentProvider.js';
import { releaseFailedReservation } from './reservationService.js';

const reservationMinutes = () => Math.min(Math.max(Number(process.env.RESERVATION_MINUTES || 10), 2), 30);

export const getOrderBundle = async (orderOrId) => {
  const order = typeof orderOrId === 'object' && orderOrId._id && orderOrId.status
    ? orderOrId
    : await Order.findById(orderOrId).lean();
  if (!order) return null;
  const [reservation, payment] = await Promise.all([
    Reservation.findOne({ orderId: order._id }).lean(),
    Payment.findOne({ orderId: order._id }).lean(),
  ]);
  return { order, reservation, payment };
};

const replayBundle = async (order) => {
  const bundle = await getOrderBundle(order);
  const checkout = bundle.payment && ['payment_initializing', 'pending_payment'].includes(bundle.order.status)
    ? {
        provider: bundle.payment.provider,
        keyId: getPaymentCheckoutKey(bundle.payment.provider),
        providerOrderId: bundle.payment.providerOrderId,
        amountPaise: bundle.payment.amountPaise,
        currency: bundle.payment.currency,
      }
    : null;
  return { ...bundle, checkout, idempotentReplay: true };
};

const reserveAndCreateOrder = async ({ userId, showId, quantity, idempotencyKey }) => {
  let createdOrder;
  let wasCreated = false;
  await mongoose.connection.transaction(async (session) => {
    const existing = await Order.findOne({ userId, idempotencyKey }).session(session).lean();
    if (existing) {
      createdOrder = existing;
      return;
    }

    const now = new Date();
    const show = await EventShow.findOne({ _id: showId, status: 'scheduled' }).session(session).lean();
    if (!show) throw new AppError(404, 'SHOW_NOT_FOUND', 'Show not found.');
    const event = await Event.findOne({ _id: show.eventId, status: 'published' }).session(session).lean();
    if (!event) throw new AppError(409, 'EVENT_NOT_BOOKABLE', 'This event is not available for booking.');
    if (show.startsAt <= now) throw new AppError(409, 'SHOW_STARTED', 'This show has already started.');
    if (show.salesOpenAt && show.salesOpenAt > now) throw new AppError(409, 'SALES_NOT_OPEN', 'Ticket sales have not opened.');
    if (show.salesCloseAt && show.salesCloseAt <= now) throw new AppError(409, 'SALES_CLOSED', 'Ticket sales are closed.');

    const reservedShow = await EventShow.findOneAndUpdate(
      {
        _id: show._id,
        status: 'scheduled',
        startsAt: { $gt: now },
        $expr: {
          $gte: [
            { $subtract: ['$capacity', { $add: ['$reservedCount', '$soldCount'] }] },
            quantity,
          ],
        },
      },
      { $inc: { reservedCount: quantity } },
      { session, returnDocument: 'after' }
    );
    if (!reservedShow) throw new AppError(409, 'INSUFFICIENT_INVENTORY', 'Not enough tickets are available.');

    const totalAmountPaise = show.pricePaise * quantity;
    if (!Number.isSafeInteger(totalAmountPaise)) {
      throw new AppError(400, 'INVALID_AMOUNT', 'Calculated payment amount is invalid.');
    }
    const orderId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(now.getTime() + reservationMinutes() * 60 * 1000);
    const [order] = await Order.create([{
      _id: orderId,
      userId,
      eventId: event._id,
      showId: show._id,
      quantity,
      unitPricePaise: show.pricePaise,
      totalAmountPaise,
      currency: show.currency,
      idempotencyKey,
      status: 'payment_initializing',
    }], { session });
    await Reservation.create([{
      orderId,
      showId: show._id,
      quantity,
      status: 'active',
      expiresAt,
    }], { session });
    createdOrder = order.toObject();
    wasCreated = true;
  });
  return { order: createdOrder, wasCreated };
};

export const createBooking = async ({ userId, showId, quantity, idempotencyKey }) => {
  let order;
  try {
    const reservationResult = await reserveAndCreateOrder({ userId, showId, quantity, idempotencyKey });
    order = reservationResult.order;
    if (!reservationResult.wasCreated) {
      return replayBundle(order);
    }
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await Order.findOne({ userId, idempotencyKey }).lean();
      if (existing) return replayBundle(existing);
    }
    throw error;
  }

  const existingPayment = await Payment.findOne({ orderId: order._id }).lean();
  if (existingPayment || order.status !== 'payment_initializing') {
    return replayBundle(order);
  }

  let providerOrder;
  try {
    providerOrder = await createProviderOrder({
      localOrderId: order._id,
      amountPaise: order.totalAmountPaise,
      currency: order.currency,
    });
    await mongoose.connection.transaction(async (session) => {
      const updated = await Order.updateOne(
        { _id: order._id, status: 'payment_initializing' },
        { $set: { status: 'pending_payment' } },
        { session }
      );
      if (updated.modifiedCount !== 1) throw new AppError(409, 'ORDER_STATE_CHANGED', 'Order state changed during payment initialization.');
      await Payment.create([{
        orderId: order._id,
        provider: providerOrder.provider,
        providerOrderId: providerOrder.providerOrderId,
        amountPaise: order.totalAmountPaise,
        currency: order.currency,
        status: 'created',
      }], { session });
    });
  } catch (error) {
    await releaseFailedReservation(order._id, error.code || 'PAYMENT_INITIALIZATION_FAILED');
    throw error;
  }

  const bundle = await getOrderBundle(order._id);
  return {
    ...bundle,
    checkout: {
      provider: providerOrder.provider,
      keyId: providerOrder.checkoutKey,
      providerOrderId: providerOrder.providerOrderId,
      amountPaise: providerOrder.amountPaise,
      currency: providerOrder.currency,
    },
    idempotentReplay: false,
  };
};
