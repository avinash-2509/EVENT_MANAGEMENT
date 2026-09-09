import mongoose from 'mongoose';

export const isObjectId = (value) => mongoose.isValidObjectId(value);
export const slugify = (value) =>
  String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
export const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

