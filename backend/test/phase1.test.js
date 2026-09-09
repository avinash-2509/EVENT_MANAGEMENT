import assert from 'node:assert/strict';
import test from 'node:test';
import EventShow from '../models/EventShow.js';
import User from '../models/User.js';
import { hashToken, randomToken } from '../utils/auth.js';
import { slugify } from '../utils/validation.js';

test('public user shape accepts only the two supported roles', async () => {
  const valid = new User({
    username: 'test_user',
    email: 'test@example.com',
    passwordHash: 'hashed-value',
    role: 'user',
  });
  assert.equal(await valid.validate(), undefined);

  const invalid = new User({
    username: 'bad_user',
    email: 'bad@example.com',
    passwordHash: 'hashed-value',
    role: 'admin',
  });
  await assert.rejects(invalid.validate(), /role/);
});

test('show money and inventory fields require positive values', async () => {
  const show = new EventShow({
    eventId: '507f1f77bcf86cd799439011',
    startsAt: new Date(Date.now() + 60_000),
    endsAt: new Date(Date.now() + 120_000),
    pricePaise: 0,
    capacity: 0,
  });
  await assert.rejects(show.validate(), /pricePaise|capacity/);
});

test('security and slug utilities are deterministic where required', () => {
  const token = randomToken();
  assert.equal(token.length, 64);
  assert.equal(hashToken(token), hashToken(token));
  assert.equal(slugify('Live Music 2026!'), 'live-music-2026');
});
