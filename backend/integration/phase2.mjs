import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import test from 'node:test';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Event from '../models/events.js';
import EventShow from '../models/EventShow.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Reservation from '../models/Reservation.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';
import WebhookEvent from '../models/WebhookEvent.js';
import { releaseExpiredReservations } from '../services/reservationService.js';

const apiBase = process.env.API_TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5000}/api/v1`;
const runId = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
const password = 'Phase2-Test-Password-42!';

const request = async (path, { token, cookie, method = 'GET', body, headers: extraHeaders = {} } = {}) => {
  const headers = { ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  return { response, payload };
};

const login = async (username) => {
  const result = await request('/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  return { token: result.payload.data.accessToken, user: result.payload.data.user };
};

const webhook = async ({ eventId, providerOrderId, providerPaymentId, amountPaise, signatureOverride }) => {
  const rawBody = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: providerPaymentId,
          order_id: providerOrderId,
          amount: amountPaise,
          currency: 'INR',
          status: 'captured',
        },
      },
    },
  });
  const secret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET || process.env.JWT_SECRET;
  const signature = signatureOverride || crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const response = await fetch(`${apiBase}/webhooks/mock`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-event-id': eventId,
      'x-razorpay-signature': signature,
    },
    body: rawBody,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  return { response, payload: text ? JSON.parse(text) : null };
};

test('Phase 2 payment, reservation, concurrency, and ticket routes work', async () => {
  const names = {
    buyerA: `phase2_buyera_${runId}`,
    buyerB: `phase2_buyerb_${runId}`,
    organizer: `phase2_org_${runId}`,
  };
  const userIds = [];
  const eventIds = [];
  let temporaryCategoryId;

  await mongoose.connect(process.env.MONGO_URI);
  try {
    const ready = await request('/health/ready');
    assert.equal(ready.response.status, 200);

    for (const [key, username] of Object.entries(names)) {
      const registration = await request('/auth/register', {
        method: 'POST',
        body: { username, email: `${username}@example.test`, password },
      });
      assert.equal(registration.response.status, 201, `${key}: ${JSON.stringify(registration.payload)}`);
      userIds.push(registration.payload.data.id);
    }
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userIds[2]) },
      { $set: { role: 'organizer' } }
    );

    const buyerA = await login(names.buyerA);
    const buyerB = await login(names.buyerB);
    const organizer = await login(names.organizer);

    const unsignedCheckout = await request('/payments/verify', {
      method: 'POST',
      token: buyerA.token,
      body: {},
    });
    assert.equal(unsignedCheckout.response.status, 400);
    assert.equal(unsignedCheckout.payload.code, 'INVALID_PAYMENT_VERIFICATION');

    let category = await Category.findOne({ isActive: true }).lean();
    if (!category) {
      category = await Category.create({ name: `Phase 2 ${runId}`, slug: `phase-2-${runId}`, isActive: true });
      temporaryCategoryId = category._id;
    }
    const organizerId = new mongoose.Types.ObjectId(userIds[2]);
    const event = await Event.create({
      organizerId,
      categoryId: category._id,
      title: `Phase 2 Event ${runId}`,
      slug: `phase-2-event-${runId}`,
      venue: 'Phase 2 Test Venue',
      timezone: 'Asia/Kolkata',
      status: 'published',
      publishedAt: new Date(),
    });
    eventIds.push(event._id);
    const foreignEvent = await Event.create({
      organizerId: new mongoose.Types.ObjectId(),
      categoryId: category._id,
      title: `Foreign Phase 2 Event ${runId}`,
      slug: `foreign-phase-2-${runId}`,
      venue: 'Other Venue',
      timezone: 'Asia/Kolkata',
      status: 'published',
      publishedAt: new Date(),
    });
    eventIds.push(foreignEvent._id);

    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const show = await EventShow.create({
      eventId: event._id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
      pricePaise: 50000,
      capacity: 3,
    });
    const concurrencyShow = await EventShow.create({
      eventId: event._id,
      startsAt: new Date(startsAt.getTime() + 24 * 60 * 60 * 1000),
      endsAt: new Date(startsAt.getTime() + 26 * 60 * 60 * 1000),
      pricePaise: 25000,
      capacity: 5,
    });
    const idempotencyShow = await EventShow.create({
      eventId: event._id,
      startsAt: new Date(startsAt.getTime() + 36 * 60 * 60 * 1000),
      endsAt: new Date(startsAt.getTime() + 38 * 60 * 60 * 1000),
      pricePaise: 20000,
      capacity: 2,
    });
    const lateShow = await EventShow.create({
      eventId: event._id,
      startsAt: new Date(startsAt.getTime() + 48 * 60 * 60 * 1000),
      endsAt: new Date(startsAt.getTime() + 50 * 60 * 60 * 1000),
      pricePaise: 30000,
      capacity: 1,
    });

    const bookingKey = `phase2-main-${runId}`;
    const booking = await request('/bookings', {
      method: 'POST',
      token: buyerA.token,
      headers: { 'idempotency-key': bookingKey },
      body: { showId: show._id, quantity: 2 },
    });
    assert.equal(booking.response.status, 201, JSON.stringify(booking.payload));
    assert.equal(booking.payload.data.checkout.provider, 'mock', 'Integration server must use the mock provider.');
    const orderId = booking.payload.data.order._id;
    const providerOrderId = booking.payload.data.checkout.providerOrderId;

    const replay = await request('/bookings', {
      method: 'POST',
      token: buyerA.token,
      headers: { 'idempotency-key': bookingKey },
      body: { showId: show._id, quantity: 2 },
    });
    assert.equal(replay.response.status, 200, JSON.stringify(replay.payload));
    assert.equal(replay.payload.data.order._id, orderId);
    assert.equal(replay.payload.data.checkout.providerOrderId, providerOrderId);
    assert.equal((await EventShow.findById(show._id).lean()).reservedCount, 2);

    const soldOut = await request('/bookings', {
      method: 'POST',
      token: buyerB.token,
      headers: { 'idempotency-key': `phase2-too-many-${runId}` },
      body: { showId: show._id, quantity: 2 },
    });
    assert.equal(soldOut.response.status, 409);
    assert.equal(soldOut.payload.code, 'INSUFFICIENT_INVENTORY');

    const invalidSignature = await webhook({
      eventId: `phase2-invalid-signature-${runId}`,
      providerOrderId,
      providerPaymentId: `mock_payment_invalid_${runId}`,
      amountPaise: 100000,
      signatureOverride: 'invalid',
    });
    assert.equal(invalidSignature.response.status, 401);

    const paidWebhook = await webhook({
      eventId: `phase2-paid-${runId}`,
      providerOrderId,
      providerPaymentId: `mock_payment_paid_${runId}`,
      amountPaise: 100000,
    });
    assert.equal(paidWebhook.response.status, 200, JSON.stringify(paidWebhook.payload));
    assert.equal(paidWebhook.payload.data.outcome, 'paid');
    const afterPayment = await EventShow.findById(show._id).lean();
    assert.equal(afterPayment.reservedCount, 0);
    assert.equal(afterPayment.soldCount, 2);
    assert.equal(await Ticket.countDocuments({ orderId }), 2);

    const duplicateWebhook = await webhook({
      eventId: `phase2-paid-${runId}`,
      providerOrderId,
      providerPaymentId: `mock_payment_paid_${runId}`,
      amountPaise: 100000,
    });
    assert.equal(duplicateWebhook.response.status, 200);
    assert.equal(duplicateWebhook.payload.data.duplicate, true);
    assert.equal(await Ticket.countDocuments({ orderId }), 2);

    const myOrders = await request('/orders', { token: buyerA.token });
    assert.equal(myOrders.response.status, 200);
    assert.ok(myOrders.payload.data.some((item) => String(item._id) === String(orderId)));
    const orderDetail = await request(`/orders/${orderId}`, { token: buyerA.token });
    assert.equal(orderDetail.response.status, 200);
    assert.equal(orderDetail.payload.data.order.status, 'paid');
    const forbiddenOrder = await request(`/orders/${orderId}`, { token: buyerB.token });
    assert.equal(forbiddenOrder.response.status, 404);
    const paymentStatus = await request(`/orders/${orderId}/payment-status`, { token: buyerA.token });
    assert.equal(paymentStatus.response.status, 200);
    assert.equal(paymentStatus.payload.data.payment.status, 'captured');
    const orderTickets = await request(`/orders/${orderId}/tickets`, { token: buyerA.token });
    assert.equal(orderTickets.response.status, 200);
    assert.equal(orderTickets.payload.data.length, 2);

    const ticketId = orderTickets.payload.data[0]._id;
    const ticket = await request(`/tickets/${ticketId}`, { token: buyerA.token });
    assert.equal(ticket.response.status, 200);
    const qr = await request(`/tickets/${ticketId}/qr`, { token: buyerA.token });
    assert.equal(qr.response.status, 200, JSON.stringify(qr.payload));
    assert.match(qr.payload.data.qrDataUrl, /^data:image\/png;base64,/);
    const userCheckIn = await request('/tickets/check-in', {
      method: 'POST', token: buyerA.token, body: { qrPayload: qr.payload.data.qrPayload },
    });
    assert.equal(userCheckIn.response.status, 403);
    const checkIn = await request('/tickets/check-in', {
      method: 'POST', token: organizer.token, body: { qrPayload: qr.payload.data.qrPayload },
    });
    assert.equal(checkIn.response.status, 200, JSON.stringify(checkIn.payload));
    const doubleCheckIn = await request('/tickets/check-in', {
      method: 'POST', token: organizer.token, body: { qrPayload: qr.payload.data.qrPayload },
    });
    assert.equal(doubleCheckIn.response.status, 409);

    const organizerOrders = await request(`/organizer/events/${event._id}/orders`, { token: organizer.token });
    assert.equal(organizerOrders.response.status, 200);
    const foreignOrders = await request(`/organizer/events/${foreignEvent._id}/orders`, { token: organizer.token });
    assert.equal(foreignOrders.response.status, 404);
    const cancelPaidEvent = await request(`/events/${event._id}/cancel`, { method: 'POST', token: organizer.token });
    assert.equal(cancelPaidEvent.response.status, 409);

    const concurrentIdempotencyKey = `phase2-same-key-${runId}`;
    const duplicateBookings = await Promise.all([0, 1].map(() => request('/bookings', {
      method: 'POST',
      token: buyerA.token,
      headers: { 'idempotency-key': concurrentIdempotencyKey },
      body: { showId: idempotencyShow._id, quantity: 1 },
    })));
    assert.deepEqual(duplicateBookings.map((result) => result.response.status).sort(), [200, 201]);
    assert.equal(await Order.countDocuments({ userId: userIds[0], idempotencyKey: concurrentIdempotencyKey }), 1);
    assert.equal((await EventShow.findById(idempotencyShow._id).lean()).reservedCount, 1);

    const concurrentResults = await Promise.all(Array.from({ length: 10 }, (_, index) => request('/bookings', {
      method: 'POST',
      token: index % 2 ? buyerA.token : buyerB.token,
      headers: { 'idempotency-key': `phase2-race-${runId}-${index}` },
      body: { showId: concurrencyShow._id, quantity: 1 },
    })));
    assert.equal(concurrentResults.filter((result) => result.response.status === 201).length, 5);
    assert.equal(concurrentResults.filter((result) => result.response.status === 409).length, 5);
    const racedShow = await EventShow.findById(concurrencyShow._id).lean();
    assert.equal(racedShow.reservedCount, 5);
    assert.equal(racedShow.soldCount, 0);

    const expiringBooking = await request('/bookings', {
      method: 'POST', token: buyerA.token,
      headers: { 'idempotency-key': `phase2-expire-${runId}` },
      body: { showId: lateShow._id, quantity: 1 },
    });
    assert.equal(expiringBooking.response.status, 201, JSON.stringify(expiringBooking.payload));
    const expiredOrderId = expiringBooking.payload.data.order._id;
    await Reservation.updateOne({ orderId: expiredOrderId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expiryResult = await releaseExpiredReservations();
    assert.ok(expiryResult.releasedCount >= 1);
    assert.equal((await Order.findById(expiredOrderId).lean()).status, 'expired');
    assert.equal((await EventShow.findById(lateShow._id).lean()).reservedCount, 0);

    const replacement = await request('/bookings', {
      method: 'POST', token: buyerB.token,
      headers: { 'idempotency-key': `phase2-replacement-${runId}` },
      body: { showId: lateShow._id, quantity: 1 },
    });
    assert.equal(replacement.response.status, 201, JSON.stringify(replacement.payload));
    const lateWebhook = await webhook({
      eventId: `phase2-late-${runId}`,
      providerOrderId: expiringBooking.payload.data.checkout.providerOrderId,
      providerPaymentId: `mock_payment_late_${runId}`,
      amountPaise: 30000,
    });
    assert.equal(lateWebhook.response.status, 200, JSON.stringify(lateWebhook.payload));
    assert.equal(lateWebhook.payload.data.outcome, 'refund_required');
    assert.equal((await Order.findById(expiredOrderId).lean()).status, 'refund_required');
    assert.equal(await Ticket.countDocuments({ orderId: expiredOrderId }), 0);

    const mismatched = await webhook({
      eventId: `phase2-mismatch-${runId}`,
      providerOrderId: replacement.payload.data.checkout.providerOrderId,
      providerPaymentId: `mock_payment_replacement_${runId}`,
      amountPaise: 1,
    });
    assert.equal(mismatched.response.status, 422);
    const correctReplacement = await webhook({
      eventId: `phase2-replacement-paid-${runId}`,
      providerOrderId: replacement.payload.data.checkout.providerOrderId,
      providerPaymentId: `mock_payment_replacement_${runId}`,
      amountPaise: 30000,
    });
    assert.equal(correctReplacement.response.status, 200, JSON.stringify(correctReplacement.payload));
    assert.equal(correctReplacement.payload.data.outcome, 'paid');
  } finally {
    const allOrders = await Order.find({
      $or: [{ userId: { $in: userIds } }, { eventId: { $in: eventIds } }],
    }).select('_id').lean().catch(() => []);
    const orderIds = allOrders.map((order) => order._id);
    if (orderIds.length) {
      await Ticket.deleteMany({ orderId: { $in: orderIds } });
      await Payment.deleteMany({ orderId: { $in: orderIds } });
      await Reservation.deleteMany({ orderId: { $in: orderIds } });
      await Order.deleteMany({ _id: { $in: orderIds } });
    }
    await WebhookEvent.deleteMany({ providerEventId: new RegExp(`^phase2-.*-${runId}$`) });
    if (eventIds.length) {
      await EventShow.deleteMany({ eventId: { $in: eventIds } });
      await Event.deleteMany({ _id: { $in: eventIds } });
    }
    if (userIds.length) {
      await UserSession.deleteMany({ userId: { $in: userIds } });
      await User.deleteMany({ _id: { $in: userIds } });
    }
    if (temporaryCategoryId) await Category.deleteOne({ _id: temporaryCategoryId });
    await mongoose.disconnect();
  }
});
