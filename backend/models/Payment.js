import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    // The order this payment is for
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
    },
    // Who made the payment
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    // Which event — kept for fast financial reporting per event
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
    },
    // Which specific show — kept for per-show revenue queries
    showId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EventShow',
      required: [true, 'Show ID is required'],
    },
    // Razorpay's order ID — created on your server before payment
    razorpayOrderId: {
      type: String,
      required: [true, 'Razorpay order ID is required'],
    },
    // Razorpay's payment ID — received after successful payment via webhook
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    // HMAC signature from Razorpay webhook — verified to confirm authenticity
    // Stored for audit trail — proves this payment was genuinely verified
    razorpaySignature: {
      type: String,
      default: null,
    },
    // Payment amount in paise — must match Order.totalAmount
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    currency: {
      type: String,
      default: 'INR',
    },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed', 'refunded'],
      default: 'created',
    },
    // Razorpay refund ID — set when refund is triggered after cancellation
    // Lives HERE only, not on Order
    refundId: {
      type: String,
      default: null,
    },
    // When payment was confirmed by Razorpay
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
