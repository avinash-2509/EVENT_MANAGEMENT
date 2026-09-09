import mongoose from 'mongoose';

export const PAYMENT_STATUSES = ['created', 'authorized', 'captured', 'failed', 'refunded'];

const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    provider: { type: String, enum: ['razorpay', 'mock'], required: true },
    providerOrderId: { type: String, required: true, trim: true },
    providerPaymentId: { type: String, default: null, trim: true },
    amountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ['INR'], required: true, default: 'INR' },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'created', index: true },
    verifiedAt: { type: Date, default: null },
    failureCode: { type: String, default: null, maxlength: 100 },
  },
  { timestamps: true }
);

paymentSchema.index({ provider: 1, providerOrderId: 1 }, { unique: true });
paymentSchema.index(
  { provider: 1, providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } } }
);

export default mongoose.model('Payment', paymentSchema);
