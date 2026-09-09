import 'dotenv/config';
import mongoose from 'mongoose';
import { releaseExpiredReservations } from '../services/reservationService.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');
await mongoose.connect(process.env.MONGO_URI);
const result = await releaseExpiredReservations({ limit: process.argv[2] });
console.log(`Scanned ${result.scannedCount}; released ${result.releasedCount} expired reservations.`);
await mongoose.disconnect();
