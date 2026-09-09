import crypto from 'crypto';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Event from '../models/events.js';
import EventShow from '../models/EventShow.js';
import { cleanText, isObjectId, slugify } from '../utils/validation.js';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const serializeShow = (show) => ({
  id: show._id,
  eventId: show.eventId,
  startsAt: show.startsAt,
  endsAt: show.endsAt,
  pricePaise: show.pricePaise,
  currency: show.currency,
  capacity: show.capacity,
  reservedCount: show.reservedCount,
  soldCount: show.soldCount,
  availableCount: Math.max(0, show.capacity - show.reservedCount - show.soldCount),
  salesOpenAt: show.salesOpenAt,
  salesCloseAt: show.salesCloseAt,
  status: show.status,
});

const serializeEvent = (event, nextShow = null) => ({
  id: event._id,
  title: event.title,
  slug: event.slug,
  description: event.description,
  imageUrl: event.imageUrl,
  venue: event.venue,
  timezone: event.timezone,
  status: event.status,
  url: event.url,
  category: event.categoryId && event.categoryId.name ? {
    id: event.categoryId._id,
    name: event.categoryId.name,
    slug: event.categoryId.slug,
  } : { id: event.categoryId },
  organizer: event.organizerId && event.organizerId.username ? {
    id: event.organizerId._id,
    username: event.organizerId.username,
  } : { id: event.organizerId },
  nextShow: nextShow ? serializeShow(nextShow) : null,
  publishedAt: event.publishedAt,
  cancelledAt: event.cancelledAt,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
});

const validateTimezone = (timezone) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
};

const makeSlug = (title) => `${slugify(title)}-${crypto.randomBytes(3).toString('hex')}`;

const validateShowInput = (body, current = {}) => {
  const startsAt = body.startsAt === undefined ? current.startsAt : new Date(body.startsAt);
  const endsAt = body.endsAt === undefined ? current.endsAt : new Date(body.endsAt);
  const pricePaise = body.pricePaise === undefined ? current.pricePaise : Number(body.pricePaise);
  const capacity = body.capacity === undefined ? current.capacity : Number(body.capacity);
  const salesOpenAt = body.salesOpenAt === undefined
    ? current.salesOpenAt
    : body.salesOpenAt ? new Date(body.salesOpenAt) : null;
  const salesCloseAt = body.salesCloseAt === undefined
    ? current.salesCloseAt
    : body.salesCloseAt ? new Date(body.salesCloseAt) : null;

  if (!startsAt || Number.isNaN(startsAt.getTime()) || !endsAt || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return { error: 'Show end must be after its start.' };
  }
  if (!Number.isInteger(pricePaise) || pricePaise < 1) return { error: 'pricePaise must be a positive integer.' };
  if (!Number.isInteger(capacity) || capacity < 1) return { error: 'capacity must be a positive integer.' };
  if (salesOpenAt && Number.isNaN(salesOpenAt.getTime())) return { error: 'salesOpenAt is invalid.' };
  if (salesCloseAt && Number.isNaN(salesCloseAt.getTime())) return { error: 'salesCloseAt is invalid.' };
  if (salesOpenAt && salesCloseAt && salesCloseAt <= salesOpenAt) return { error: 'Sales close must be after sales open.' };
  if (salesCloseAt && salesCloseAt > startsAt) return { error: 'Sales must close no later than the show start.' };

  return { value: { startsAt, endsAt, pricePaise, capacity, salesOpenAt, salesCloseAt } };
};

const findOwnedEvent = (eventId, userId) => Event.findOne({ _id: eventId, organizerId: userId });

export const getEvents = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const filter = { status: 'published' };

    if (req.query.search) {
      const search = new RegExp(escapeRegex(String(req.query.search).trim().slice(0, 100)), 'i');
      filter.$or = [{ title: search }, { venue: search }, { description: search }];
    }

    if (req.query.category) {
      const category = isObjectId(req.query.category)
        ? await Category.findOne({ _id: req.query.category, isActive: true })
        : await Category.findOne({ slug: String(req.query.category).toLowerCase(), isActive: true });
      if (!category) return res.json({ data: [], meta: { total: 0, limit, offset } });
      filter.categoryId = category._id;
    }

    const [events, total] = await Promise.all([
      Event.find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate('categoryId', 'name slug')
        .populate('organizerId', 'username')
        .lean(),
      Event.countDocuments(filter),
    ]);

    const eventIds = events.map((event) => event._id);
    const shows = await EventShow.find({
      eventId: { $in: eventIds },
      status: 'scheduled',
      startsAt: { $gt: new Date() },
    }).sort({ startsAt: 1 }).lean();
    const nextByEvent = new Map();
    for (const show of shows) {
      const key = String(show.eventId);
      if (!nextByEvent.has(key)) nextByEvent.set(key, show);
    }

    return res.json({
      data: events.map((event) => serializeEvent(event, nextByEvent.get(String(event._id)))),
      meta: { total, limit, offset },
    });
  } catch {
    return res.status(500).json({ code: 'EVENT_LIST_FAILED', message: 'Unable to load events.' });
  }
};

