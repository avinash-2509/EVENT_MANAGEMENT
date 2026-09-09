import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { EventCard } from '@/components/event-card';
import { Button } from '@/components/ui/button';
import { API_BASE_URL } from '@/lib/api';

export default function HomePage() {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/events?limit=6`).then((r) => r.json()).then((b) => setEvents(b.data || [])).catch(() => {});
  }, []);
  return (
    <>
      <section className="bg-muted/30 py-24 text-center"><div className="container mx-auto px-4"><h1 className="text-5xl font-black">Discover your next event</h1><p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">Browse organizer-created events and their scheduled shows.</p><Link href="/events"><Button size="lg" className="mt-8">Explore events</Button></Link></div></section>
      <section className="container mx-auto px-4 py-16"><h2 className="mb-8 text-3xl font-black">Latest events</h2><div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{events.map((event) => <EventCard key={event.id} event={event} />)}</div></section>
    </>
  );
}

