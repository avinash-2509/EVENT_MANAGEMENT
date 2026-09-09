import { Calendar, MapPin } from 'lucide-react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function EventCard({ event }) {
  const show = event.nextShow;
  return (
    <Link href={`/events/${event.id}`}>
      <Card className="h-full overflow-hidden transition hover:shadow-md">
        {event.imageUrl ? <img src={event.imageUrl} alt={event.title} className="aspect-video w-full object-cover" /> : <div className="grid aspect-video place-items-center bg-muted"><Calendar className="h-10 w-10 opacity-30" /></div>}
        <CardHeader><h3 className="text-xl font-bold">{event.title}</h3><p className="text-sm text-muted-foreground">{event.category?.name}</p></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="flex gap-2"><MapPin className="h-4 w-4" />{event.venue}</p>
          <p>{show ? new Date(show.startsAt).toLocaleString('en-IN', { timeZone: event.timezone }) : 'Show schedule coming soon'}</p>
          <p className="font-bold">{show ? `₹${(show.pricePaise / 100).toFixed(2)}` : 'Price unavailable'}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

