import { processCapturedPayment, recordIgnoredWebhook } from '../services/paymentFinalizationService.js';
import { verifyProviderWebhook } from '../services/payments/paymentProvider.js';
import { AppError } from '../utils/errors.js';

const paymentFromPayload = (body) => body?.payload?.payment?.entity;

export const paymentWebhook = (provider) => async (req, res, next) => {
  try {
    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) throw new AppError(400, 'RAW_BODY_REQUIRED', 'Raw webhook body is required.');
    const signature = req.get('x-razorpay-signature');
    const providerEventId = String(req.get('x-razorpay-event-id') || '').trim();
    if (!providerEventId) throw new AppError(400, 'WEBHOOK_EVENT_ID_REQUIRED', 'Webhook event ID is required.');
    verifyProviderWebhook({ provider, rawBody, signature });

    let body;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new AppError(400, 'INVALID_WEBHOOK_JSON', 'Webhook payload is invalid.');
    }
    const eventType = String(body.event || 'unknown');
    if (!['payment.captured', 'order.paid'].includes(eventType)) {
      const ignored = await recordIgnoredWebhook({ provider, providerEventId, eventType, rawBody });
      return res.json({ data: { outcome: 'ignored', duplicate: ignored.duplicate } });
    }

    const payment = paymentFromPayload(body);
    if (!payment?.id || !payment?.order_id || !Number.isInteger(Number(payment.amount)) || !payment.currency) {
      throw new AppError(400, 'INVALID_PAYMENT_EVENT', 'Webhook payment data is incomplete.');
    }
    const result = await processCapturedPayment({
      provider,
      providerEventId,
      eventType,
      rawBody,
      providerOrderId: String(payment.order_id),
      providerPaymentId: String(payment.id),
      amountPaise: Number(payment.amount),
      currency: String(payment.currency).toUpperCase(),
    });
    if (result.outcome === 'rejected') {
      return res.status(422).json({ code: 'PAYMENT_DETAILS_MISMATCH', message: 'Payment details do not match the order.' });
    }
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
};
