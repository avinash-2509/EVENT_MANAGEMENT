import assert from 'node:assert/strict';
import crypto from 'crypto';
import test from 'node:test';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Reservation from '../models/Reservation.js';
import Ticket from '../models/Ticket.js';
import { verifyCheckoutSignature, verifyProviderWebhook } from '../services/payments/paymentProvider.js';
import { createQrPayload, parseAndVerifyQrPayload } from '../utils/qr.js';

test('Phase 2 schemas use Order as the parent without circular reservation references', () => {
  assert.equal(Order.schema.path('reservationId'), undefined);
  assert.ok(Reservation.schema.path('orderId'));
  assert.equal(Payment.schema.path('userId'), undefined);
  assert.equal(Payment.schema.path('razorpayOrderId'), undefined);
  assert.ok(Payment.schema.path('providerOrderId'));
  assert.ok(Ticket.schema.path('publicCode'));
});

test('Order rejects a total that does not match price multiplied by quantity', async () => {
  const objectId = new mongoose.Types.ObjectId();
  const order = new Order({
    userId: objectId,
    eventId: objectId,
    showId: objectId,
    quantity: 2,
    unitPricePaise: 50000,
    totalAmountPaise: 50000,
    currency: 'INR',
    idempotencyKey: 'phase2-test-key',
  });
  await assert.rejects(order.validate(), /Total amount must equal/);
});

test('signed QR payloads verify and reject tampering', () => {
  const previousSecret = process.env.QR_SIGNING_SECRET;
  process.env.QR_SIGNING_SECRET = 'phase-2-qr-unit-test-secret';
  try {
    const ticket = { _id: new mongoose.Types.ObjectId(), publicCode: 'public-code-123' };
    const payload = createQrPayload(ticket);
    assert.deepEqual(parseAndVerifyQrPayload(payload), {
      ticketId: String(ticket._id),
      publicCode: ticket.publicCode,
    });
    assert.equal(parseAndVerifyQrPayload(`${payload}tampered`), null);
  } finally {
    if (previousSecret === undefined) delete process.env.QR_SIGNING_SECRET;
    else process.env.QR_SIGNING_SECRET = previousSecret;
  }
});

test('mock webhook signatures require an exact raw-body HMAC', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET;
  process.env.NODE_ENV = 'test';
  process.env.MOCK_PAYMENT_WEBHOOK_SECRET = 'phase-2-webhook-unit-secret';
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const signature = crypto.createHmac('sha256', process.env.MOCK_PAYMENT_WEBHOOK_SECRET).update(rawBody).digest('hex');
  try {
    assert.doesNotThrow(() => verifyProviderWebhook({ provider: 'mock', rawBody, signature }));
    assert.throws(
      () => verifyProviderWebhook({ provider: 'mock', rawBody, signature: `${signature.slice(0, -1)}0` }),
      /Webhook signature is invalid/
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSecret === undefined) delete process.env.MOCK_PAYMENT_WEBHOOK_SECRET;
    else process.env.MOCK_PAYMENT_WEBHOOK_SECRET = previousSecret;
  }
});

test('Razorpay checkout signatures bind the provider order and payment IDs', () => {
  const previousSecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_SECRET = 'phase-2-checkout-unit-secret';
  const providerOrderId = 'order_phase2_test';
  const providerPaymentId = 'pay_phase2_test';
  const signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${providerOrderId}|${providerPaymentId}`)
    .digest('hex');
  try {
    assert.doesNotThrow(() => verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }));
    assert.throws(
      () => verifyCheckoutSignature({ providerOrderId, providerPaymentId: 'pay_tampered', signature }),
      /Payment signature is invalid/
    );
  } finally {
    if (previousSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousSecret;
  }
});
