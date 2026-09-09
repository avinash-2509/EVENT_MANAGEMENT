import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['razorpay', 'mock'], required: true },
    providerEventId: { type: String, required: true, trim: true },
    eventType: { type: String, required: true, trim: true, maxlength: 100 },
    payloadHash: { type: String, required: true, trim: true },
    status: { type: String, enum: ['processed', 'ignored', 'rejected'], required: true },
    processedAt: { type: Date, required: true, default: Date.now },
    errorCode: { type: String, default: null, maxlength: 100 },
  },
  { timestamps: true }
);

webhookEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });
webhookEventSchema.index({ createdAt: -1 });

export default mongoose.model('WebhookEvent', webhookEventSchema);
