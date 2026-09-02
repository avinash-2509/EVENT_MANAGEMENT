import mongoose from 'mongoose';

const eventShowSchema = new mongoose.Schema(
  {
    // Parent event this show belongs to
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
    },
    // The specific date of this show — must be within Event.startDate and Event.endDate
    date: {
      type: Date,
      required: [true, 'Show date is required'],
    },
    // 24-hour format e.g. "18:00"
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      trim: true,
    },
    endTime: {
      type: String,
      default: '',
      trim: true,
    },
    // Maximum seats available for this specific show
    totalCapacity: {
      type: Number,
      required: [true, 'Total capacity is required'],
      min: [1, 'Capacity must be at least 1'],
    },
    // Live counter — only incremented AFTER payment is confirmed via webhook
    // Atomic findOneAndUpdate ensures no overbooking
    ticketsSold: {
      type: Number,
      default: 0,
      min: [0, 'Tickets sold cannot be negative'],
    },
    status: {
      type: String,
      enum: ['available', 'sold_out', 'cancelled'],
      default: 'available',
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast show lookups by event
eventShowSchema.index({ eventId: 1 });

const EventShow = mongoose.model('EventShow', eventShowSchema);
export default EventShow;
