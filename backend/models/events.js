import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    imageUrl: {
      type: String,
      default: '',
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
    // Overall event date range — EventShow dates must fall within this window
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    // Price in paise (integer). Rs.500 = 50000. Same price for ALL shows of this event.
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [1, 'Price must be at least 1 paise'],
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'cancelled'],
      default: 'published',
    },
    url: {
      type: String,
      default: '',
    },
    // The organizer who created this event (must have role: 'organizer')
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'An event must belong to an organizer'],
    },
    // Proper ObjectId reference — enables Mongoose populate()
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
  },
  {
    timestamps: true,
  }
);

const Event = mongoose.model('Event', eventSchema);
export default Event;