import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    organizerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '', maxlength: 10000 },
    imageUrl: { type: String, default: '' },
    venue: { type: String, required: true, trim: true, maxlength: 300 },
    timezone: { type: String, required: true, default: 'Asia/Kolkata', trim: true },
    status: { type: String, enum: ['draft', 'published', 'cancelled'], default: 'draft', index: true },
    url: { type: String, default: '', maxlength: 2000 },
    publishedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

eventSchema.index({ organizerId: 1, createdAt: -1 });
eventSchema.index({ categoryId: 1, status: 1 });
eventSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Event', eventSchema);
