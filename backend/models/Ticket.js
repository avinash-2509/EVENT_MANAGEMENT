import mongoose from 'mongoose';

export const TICKET_STATUSES = ['valid', 'used', 'cancelled', 'refunded'];

const ticketSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    showId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventShow', required: true, index: true },
    sequence: { type: Number, required: true, min: 1 },
    ticketNumber: { type: String, required: true, unique: true, trim: true },
    publicCode: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: TICKET_STATUSES, default: 'valid', index: true },
    checkedInAt: { type: Date, default: null },
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

ticketSchema.index({ orderId: 1, sequence: 1 }, { unique: true });
ticketSchema.index({ eventId: 1, status: 1 });

export default mongoose.model('Ticket', ticketSchema);
