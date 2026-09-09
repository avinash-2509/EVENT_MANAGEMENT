import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  useEffect(() => {
    Promise.all([apiFetch('/stats/dashboard'), apiFetch('/events/mine')]).then(async ([s, e]) => {
      setStats((await s.json()).data);
      setEvents((await e.json()).data || []);
    });
  }, []);
  return (
    <div className="container mx-auto px-4 py-12"><div className="flex justify-between"><h1 className="text-4xl font-black">Organizer dashboard</h1><Link href="/events/create"><Button>Create event</Button></Link></div>
      <div className="my-8 grid gap-4 md:grid-cols-4">{stats && Object.entries(stats).map(([key, value]) => <div key={key} className="rounded-xl border p-5"><p className="text-sm text-muted-foreground">{key}</p><p className="text-3xl font-black">{value}</p></div>)}</div>
      <h2 className="text-2xl font-black">My events</h2><div className="mt-4 divide-y rounded-xl border">{events.map((event) => <Link key={event.id} href={`/events/${event.id}`} className="flex justify-between p-4"><span>{event.title}</span><span>{event.status}</span></Link>)}</div>
    </div>
  );
}