export const getTrendingEvents = async (_req, res) => {
  const events = await Event.find({ status: 'published' })
    .sort({ publishedAt: -1 })
    .limit(6)
    .populate('categoryId', 'name slug')
    .populate('organizerId', 'username')
    .lean();
  return res.json({ data: events.map((event) => serializeEvent(event)) });
};

export const getOrganizerEvents = async (req, res) => {
  const events = await Event.find({ organizerId: req.user._id })
    .sort({ createdAt: -1 })
    .populate('categoryId', 'name slug')
    .lean();
  return res.json({ data: events.map((event) => serializeEvent(event)) });
};

export const getEventById = async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid event ID.' });
  const event = await Event.findById(req.params.id)
    .populate('categoryId', 'name slug')
    .populate('organizerId', 'username')
    .lean();
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found.' });

  const isOwner = req.user?.role === 'organizer' && String(event.organizerId?._id) === String(req.user._id);
  if (event.status !== 'published' && !isOwner) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found.' });
  }
  return res.json({ data: serializeEvent(event) });
};

export const createEvent = async (req, res) => {
  try {
    const title = cleanText(req.body.title, 160);
    const venue = cleanText(req.body.venue, 300);
    const timezone = cleanText(req.body.timezone || 'Asia/Kolkata', 100);
    if (!title || !venue || !isObjectId(req.body.categoryId) || !validateTimezone(timezone)) {
      return res.status(400).json({ code: 'INVALID_EVENT', message: 'title, venue, timezone and categoryId are required.' });
    }
    const category = await Category.findOne({ _id: req.body.categoryId, isActive: true });
    if (!category) return res.status(400).json({ code: 'INVALID_CATEGORY', message: 'Select an active category.' });

    const event = await Event.create({
      organizerId: req.user._id,
      categoryId: category._id,
      title,
      slug: makeSlug(title),
      description: cleanText(req.body.description, 10000),
      imageUrl: cleanText(req.body.imageUrl, 2000),
      venue,
      timezone,
      url: cleanText(req.body.url, 2000),
      status: 'draft',
    });
    await event.populate([{ path: 'categoryId', select: 'name slug' }, { path: 'organizerId', select: 'username' }]);
    return res.status(201).json({ data: serializeEvent(event.toObject()) });
  } catch (error) {
    return res.status(400).json({ code: 'EVENT_CREATE_FAILED', message: error.message || 'Unable to create event.' });
  }
};

export const updateEvent = async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid event ID.' });
  const event = await findOwnedEvent(req.params.id, req.user._id);
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found.' });
  if (event.status === 'cancelled') return res.status(409).json({ code: 'EVENT_CANCELLED', message: 'Cancelled events cannot be edited.' });

  if (req.body.categoryId !== undefined) {
    if (!isObjectId(req.body.categoryId) || !(await Category.exists({ _id: req.body.categoryId, isActive: true }))) {
      return res.status(400).json({ code: 'INVALID_CATEGORY', message: 'Select an active category.' });
    }
    event.categoryId = req.body.categoryId;
  }
  if (req.body.title !== undefined) event.title = cleanText(req.body.title, 160);
  if (req.body.description !== undefined) event.description = cleanText(req.body.description, 10000);
  if (req.body.venue !== undefined) event.venue = cleanText(req.body.venue, 300);
  if (req.body.url !== undefined) event.url = cleanText(req.body.url, 2000);
  if (req.body.timezone !== undefined) {
    if (!validateTimezone(req.body.timezone)) return res.status(400).json({ code: 'INVALID_TIMEZONE', message: 'Invalid timezone.' });
    event.timezone = cleanText(req.body.timezone, 100);
  }
  if (req.body.imageUrl !== undefined) event.imageUrl = cleanText(req.body.imageUrl, 2000);
  await event.save();
  await event.populate([{ path: 'categoryId', select: 'name slug' }, { path: 'organizerId', select: 'username' }]);
  return res.json({ data: serializeEvent(event.toObject()) });
};

export const publishEvent = async (req, res) => {
  const event = await findOwnedEvent(req.params.id, req.user._id);
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found.' });
  if (event.status !== 'draft') return res.status(409).json({ code: 'INVALID_STATE', message: 'Only draft events can be published.' });
  const hasShow = await EventShow.exists({ eventId: event._id, status: 'scheduled', startsAt: { $gt: new Date() } });
  if (!hasShow) return res.status(409).json({ code: 'SHOW_REQUIRED', message: 'Add a future show before publishing.' });
  event.status = 'published';
  event.publishedAt = new Date();
  await event.save();
  return res.json({ data: serializeEvent(event.toObject()) });
};

