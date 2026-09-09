import { useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';
import { Link } from 'wouter';
import { apiFetch } from '@/lib/api';

const money = (paise, currency = 'INR') => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency,
}).format(paise / 100);

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/orders')
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Unable to load orders.');
        setOrders(body.data || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <Ticket className="h-10 w-10 text-primary" />
        <div><h1 className="text-4xl font-black">My Orders</h1><p className="text-muted-foreground">Your bookings and payment status.</p></div>
      </div>
      {loading && <p>Loading orders...</p>}
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-destructive">{error}</p>}
      {!loading && !error && orders.length === 0 && (
        <div className="rounded-xl border p-8 text-center"><p className="text-muted-foreground">You have not booked any tickets yet.</p><Link href="/events" className="mt-3 inline-block font-bold text-primary underline">Browse events</Link></div>
      )}
      <div className="space-y-4">
        {orders.map((order) => (
          <article key={order._id} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{order.eventId?.title || 'Event booking'}</h2>
                <p className="text-sm text-muted-foreground">{order.showId?.startsAt ? new Date(order.showId.startsAt).toLocaleString('en-IN') : 'Show time unavailable'} · {order.quantity} ticket{order.quantity === 1 ? '' : 's'}</p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">{order.status.replaceAll('_', ' ')}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-black">{money(order.totalAmountPaise, order.currency)}</p>
              <div className="flex items-center gap-3">
                {order.status === 'paid' && <span className="text-sm font-semibold text-green-700">Tickets ready</span>}
                <Link href={`/orders/${order._id}`} className="text-sm font-bold text-primary underline">View details</Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
