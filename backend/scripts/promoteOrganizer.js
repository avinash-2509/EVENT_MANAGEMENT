import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';

const identifier = String(process.argv[2] || '').trim().toLowerCase();
if (!identifier) throw new Error('Usage: npm run promote-organizer -- <username-or-email>');
if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

await mongoose.connect(process.env.MONGO_URI);
const result = await User.collection.updateOne(
  { $or: [{ username: identifier }, { email: identifier }] },
  { $set: { role: 'organizer', updatedAt: new Date() } }
);
if (result.matchedCount !== 1) throw new Error('User not found.');
console.log(`Promoted ${identifier} to organizer.`);
await mongoose.disconnect();

