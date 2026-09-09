import mongoose from 'mongoose';

export const ORDER_STATUSES = [
  'payment_initializing',
  'pending_payment',
  'paid',
  'payment_failed',
  'expired',
  'refund_required',
];

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    showId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventShow', required: true, index: true },
    quantity: { type: Number, required: true, min: 1, max: 10 },
    unitPricePaise: { type: Number, required: true, min: 1 },
    totalAmountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ['INR'], required: true, default: 'INR' },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 128 },
    status: { type: String, enum: ORDER_STATUSES, default: 'payment_initializing', index: true },
    paidAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureCode: { type: String, default: null, maxlength: 100 },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ eventId: 1, createdAt: -1 });
orderSchema.index({ showId: 1, status: 1 });

orderSchema.pre('validate', function validateTotal() {
  if (this.quantity && this.unitPricePaise && this.totalAmountPaise !== this.quantity * this.unitPricePaise) {
    this.invalidate('totalAmountPaise', 'Total amount must equal quantity multiplied by unit price.');
  }
});

export default mongoose.model('Order', orderSchema);
