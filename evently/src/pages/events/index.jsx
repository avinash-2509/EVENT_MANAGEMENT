import { useEffect, useState } from 'react';
import { EventCard } from '@/components/event-card';
import { API_BASE_URL } from '@/lib/api';

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/categories`).then((r) => r.json()).then((b) => setCategories(b.data || []));
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      try {
        const response = await fetch(`${API_BASE_URL}/events?${params}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        setEvents(body.data || []);
        setError('');
      } catch (err) {
        setError(err.message || 'Unable to load events');
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, category]);

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-black">Events</h1>
      <div className="my-6 grid gap-3 md:grid-cols-[1fr_240px]"><input className="rounded border p-3" placeholder="Search events or venues" value={search} onChange={(e) => setSearch(e.target.value)} /><select className="rounded border p-3" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div>
      {error && <p className="text-destructive">{error}</p>}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{events.map((event) => <EventCard key={event.id} event={event} />)}</div>
      {!error && events.length === 0 && <p className="py-16 text-center text-muted-foreground">No published events found.</p>}
    </div>
  );
}

