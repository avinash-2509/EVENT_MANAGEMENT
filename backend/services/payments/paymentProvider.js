import crypto from 'crypto';
import Razorpay from 'razorpay';
import { AppError } from '../../utils/errors.js';

const safeSignatureMatch = (rawBody, signature, secret) => {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(String(signature));
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

export const getPaymentProviderName = () => {
  if (process.env.PAYMENT_PROVIDER) return process.env.PAYMENT_PROVIDER.toLowerCase();
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) return 'razorpay';
  if (process.env.NODE_ENV !== 'production') return 'mock';
  throw new AppError(503, 'PAYMENT_NOT_CONFIGURED', 'Payment provider is not configured.');
};

export const getPaymentCheckoutKey = (provider) => {
  if (provider === 'razorpay') return process.env.RAZORPAY_KEY_ID || null;
  if (provider === 'mock') return 'mock_checkout';
  return null;
};

const createMockOrder = async ({ localOrderId, amountPaise, currency }) => ({
  provider: 'mock',
  providerOrderId: `mock_order_${localOrderId}`,
  amountPaise,
  currency,
  checkoutKey: 'mock_checkout',
});

const createRazorpayOrder = async ({ localOrderId, amountPaise, currency }) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new AppError(503, 'PAYMENT_NOT_CONFIGURED', 'Razorpay credentials are not configured.');
  }

  if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) {
    throw new AppError(400, 'INVALID_PAYMENT_AMOUNT', 'Payment amount must be at least 100 paise.');
  }

  let body;
  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    body = await razorpay.orders.create({
      amount: amountPaise,
      currency,
      receipt: String(localOrderId),
      notes: { eventlyOrderId: String(localOrderId) },
    });
  } catch (error) {
    if (Number(error?.statusCode) === 401) {
      throw new AppError(401, 'PAYMENT_PROVIDER_AUTH_FAILED', 'Razorpay credentials were rejected.');
    }
    throw new AppError(500, 'PAYMENT_PROVIDER_ERROR', 'Unable to initialize payment checkout.');
  }
  if (!body?.id) {
    throw new AppError(500, 'PAYMENT_PROVIDER_ERROR', 'Unable to initialize payment checkout.');
  }
  if (Number(body.amount) !== amountPaise || body.currency !== currency) {
    throw new AppError(500, 'PAYMENT_PROVIDER_MISMATCH', 'Payment provider returned unexpected order details.');
  }

  return {
    provider: 'razorpay',
    providerOrderId: body.id,
    amountPaise: Number(body.amount),
    currency: body.currency,
    checkoutKey: keyId,
  };
};

export const createProviderOrder = async (input) => {
  const provider = getPaymentProviderName();
  if (provider === 'mock') return createMockOrder(input);
  if (provider === 'razorpay') return createRazorpayOrder(input);
  throw new AppError(503, 'PAYMENT_NOT_CONFIGURED', 'Unsupported payment provider.');
};

export const verifyProviderWebhook = ({ provider, rawBody, signature }) => {
  if (provider === 'razorpay') {
    if (!safeSignatureMatch(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET)) {
      throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Webhook signature is invalid.');
    }
    return;
  }
  if (provider === 'mock' && process.env.NODE_ENV !== 'production') {
    const secret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET || process.env.JWT_SECRET;
    if (!safeSignatureMatch(rawBody, signature, secret)) {
      throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Webhook signature is invalid.');
    }
    return;
  }
  throw new AppError(404, 'WEBHOOK_NOT_FOUND', 'Webhook endpoint is unavailable.');
};

export const verifyCheckoutSignature = ({ providerOrderId, providerPaymentId, signature }) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new AppError(503, 'PAYMENT_NOT_CONFIGURED', 'Razorpay credentials are not configured.');
  }
  const payload = `${providerOrderId}|${providerPaymentId}`;
  if (!safeSignatureMatch(payload, signature, secret)) {
    throw new AppError(400, 'INVALID_PAYMENT_SIGNATURE', 'Payment signature is invalid.');
  }
};
