import Event from '../models/events.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Reservation from '../models/Reservation.js';
import Ticket from '../models/Ticket.js';
import { AppError } from '../utils/errors.js';
import { isObjectId } from '../utils/validation.js';

const pageInput = (query) => ({
  limit: Math.min(Math.max(Number(query.limit) || 20, 1), 50),
  offset: Math.max(Number(query.offset) || 0, 0),
});

export const getMyOrders = async (req, res, next) => {
  try {
    const { limit, offset } = pageInput(req.query);
    const filter = { userId: req.user._id };
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit)
        .populate('eventId', 'title slug venue timezone')
        .populate('showId', 'startsAt endsAt').lean(),
      Order.countDocuments(filter),
    ]);
    return res.json({ data: orders, meta: { total, limit, offset } });
  } catch (error) {
    return next(error);
  }
};

export const getMyOrderById = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) throw new AppError(400, 'INVALID_ORDER_ID', 'Invalid order ID.');
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('eventId', 'title slug venue timezone')
      .populate('showId', 'startsAt endsAt').lean();
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const [reservation, payment, tickets] = await Promise.all([
      Reservation.findOne({ orderId: order._id }).lean(),
      Payment.findOne({ orderId: order._id }).lean(),
      Ticket.find({ orderId: order._id }).sort({ sequence: 1 }).lean(),
    ]);
    return res.json({ data: { order, reservation, payment, tickets } });
  } catch (error) {
    return next(error);
  }
};

export const getMyOrderTickets = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) throw new AppError(400, 'INVALID_ORDER_ID', 'Invalid order ID.');
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id }).select('_id').lean();
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const tickets = await Ticket.find({ orderId: order._id }).sort({ sequence: 1 }).lean();
    return res.json({ data: tickets });
  } catch (error) {
    return next(error);
  }
};

export const getMyPaymentStatus = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) throw new AppError(400, 'INVALID_ORDER_ID', 'Invalid order ID.');
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id })
      .select('status paidAt failureCode').lean();
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const payment = await Payment.findOne({ orderId: order._id }).select('provider status verifiedAt').lean();
    return res.json({ data: { order, payment } });
  } catch (error) {
    return next(error);
  }
};

export const getOrganizerEventOrders = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.eventId)) throw new AppError(400, 'INVALID_EVENT_ID', 'Invalid event ID.');
    const event = await Event.findOne({ _id: req.params.eventId, organizerId: req.user._id }).select('_id').lean();
    if (!event) throw new AppError(404, 'EVENT_NOT_FOUND', 'Event not found.');
    const { limit, offset } = pageInput(req.query);
    const filter = { eventId: event._id };
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);
    return res.json({ data: orders, meta: { total, limit, offset } });
  } catch (error) {
    return next(error);
  }
};