export const cancelEvent = async (req, res) => {
  const event = await findOwnedEvent(req.params.id, req.user._id);
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found.' });
  if (event.status === 'cancelled') return res.json({ data: serializeEvent(event.toObject()) });
  let hasAllocatedInventory = false;
  await mongoose.connection.transaction(async (session) => {
    hasAllocatedInventory = Boolean(await EventShow.exists({
      eventId: event._id,
      $or: [{ reservedCount: { $gt: 0 } }, { soldCount: { $gt: 0 } }],
    }).session(session));
    if (hasAllocatedInventory) return;
    await Event.updateOne({ _id: event._id }, { $set: { status: 'cancelled', cancelledAt: new Date() } }, { session });
    await EventShow.updateMany({ eventId: event._id }, { $set: { status: 'cancelled' } }, { session });
  });
  if (hasAllocatedInventory) {
    return res.status(409).json({ code: 'EVENT_HAS_BOOKINGS', message: 'Events with reservations or sold tickets cannot be cancelled.' });
  }
  const updated = await Event.findById(event._id).lean();
  return res.json({ data: serializeEvent(updated) });
};

export const deleteEvent = async (req, res) => {
  const event = await findOwnedEvent(req.params.id, req.user._id);
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found.' });
  if (event.status !== 'draft') return res.status(409).json({ code: 'DRAFT_ONLY', message: 'Only draft events can be deleted.' });
  await mongoose.connection.transaction(async (session) => {
    await EventShow.deleteMany({ eventId: event._id }, { session });
    await Event.deleteOne({ _id: event._id }, { session });
  });
  return res.sendStatus(204);
};

export const getRelatedEvents = async (req, res) => {
  const source = await Event.findOne({ _id: req.params.id, status: 'published' }).lean();
  if (!source) return res.json({ data: [] });
  const events = await Event.find({ _id: { $ne: source._id }, categoryId: source.categoryId, status: 'published' })
    .limit(4).populate('categoryId', 'name slug').populate('organizerId', 'username').lean();
  return res.json({ data: events.map((event) => serializeEvent(event)) });
};

export const getShows = async (req, res) => {
  const event = await Event.findById(req.params.id).lean();
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found.' });
  const isOwner = req.user?.role === 'organizer' && String(event.organizerId) === String(req.user._id);
  if (event.status !== 'published' && !isOwner) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found.' });
  const filter = { eventId: event._id };
  if (!isOwner) filter.status = 'scheduled';
  const shows = await EventShow.find(filter).sort({ startsAt: 1 }).lean();
  return res.json({ data: shows.map(serializeShow) });
};

export const createShow = async (req, res) => {
  const event = await findOwnedEvent(req.params.id, req.user._id);
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found.' });
  if (event.status === 'cancelled') return res.status(409).json({ code: 'EVENT_CANCELLED', message: 'Cannot add shows to a cancelled event.' });

  const parsed = validateShowInput(req.body);
  if (parsed.error) return res.status(400).json({ code: 'INVALID_SHOW', message: parsed.error });
  if (parsed.value.startsAt <= new Date()) return res.status(400).json({ code: 'INVALID_SHOW', message: 'Show must start in the future.' });

  const show = await EventShow.create({ eventId: event._id, ...parsed.value });
  return res.status(201).json({ data: serializeShow(show.toObject()) });
};

export const updateShow = async (req, res) => {
  const event = await findOwnedEvent(req.params.id, req.user._id);
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found.' });
  const show = await EventShow.findOne({ _id: req.params.showId, eventId: event._id });
  if (!show) return res.status(404).json({ code: 'NOT_FOUND', message: 'Show not found.' });
  if (show.status === 'cancelled') return res.status(409).json({ code: 'SHOW_CANCELLED', message: 'Cancelled shows cannot be edited.' });
  const parsed = validateShowInput(req.body, show);
  if (parsed.error) return res.status(400).json({ code: 'INVALID_SHOW', message: parsed.error });
  const filter = {
    _id: show._id,
    eventId: event._id,
    status: 'scheduled',
    $expr: { $lte: [{ $add: ['$reservedCount', '$soldCount'] }, parsed.value.capacity] },
  };
  if (req.body.startsAt !== undefined || req.body.endsAt !== undefined) {
    filter.reservedCount = 0;
    filter.soldCount = 0;
  }
  const updated = await EventShow.findOneAndUpdate(
    filter,
    { $set: parsed.value },
    { returnDocument: 'after', runValidators: true }
  );
  if (!updated) {
    return res.status(409).json({
      code: 'SHOW_HAS_BOOKINGS',
      message: 'The requested change conflicts with allocated ticket inventory.',
    });
  }
  return res.json({ data: serializeShow(updated.toObject()) });
};

export const cancelShow = async (req, res) => {
  const event = await findOwnedEvent(req.params.id, req.user._id);
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found.' });
  const existing = await EventShow.findOne({ _id: req.params.showId, eventId: event._id });
  if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Show not found.' });
  if (existing.reservedCount + existing.soldCount > 0) {
    return res.status(409).json({ code: 'SHOW_HAS_BOOKINGS', message: 'Shows with reservations or sold tickets cannot be cancelled.' });
  }
  const show = await EventShow.findOneAndUpdate(
    { _id: req.params.showId, eventId: event._id, reservedCount: 0, soldCount: 0 },
    { $set: { status: 'cancelled' } },
    { returnDocument: 'after' }
  );
  if (!show) return res.status(404).json({ code: 'NOT_FOUND', message: 'Show not found.' });
  return res.json({ data: serializeShow(show.toObject()) });
};
