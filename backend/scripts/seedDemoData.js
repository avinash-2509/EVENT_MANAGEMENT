import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Event from '../models/events.js';
import EventShow from '../models/EventShow.js';
import User from '../models/User.js';
import { slugify } from '../utils/validation.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');
if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo data seeding is disabled in production.');
}

const demoPassword = 'DemoPass123!';
const now = new Date();
const futureDate = (days, hour = 18) => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const coverImage = ({ title, from, to }) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
      <rect width="1200" height="675" fill="url(#g)"/>
      <circle cx="1020" cy="100" r="210" fill="white" opacity=".12"/>
      <circle cx="170" cy="620" r="290" fill="white" opacity=".08"/>
      <path d="M0 510 C250 390 420 650 690 500 S1020 390 1200 470 V675 H0Z" fill="white" opacity=".1"/>
      <text x="72" y="505" fill="white" font-family="Arial, sans-serif" font-size="62" font-weight="700">${title}</text>
      <text x="76" y="565" fill="white" opacity=".8" font-family="Arial, sans-serif" font-size="28">EVENTLY DEMO</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const demos = [
  {
    title: 'Neon Nights Music Festival', category: 'Music', days: 7, hour: 18,
    venue: 'Palace Grounds, Bengaluru', pricePaise: 149900, capacity: 500,
    description: 'An open-air evening of indie bands, electronic artists, food stalls, and immersive light installations.',
    colors: ['#6d28d9', '#ec4899'],
  },
  {
    title: 'React India Community Meetup', category: 'Technology', days: 10, hour: 10,
    venue: 'Bangalore International Centre', pricePaise: 29900, capacity: 180,
    description: 'Practical talks, live coding, networking, and architecture discussions for frontend engineers and product builders.',
    colors: ['#0369a1', '#22d3ee'],
  },
  {
    title: 'Midnight Marathon 10K', category: 'Sports', days: 14, hour: 21,
    venue: 'Cubbon Park, Bengaluru', pricePaise: 79900, capacity: 750,
    description: 'A timed night run through central Bengaluru with hydration stations, music zones, medals, and post-run refreshments.',
    colors: ['#14532d', '#84cc16'],
  },
  {
    title: 'Indie Art and Design Bazaar', category: 'Arts', days: 18, hour: 11,
    venue: 'Karnataka Chitrakala Parishath', pricePaise: 19900, capacity: 300,
    description: 'Meet independent illustrators, ceramic artists, photographers, and designers at a full-day creative marketplace.',
    colors: ['#9a3412', '#f59e0b'],
  },
  {
    title: 'Startup Stories Live', category: 'Business', days: 21, hour: 17,
    venue: 'WeWork Galaxy, Residency Road', pricePaise: 49900, capacity: 220,
    description: 'Honest founder stories, product lessons, investor perspectives, and structured networking for early-stage teams.',
    colors: ['#1e3a8a', '#8b5cf6'],
  },
  {
    title: 'Bengaluru Street Food Carnival', category: 'Food', days: 25, hour: 12,
    venue: 'Freedom Park, Bengaluru', pricePaise: 9900, capacity: 1000,
    description: 'A celebration of regional street food, chef pop-ups, tasting counters, live music, and family-friendly activities.',
    colors: ['#9f1239', '#fb7185'],
  },
];

const upsertDemoUser = async ({ username, email, role, passwordHash }) => {
  let user = await User.findOne({ username });
  if (!user) {
    user = await User.create({ username, email, passwordHash, role, status: 'active' });
  } else {
    await User.collection.updateOne(
      { _id: user._id },
      { $set: { email, passwordHash, role, status: 'active', updatedAt: new Date() } }
    );
  }
  return User.findById(user._id);
};

await mongoose.connect(process.env.MONGO_URI);
try {
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const organizer = await upsertDemoUser({
    username: 'demo_organizer',
    email: 'organizer@evently.demo',
    role: 'organizer',
    passwordHash,
  });
  await upsertDemoUser({
    username: 'demo_attendee',
    email: 'attendee@evently.demo',
    role: 'user',
    passwordHash,
  });

  const categories = new Map();
  for (const name of [...new Set(demos.map((demo) => demo.category))]) {
    const slug = slugify(name);
    const category = await Category.findOneAndUpdate(
      { slug },
      { $set: { name, slug, isActive: true } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    categories.set(name, category);
  }

  let createdShows = 0;
  for (const demo of demos) {
    const slug = `demo-${slugify(demo.title)}`;
    const event = await Event.findOneAndUpdate(
      { slug },
      {
        $set: {
          organizerId: organizer._id,
          categoryId: categories.get(demo.category)._id,
          title: demo.title,
          slug,
          description: demo.description,
          imageUrl: coverImage({ title: demo.title, from: demo.colors[0], to: demo.colors[1] }),
          venue: demo.venue,
          timezone: 'Asia/Kolkata',
          status: 'published',
          publishedAt: now,
          cancelledAt: null,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    const startsAt = futureDate(demo.days, demo.hour);
    const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
    const existingShow = await EventShow.findOne({ eventId: event._id }).sort({ startsAt: 1 });
    if (!existingShow) {
      await EventShow.create({
        eventId: event._id,
        startsAt,
        endsAt,
        pricePaise: demo.pricePaise,
        currency: 'INR',
        capacity: demo.capacity,
        reservedCount: 0,
        soldCount: 0,
        salesOpenAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        salesCloseAt: new Date(startsAt.getTime() - 30 * 60 * 1000),
        status: 'scheduled',
      });
      createdShows += 1;
    } else if (existingShow.reservedCount === 0 && existingShow.soldCount === 0) {
      existingShow.set({
        startsAt,
        endsAt,
        pricePaise: demo.pricePaise,
        currency: 'INR',
        capacity: demo.capacity,
        salesOpenAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        salesCloseAt: new Date(startsAt.getTime() - 30 * 60 * 1000),
        status: 'scheduled',
      });
      await existingShow.save();
    }
  }

  console.log(`Seeded ${demos.length} published demo events and ${createdShows} new shows.`);
  console.log('Organizer: demo_organizer / DemoPass123!');
  console.log('Attendee: demo_attendee / DemoPass123!');
} finally {
  await mongoose.disconnect();
}
