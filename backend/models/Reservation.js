import mongoose from 'mongoose';

export const RESERVATION_STATUSES = ['active', 'converted', 'expired', 'released'];

const reservationSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    showId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventShow', required: true, index: true },
    quantity: { type: Number, required: true, min: 1, max: 10 },
    status: { type: String, enum: RESERVATION_STATUSES, default: 'active', index: true },
    expiresAt: { type: Date, required: true },
    convertedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reservationSchema.index({ status: 1, expiresAt: 1 });

export default mongoose.model('Reservation', reservationSchema);
