import crypto from 'crypto';
import mongoose from 'mongoose';
import EventShow from '../models/EventShow.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Reservation from '../models/Reservation.js';
import Ticket from '../models/Ticket.js';
import WebhookEvent from '../models/WebhookEvent.js';
import { AppError } from '../utils/errors.js';
import { randomPublicCode, randomTicketNumber } from '../utils/qr.js';

const payloadHash = (rawBody) => crypto.createHash('sha256').update(rawBody).digest('hex');

const webhookRecord = ({ provider, providerEventId, eventType, rawBody, status, errorCode = null }) => ({
  provider,
  providerEventId,
  eventType,
  payloadHash: payloadHash(rawBody),
  status,
  errorCode,
  processedAt: new Date(),
});

export const recordIgnoredWebhook = async (input) => {
  try {
    await WebhookEvent.create(webhookRecord({ ...input, status: 'ignored' }));
    return { duplicate: false };
  } catch (error) {
    if (error?.code === 11000) return { duplicate: true };
    throw error;
  }
};

const createTickets = async ({ order, session }) => {
  const tickets = Array.from({ length: order.quantity }, (_, index) => ({
    orderId: order._id,
    userId: order.userId,
    eventId: order.eventId,
    showId: order.showId,
    sequence: index + 1,
    ticketNumber: randomTicketNumber(),
    publicCode: randomPublicCode(),
    status: 'valid',
  }));
  await Ticket.create(tickets, { session, ordered: true });
};

export const processCapturedPayment = async ({
  provider,
  providerEventId,
  eventType,
  rawBody,
  providerOrderId,
  providerPaymentId,
  amountPaise,
  currency,
}) => {
  const previous = await WebhookEvent.findOne({ provider, providerEventId }).lean();
  if (previous) return { outcome: previous.status, duplicate: true, orderId: null };

  try {
    let result;
    await mongoose.connection.transaction(async (session) => {
      const payment = await Payment.findOne({ provider, providerOrderId }).session(session);
      if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment order was not found.');
      const order = await Order.findById(payment.orderId).session(session);
      if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found.');

      if (payment.status === 'captured' || order.status === 'paid') {
        await WebhookEvent.create([webhookRecord({
          provider,
          providerEventId,
          eventType,
          rawBody,
          status: 'ignored',
        })], { session });
        result = { outcome: 'already_paid', duplicate: false, orderId: order._id };
        return;
      }

      if (
        payment.amountPaise !== amountPaise
        || order.totalAmountPaise !== amountPaise
        || payment.currency !== currency
        || order.currency !== currency
      ) {
        await WebhookEvent.create([webhookRecord({
          provider,
          providerEventId,
          eventType,
          rawBody,
          status: 'rejected',
          errorCode: 'PAYMENT_DETAILS_MISMATCH',
        })], { session });
        result = { outcome: 'rejected', duplicate: false, orderId: order._id };
        return;
      }

      const reservation = await Reservation.findOne({ orderId: order._id }).session(session);
      if (!reservation) throw new AppError(409, 'RESERVATION_NOT_FOUND', 'Order reservation was not found.');

      let inventoryAllocated = false;
      if (reservation.status === 'active') {
        const converted = await Reservation.updateOne(
          { _id: reservation._id, status: 'active' },
          { $set: { status: 'converted', convertedAt: new Date() } },
          { session }
        );
        if (converted.modifiedCount === 1) {
          const inventory = await EventShow.updateOne(
            {
              _id: reservation.showId,
              status: 'scheduled',
              reservedCount: { $gte: reservation.quantity },
            },
            { $inc: { reservedCount: -reservation.quantity, soldCount: reservation.quantity } },
            { session }
          );
          inventoryAllocated = inventory.modifiedCount === 1;
        }
      } else if (['expired', 'released'].includes(reservation.status)) {
        const inventory = await EventShow.updateOne(
          {
            _id: reservation.showId,
            status: 'scheduled',
            $expr: {
              $gte: [
                { $subtract: ['$capacity', { $add: ['$reservedCount', '$soldCount'] }] },
                reservation.quantity,
              ],
            },
          },
          { $inc: { soldCount: reservation.quantity } },
          { session }
        );
        inventoryAllocated = inventory.modifiedCount === 1;
        if (inventoryAllocated) {
          await Reservation.updateOne(
            { _id: reservation._id, status: reservation.status },
            { $set: { status: 'converted', convertedAt: new Date() } },
            { session }
          );
        }
      }

      if (!inventoryAllocated) {
        if (reservation.status === 'active') {
          await Reservation.updateOne(
            { _id: reservation._id, status: 'converted' },
            { $set: { status: 'released', releasedAt: new Date() } },
            { session }
          );
          const releasedInventory = await EventShow.updateOne(
            { _id: reservation.showId, reservedCount: { $gte: reservation.quantity } },
            { $inc: { reservedCount: -reservation.quantity } },
            { session }
          );
          if (releasedInventory.modifiedCount !== 1) {
            throw new AppError(409, 'INVENTORY_INCONSISTENT', 'Reserved inventory could not be released safely.');
          }
        }
        await Payment.updateOne(
          { _id: payment._id },
          { $set: { status: 'captured', providerPaymentId, verifiedAt: new Date() } },
          { session }
        );
        await Order.updateOne(
          { _id: order._id },
          { $set: { status: 'refund_required', paidAt: new Date(), failureCode: 'INVENTORY_UNAVAILABLE_AFTER_PAYMENT' } },
          { session }
        );
        await WebhookEvent.create([webhookRecord({
          provider,
          providerEventId,
          eventType,
          rawBody,
          status: 'processed',
        })], { session });
        result = { outcome: 'refund_required', duplicate: false, orderId: order._id };
        return;
      }

      await createTickets({ order, session });
      await Payment.updateOne(
        { _id: payment._id, status: { $ne: 'captured' } },
        { $set: { status: 'captured', providerPaymentId, verifiedAt: new Date() } },
        { session }
      );
      await Order.updateOne(
        { _id: order._id, status: { $ne: 'paid' } },
        { $set: { status: 'paid', paidAt: new Date(), failureCode: null } },
        { session }
      );
      await WebhookEvent.create([webhookRecord({
        provider,
        providerEventId,
        eventType,
        rawBody,
        status: 'processed',
      })], { session });
      result = { outcome: 'paid', duplicate: false, orderId: order._id };
    });
    return result;
  } catch (error) {
    if (error?.code === 11000) {
      const duplicate = await WebhookEvent.findOne({ provider, providerEventId }).lean();
      if (duplicate) return { outcome: duplicate.status, duplicate: true, orderId: null };
    }
    throw error;
  }
};
