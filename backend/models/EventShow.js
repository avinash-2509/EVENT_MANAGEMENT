import mongoose from 'mongoose';

const eventShowSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    pricePaise: { type: Number, required: true, min: 1, validate: Number.isInteger },
    currency: { type: String, enum: ['INR'], default: 'INR' },
    capacity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    reservedCount: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    soldCount: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    salesOpenAt: { type: Date, default: null },
    salesCloseAt: { type: Date, default: null },
    status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled' },
  },
  { timestamps: true }
);

eventShowSchema.index({ eventId: 1, startsAt: 1 });
eventShowSchema.index({ status: 1, startsAt: 1 });

export default mongoose.model('EventShow', eventShowSchema);
