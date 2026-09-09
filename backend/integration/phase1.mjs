import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Event from '../models/events.js';
import EventShow from '../models/EventShow.js';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';

const apiBase = process.env.API_TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5000}/api/v1`;
const runId = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
const password = 'Phase1-Test-Password-42!';

const request = async (path, { token, cookie, method = 'GET', body } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  return { response, payload };
};

const login = async (username) => {
  const result = await request('/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  const setCookie = result.response.headers.get('set-cookie');
  assert.ok(setCookie, 'Login must set a refresh cookie.');
  return {
    token: result.payload.data.accessToken,
    cookie: setCookie.split(';')[0],
    user: result.payload.data.user,
  };
};

test('Phase 1 HTTP routes and authorization work against the configured database', async () => {
  const usernames = {
    user: `phase1_user_${runId}`,
    organizerA: `phase1_orga_${runId}`,
    organizerB: `phase1_orgb_${runId}`,
  };
  const emails = Object.fromEntries(
    Object.entries(usernames).map(([key, username]) => [key, `${username}@example.test`])
  );
  const createdUserIds = [];
  const createdEventIds = [];
  let categoryId;
  let temporaryCategoryId;

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const live = await request('/health/live');
    assert.equal(live.response.status, 200);
    const ready = await request('/health/ready');
    assert.equal(ready.response.status, 200);

    for (const key of Object.keys(usernames)) {
      const registration = await request('/auth/register', {
        method: 'POST',
        body: { username: usernames[key], email: emails[key], password, role: 'organizer' },
      });
      assert.equal(registration.response.status, 201, JSON.stringify(registration.payload));
      assert.equal(registration.payload.data.role, 'user', 'Public registration must never grant organizer access.');
      createdUserIds.push(registration.payload.data.id);
    }

    await User.collection.updateMany(
      { _id: { $in: createdUserIds.slice(1).map((id) => new mongoose.Types.ObjectId(id)) } },
      { $set: { role: 'organizer' } }
    );

    const userSession = await login(usernames.user);
    const organizerA = await login(usernames.organizerA);
    const organizerB = await login(usernames.organizerB);
    assert.equal(organizerA.user.role, 'organizer');

    const me = await request('/auth/me', { token: organizerA.token });
    assert.equal(me.response.status, 200);
    assert.equal(me.payload.data.username, usernames.organizerA);

    const categories = await request('/categories');
    assert.equal(categories.response.status, 200);
    let category = categories.payload.data[0];
    if (!category) {
      const temporaryCategory = await Category.create({
        name: `Phase 1 Test ${runId}`,
        slug: `phase-1-test-${runId}`,
        isActive: true,
      });
      temporaryCategoryId = temporaryCategory._id;
      category = { id: temporaryCategory._id };
    }
    categoryId = String(category.id || category._id);

    const forbiddenCreate = await request('/events', {
      method: 'POST',
      token: userSession.token,
      body: { title: 'Forbidden', venue: 'Nowhere', categoryId },
    });
    assert.equal(forbiddenCreate.response.status, 403);

    const createEvent = await request('/events', {
      method: 'POST',
      token: organizerA.token,
      body: {
        title: `Phase 1 Event ${runId}`,
        description: 'Temporary integration-test event',
        venue: 'Integration Test Venue',
        timezone: 'Asia/Kolkata',
        categoryId,
        imageUrl: 'https://example.test/event.jpg',
      },
    });
    assert.equal(createEvent.response.status, 201, JSON.stringify(createEvent.payload));
    const eventId = String(createEvent.payload.data.id);
    createdEventIds.push(eventId);
    assert.equal(createEvent.payload.data.status, 'draft');

    const otherOrganizerEdit = await request(`/events/${eventId}`, {
      method: 'PATCH',
      token: organizerB.token,
      body: { title: 'Ownership bypass attempt' },
    });
    assert.equal(otherOrganizerEdit.response.status, 404);

    const ownEdit = await request(`/events/${eventId}`, {
      method: 'PATCH',
      token: organizerA.token,
      body: { description: 'Updated by the owning organizer' },
    });
    assert.equal(ownEdit.response.status, 200, JSON.stringify(ownEdit.payload));
    assert.equal(ownEdit.payload.data.description, 'Updated by the owning organizer');

    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
    const createShow = await request(`/events/${eventId}/shows`, {
      method: 'POST',
      token: organizerA.token,
      body: { startsAt, endsAt, pricePaise: 125000, capacity: 100 },
    });
    assert.equal(createShow.response.status, 201, JSON.stringify(createShow.payload));
    assert.equal(createShow.payload.data.availableCount, 100);
    const showId = String(createShow.payload.data.id);

    const updateShow = await request(`/events/${eventId}/shows/${showId}`, {
      method: 'PATCH',
      token: organizerA.token,
      body: { pricePaise: 130000, capacity: 120 },
    });
    assert.equal(updateShow.response.status, 200, JSON.stringify(updateShow.payload));
    assert.equal(updateShow.payload.data.pricePaise, 130000);
    assert.equal(updateShow.payload.data.availableCount, 120);

    const secondShow = await request(`/events/${eventId}/shows`, {
      method: 'POST',
      token: organizerA.token,
      body: {
        startsAt: new Date(startsAt.getTime() + 24 * 60 * 60 * 1000),
        endsAt: new Date(endsAt.getTime() + 24 * 60 * 60 * 1000),
        pricePaise: 90000,
        capacity: 50,
      },
    });
    assert.equal(secondShow.response.status, 201, JSON.stringify(secondShow.payload));
    const cancelShow = await request(`/events/${eventId}/shows/${secondShow.payload.data.id}/cancel`, {
      method: 'POST',
      token: organizerA.token,
    });
    assert.equal(cancelShow.response.status, 200, JSON.stringify(cancelShow.payload));
    assert.equal(cancelShow.payload.data.status, 'cancelled');

    const publish = await request(`/events/${eventId}/publish`, {
      method: 'POST',
      token: organizerA.token,
    });
    assert.equal(publish.response.status, 200, JSON.stringify(publish.payload));
    assert.equal(publish.payload.data.status, 'published');

    const publicList = await request(`/events?search=${encodeURIComponent(`Phase 1 Event ${runId}`)}`);
    assert.equal(publicList.response.status, 200);
    assert.ok(publicList.payload.data.some((event) => String(event.id) === eventId));
    const trending = await request('/events/trending');
    assert.equal(trending.response.status, 200);

    const publicDetail = await request(`/events/${eventId}`);
    assert.equal(publicDetail.response.status, 200);
    const publicShows = await request(`/events/${eventId}/shows`);
    assert.equal(publicShows.response.status, 200);
    assert.equal(publicShows.payload.data.length, 1);
    const related = await request(`/events/${eventId}/related`);
    assert.equal(related.response.status, 200);

    const ownEvents = await request('/events/mine', { token: organizerA.token });
    assert.equal(ownEvents.response.status, 200);
    assert.ok(ownEvents.payload.data.some((event) => String(event.id) === eventId));
    const stats = await request('/stats/dashboard', { token: organizerA.token });
    assert.equal(stats.response.status, 200, JSON.stringify(stats.payload));
    const categoryStats = await request('/stats/categories', { token: organizerA.token });
    assert.equal(categoryStats.response.status, 200, JSON.stringify(categoryStats.payload));
    const userMetrics = await request('/internal/metrics', { token: userSession.token });
    assert.equal(userMetrics.response.status, 403);
    const organizerMetrics = await request('/internal/metrics', { token: organizerA.token });
    assert.equal(organizerMetrics.response.status, 200, JSON.stringify(organizerMetrics.payload));

    const draft = await request('/events', {
      method: 'POST',
      token: organizerA.token,
      body: { title: `Disposable Draft ${runId}`, venue: 'Test Venue', timezone: 'Asia/Kolkata', categoryId },
    });
    assert.equal(draft.response.status, 201, JSON.stringify(draft.payload));
    const draftId = String(draft.payload.data.id);
    createdEventIds.push(draftId);
    const removeDraft = await request(`/events/${draftId}`, { method: 'DELETE', token: organizerA.token });
    assert.equal(removeDraft.response.status, 204);

    const refreshed = await request('/auth/refresh', { method: 'POST', cookie: organizerA.cookie });
    assert.equal(refreshed.response.status, 200, JSON.stringify(refreshed.payload));
    const rotatedCookie = refreshed.response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(rotatedCookie);

    const cancel = await request(`/events/${eventId}/cancel`, {
      method: 'POST',
      token: refreshed.payload.data.accessToken,
    });
    assert.equal(cancel.response.status, 200, JSON.stringify(cancel.payload));
    const hiddenAfterCancel = await request(`/events/${eventId}`);
    assert.equal(hiddenAfterCancel.response.status, 404);

    const logout = await request('/auth/logout', { method: 'POST', cookie: rotatedCookie });
    assert.equal(logout.response.status, 204);
    const refreshAfterLogout = await request('/auth/refresh', { method: 'POST', cookie: rotatedCookie });
    assert.equal(refreshAfterLogout.response.status, 401);
    const accessAfterLogout = await request('/auth/me', { token: refreshed.payload.data.accessToken });
    assert.equal(accessAfterLogout.response.status, 401);

    const invalidId = await request('/events/not-an-object-id');
    assert.equal(invalidId.response.status, 400);
    const categoryWrite = await request('/categories', { method: 'POST', token: organizerA.token, body: { name: 'Nope' } });
    assert.equal(categoryWrite.response.status, 404);
    const emptyOrders = await request('/orders', { token: userSession.token });
    assert.equal(emptyOrders.response.status, 200);
    assert.equal(emptyOrders.payload.data.length, 0);
  } finally {
    const eventObjectIds = createdEventIds.map((id) => new mongoose.Types.ObjectId(id));
    if (eventObjectIds.length) {
      await EventShow.deleteMany({ eventId: { $in: eventObjectIds } });
      await Event.deleteMany({ _id: { $in: eventObjectIds } });
    }
    const userObjectIds = createdUserIds.map((id) => new mongoose.Types.ObjectId(id));
    if (userObjectIds.length) {
      await UserSession.deleteMany({ userId: { $in: userObjectIds } });
      await User.deleteMany({ _id: { $in: userObjectIds } });
    }
    if (temporaryCategoryId) await Category.deleteOne({ _id: temporaryCategoryId });
    await mongoose.disconnect();
  }
});
