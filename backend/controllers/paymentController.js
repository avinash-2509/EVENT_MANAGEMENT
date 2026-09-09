import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import { verifyCheckoutSignature } from '../services/payments/paymentProvider.js';
import { AppError } from '../utils/errors.js';
import { isObjectId } from '../utils/validation.js';

const checkoutField = (body, name) => String(body?.[name] || '').trim();

export const verifyCheckoutPayment = async (req, res, next) => {
  try {
    const orderId = checkoutField(req.body, 'orderId');
    const providerOrderId = checkoutField(req.body, 'razorpay_order_id');
    const providerPaymentId = checkoutField(req.body, 'razorpay_payment_id');
    const signature = checkoutField(req.body, 'razorpay_signature');

    if (!isObjectId(orderId) || !providerOrderId || !providerPaymentId || !signature) {
      throw new AppError(400, 'INVALID_PAYMENT_VERIFICATION', 'Order ID and all Razorpay payment fields are required.');
    }
    if (providerOrderId.length > 100 || providerPaymentId.length > 100 || signature.length > 256) {
      throw new AppError(400, 'INVALID_PAYMENT_VERIFICATION', 'Payment verification fields are invalid.');
    }

    const order = await Order.findOne({ _id: orderId, userId: req.user._id }).select('status').lean();
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');

    const payment = await Payment.findOne({ orderId: order._id });
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
    if (payment.provider !== 'razorpay') {
      throw new AppError(409, 'PAYMENT_PROVIDER_MISMATCH', 'This order was not created with Razorpay.');
    }
    if (payment.providerOrderId !== providerOrderId) {
      throw new AppError(400, 'PAYMENT_ORDER_MISMATCH', 'Razorpay order ID does not match this order.');
    }

    verifyCheckoutSignature({
      providerOrderId: payment.providerOrderId,
      providerPaymentId,
      signature,
    });

    if (payment.providerPaymentId && payment.providerPaymentId !== providerPaymentId) {
      throw new AppError(409, 'PAYMENT_ALREADY_LINKED', 'A different payment is already linked to this order.');
    }
    payment.providerPaymentId = providerPaymentId;
    await payment.save();

    return res.json({
      data: {
        verified: true,
        orderId: order._id,
        orderStatus: order.status,
        paymentStatus: payment.status,
        awaitingWebhook: order.status !== 'paid',
      },
    });
  } catch (error) {
    return next(error);
  }
};
