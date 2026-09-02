import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    // Who placed this order — must be logged in
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    // Denormalized for fast organizer dashboard queries (avoids joining through EventShow)
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
    },
    // The specific show/day this order is for
    showId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EventShow',
      required: [true, 'Show ID is required'],
    },
    // Snapshot of buyer info at purchase time — printed on ticket, used for email
    // Kept separate from User so it's preserved even if user updates their profile
    buyerName: {
      type: String,
      required: [true, 'Buyer name is required'],
      trim: true,
    },
    buyerEmail: {
      type: String,
      required: [true, 'Buyer email is required'],
      trim: true,
      lowercase: true,
    },
    // Ticket quantity — max 10 per order
    quantity: {
      type: Number,
      required: true,
      default: 1,
      min: [1, 'Must buy at least 1 ticket'],
      max: [10, 'Cannot buy more than 10 tickets per order'],
    },
    // Snapshot of Event.price at purchase time (paise) — preserved even if organizer changes price later
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative'],
    },
    // Always calculated server-side: quantity * unitPrice (paise). Never trusted from client.
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative'],
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'refunded', 'refunded_no_seats'],
      default: 'pending',
    },
    // Razorpay order ID — created before payment, used to link webhook to this Order
    razorpayOrderId: {
      type: String,
      default: null,
    },
    // Razorpay payment ID — set after successful payment via webhook
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    // Generated ONLY after payment confirmed — used as QR code data for ticket scanning
    ticketCode: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values (pending orders have no ticket yet)
      default: null,
    },
    // When payment was confirmed — historical, never changes even after refund
    paidAt: {
      type: Date,
      default: null,
    },
    // When user requested cancellation
    cancelledAt: {
      type: Date,
      default: null,
    },
    // Pending order expiry — after this time, the order is considered abandoned
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from creation
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookups
orderSchema.index({ razorpayOrderId: 1 }); // Webhook: find order by Razorpay order ID
orderSchema.index({ userId: 1 });           // User: my booking history
orderSchema.index({ eventId: 1 });          // Organizer: all orders for their event

const Order = mongoose.model('Order', orderSchema);
export default Order;