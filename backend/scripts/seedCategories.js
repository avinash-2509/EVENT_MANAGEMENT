import 'dotenv/config';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import { slugify } from '../utils/validation.js';

const names = ['Music', 'Technology', 'Sports', 'Arts', 'Business', 'Food'];

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

await mongoose.connect(process.env.MONGO_URI);
for (const name of names) {
  await Category.updateOne(
    { slug: slugify(name) },
    { $set: { name, slug: slugify(name), isActive: true } },
    { upsert: true }
  );
}
console.log(`Seeded ${names.length} categories.`);
await mongoose.disconnect();

