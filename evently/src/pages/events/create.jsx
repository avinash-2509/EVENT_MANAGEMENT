import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { apiFetch, API_BASE_URL } from '@/lib/api';

const initial = {
  title: '', description: '', venue: '', timezone: 'Asia/Kolkata', categoryId: '', url: '',
  startsAt: '', endsAt: '', priceRupees: '', capacity: '',
};

export default function EventFormPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState(initial);
  const [categories, setCategories] = useState([]);
  const [showId, setShowId] = useState(null);
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/categories`).then((r) => r.json()).then((b) => setCategories(b.data || []));
    if (!id) return;
    Promise.all([apiFetch(`/events/${id}`), apiFetch(`/events/${id}/shows`)])
      .then(async ([eventResponse, showResponse]) => {
        const eventBody = await eventResponse.json();
        const showBody = await showResponse.json();
        if (!eventResponse.ok) throw new Error(eventBody.message);
        const event = eventBody.data;
        const show = showBody.data?.[0];
        setShowId(show?.id || null);
        setForm({
          title: event.title || '', description: event.description || '', venue: event.venue || '',
          timezone: event.timezone || 'Asia/Kolkata', categoryId: event.category?.id || '', url: event.url || '',
          startsAt: show?.startsAt ? new Date(show.startsAt).toISOString().slice(0, 16) : '',
          endsAt: show?.endsAt ? new Date(show.endsAt).toISOString().slice(0, 16) : '',
          priceRupees: show?.pricePaise ? String(show.pricePaise / 100) : '',
          capacity: show?.capacity ? String(show.capacity) : '',
        });
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const eventData = new FormData();
      ['title', 'description', 'venue', 'timezone', 'categoryId', 'url'].forEach((key) => eventData.append(key, form[key]));
      if (image) eventData.append('imageUrl', image);
      const eventResponse = await apiFetch(id ? `/events/${id}` : '/events', {
        method: id ? 'PATCH' : 'POST',
        body: eventData,
      });
      const eventBody = await eventResponse.json();
      if (!eventResponse.ok) throw new Error(eventBody.message || 'Unable to save event');
      const eventId = eventBody.data.id;

      const showPayload = {
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        pricePaise: Math.round(Number(form.priceRupees) * 100),
        capacity: Number(form.capacity),
      };
      const showResponse = await apiFetch(
        showId ? `/events/${eventId}/shows/${showId}` : `/events/${eventId}/shows`,
        { method: showId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(showPayload) }
      );
      const showBody = await showResponse.json();
      if (!showResponse.ok) throw new Error(showBody.message || 'Event saved as draft, but show could not be saved');

      if (!id) {
        const publishResponse = await apiFetch(`/events/${eventId}/publish`, { method: 'POST' });
        const publishBody = await publishResponse.json();
        if (!publishResponse.ok) throw new Error(publishBody.message || 'Event saved as draft but could not be published');
      }
      setLocation(`/events/${eventId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-4xl font-black">{id ? 'Edit event' : 'Create event'}</h1>
      <p className="mb-8 text-muted-foreground">One general-admission show is supported in the Phase 1 interface.</p>
      {error && <p className="mb-5 rounded-lg bg-destructive/10 p-3 text-destructive">{error}</p>}
      <form onSubmit={submit} className="grid gap-5 rounded-2xl border bg-card p-6">
        <label>Title<input name="title" className="mt-2 w-full rounded border p-3" value={form.title} onChange={change} required /></label>
        <label>Description<textarea name="description" className="mt-2 w-full rounded border p-3" value={form.description} onChange={change} rows={5} /></label>
        <label>Category<select name="categoryId" className="mt-2 w-full rounded border p-3" value={form.categoryId} onChange={change} required><option value="">Select category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Venue<input name="venue" className="mt-2 w-full rounded border p-3" value={form.venue} onChange={change} required /></label>
        <label>Timezone<input name="timezone" className="mt-2 w-full rounded border p-3" value={form.timezone} onChange={change} required /></label>
        <div className="grid gap-5 md:grid-cols-2"><label>Starts at<input name="startsAt" type="datetime-local" className="mt-2 w-full rounded border p-3" value={form.startsAt} onChange={change} required /></label><label>Ends at<input name="endsAt" type="datetime-local" className="mt-2 w-full rounded border p-3" value={form.endsAt} onChange={change} required /></label></div>
        <div className="grid gap-5 md:grid-cols-2"><label>Price (₹)<input name="priceRupees" type="number" min="0.01" step="0.01" className="mt-2 w-full rounded border p-3" value={form.priceRupees} onChange={change} required /></label><label>Capacity<input name="capacity" type="number" min="1" step="1" className="mt-2 w-full rounded border p-3" value={form.capacity} onChange={change} required /></label></div>
        <label>External URL<input name="url" type="url" className="mt-2 w-full rounded border p-3" value={form.url} onChange={change} /></label>
        <label>Cover image<input type="file" accept="image/*" className="mt-2 block" onChange={(e) => setImage(e.target.files?.[0] || null)} /></label>
        <button className="rounded bg-primary p-3 font-bold text-primary-foreground" disabled={saving}>{saving ? 'Saving...' : id ? 'Save changes' : 'Create and publish'}</button>
      </form>
    </div>
  );
}

