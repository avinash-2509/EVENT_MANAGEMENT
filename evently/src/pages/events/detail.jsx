import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { apiFetch, getCurrentUser, restoreSession } from '@/lib/api';
import { CheckoutDismissedError, openRazorpayCheckout } from '@/lib/razorpay';
import { Button } from '@/components/ui/button';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const money = (paise) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
}).format(paise / 100);

export default function EventDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const [event, setEvent] = useState(null);
  const [shows, setShows] = useState([]);
  const [user, setUser] = useState(getCurrentUser());
  const [error, setError] = useState('');
  const [quantities, setQuantities] = useState({});
  const [busyShowId, setBusyShowId] = useState(null);
  const [submittedShowId, setSubmittedShowId] = useState(null);
  const [checkoutNotice, setCheckoutNotice] = useState(null);
  const bookingKeys = useRef(new Map());

  const load = async () => {
    try {
      const [eventResponse, showResponse] = await Promise.all([
        apiFetch(`/events/${id}`),
        apiFetch(`/events/${id}/shows`),
      ]);
      const eventBody = await eventResponse.json();
      const showBody = await showResponse.json();
      if (!eventResponse.ok) throw new Error(eventBody.message || 'Event not found');
      if (!showResponse.ok) throw new Error(showBody.message || 'Unable to load shows');
      setEvent(eventBody.data);
      setShows(showBody.data || []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    restoreSession().then(setUser);
    load();
  }, [id]);

  const cancel = async () => {
    if (!confirm('Cancel this event and all of its shows?')) return;
    const response = await apiFetch(`/events/${id}/cancel`, { method: 'POST' });
    const body = await response.json();
    if (!response.ok) return setError(body.message);
    setEvent(body.data);
  };

  const waitForWebhook = async (orderId) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await apiFetch(`/orders/${orderId}/payment-status`);
      const body = await response.json();
      if (response.ok) {
        const status = body.data?.order?.status;
        if (status === 'paid') return true;
        if (['payment_failed', 'expired', 'refund_required'].includes(status)) {
          throw new Error(body.data.order.failureCode || `Payment ended with status: ${status}`);
        }
      }
      await wait(1500);
    }
    return false;
  };

  const buyTickets = async (show) => {
    if (!user) {
      setLocation('/login');
      return;
    }
    if (user.role !== 'user') {
      setCheckoutNotice({ type: 'error', message: 'Use an attendee account to purchase tickets.' });
      return;
    }

    const quantity = Number(quantities[show.id] || 1);
    const attemptId = `${show.id}:${quantity}`;
    let idempotencyKey = bookingKeys.current.get(attemptId);
    if (!idempotencyKey) {
      const uniquePart = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      idempotencyKey = `checkout:${uniquePart}`;
      bookingKeys.current.set(attemptId, idempotencyKey);
    }

    setBusyShowId(show.id);
    setCheckoutNotice(null);
    try {
      const bookingResponse = await apiFetch('/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ showId: show.id, quantity }),
      });
      const bookingBody = await bookingResponse.json();
      if (!bookingResponse.ok) throw new Error(bookingBody.message || 'Unable to start checkout.');

      const { checkout, order } = bookingBody.data;
      if (!checkout || checkout.provider !== 'razorpay') {
        throw new Error('Razorpay Checkout is not available for this order.');
      }

      const paymentResult = await openRazorpayCheckout({
        checkout,
        event,
        user,
        quantity,
        onFailure: (message) => setCheckoutNotice({
          type: 'error',
          message: `${message} You can retry inside the checkout window.`,
        }),
      });
      setCheckoutNotice({ type: 'info', message: 'Payment received. Verifying its signature securely…' });

      const verifyResponse = await apiFetch('/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order._id,
          razorpay_payment_id: paymentResult.razorpay_payment_id,
          razorpay_order_id: paymentResult.razorpay_order_id,
          razorpay_signature: paymentResult.razorpay_signature,
        }),
      });
      const verifyBody = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyBody.data?.verified) {
        throw new Error(verifyBody.message || 'Payment signature verification failed.');
      }

      bookingKeys.current.delete(attemptId);
      setSubmittedShowId(show.id);
      setCheckoutNotice({ type: 'info', message: 'Payment authenticated. Waiting for Razorpay webhook confirmation…' });
      const paid = await waitForWebhook(order._id);
      if (paid) {
        setCheckoutNotice({ type: 'success', message: 'Payment confirmed. Your tickets are ready in My Orders.' });
        await load();
      } else {
        setCheckoutNotice({ type: 'info', message: 'Payment is authenticated and still processing. Check My Orders shortly.' });
      }
    } catch (err) {
      if (err instanceof CheckoutDismissedError) {
        setCheckoutNotice({ type: 'info', message: 'Checkout cancelled. Your temporary reservation will expire automatically.' });
      } else {
        setCheckoutNotice({ type: 'error', message: err.message || 'Unable to complete payment.' });
      }
    } finally {
      setBusyShowId(null);
    }
  };

  if (error) return <div className="container mx-auto px-4 py-20 text-destructive">{error}</div>;
  if (!event) return <div className="container mx-auto px-4 py-20">Loading event...</div>;
  const owner = user?.role === 'organizer' && user.id === event.organizer?.id;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-12">
      {event.imageUrl && <img src={event.imageUrl} alt={event.title} className="mb-8 aspect-[21/9] w-full rounded-2xl object-cover" />}
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="font-semibold text-primary">{event.category?.name}</p>
          <h1 className="text-5xl font-black">{event.title}</h1>
          <p className="mt-2 text-muted-foreground">By {event.organizer?.username} · {event.status}</p>
        </div>
        {owner && (
          <div className="flex gap-2">
            <Link href={`/events/${id}/edit`}><Button variant="outline">Edit</Button></Link>
            {event.status !== 'cancelled' && <Button variant="destructive" onClick={cancel}>Cancel event</Button>}
          </div>
        )}
      </div>
      <p className="mt-8 whitespace-pre-wrap text-lg">{event.description}</p>
      <p className="mt-6 font-semibold">Venue: {event.venue}</p>
      <h2 className="mt-10 text-2xl font-black">Shows</h2>
      {checkoutNotice && (
        <div className={`mt-4 rounded-lg p-3 ${checkoutNotice.type === 'error' ? 'bg-destructive/10 text-destructive' : checkoutNotice.type === 'success' ? 'bg-green-500/10 text-green-700' : 'bg-primary/10 text-primary'}`}>
          {checkoutNotice.message}
          {checkoutNotice.type !== 'error' && submittedShowId && <Link href="/orders" className="ml-2 font-bold underline">View My Orders</Link>}
        </div>
      )}
      <div className="mt-4 space-y-3">
        {shows.map((show) => {
          const maxQuantity = Math.min(10, show.availableCount);
          const unavailable = show.status !== 'scheduled' || maxQuantity < 1;
          const busy = busyShowId === show.id;
          const submitted = submittedShowId === show.id;
          return (
            <div key={show.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5">
              <div>
                <p className="font-bold">{new Date(show.startsAt).toLocaleString('en-IN', { timeZone: event.timezone })}</p>
                <p className="text-sm text-muted-foreground">{show.availableCount} of {show.capacity} currently available</p>
              </div>
              <div className="flex flex-wrap items-end justify-end gap-3 text-right">
                <label className="text-sm">
                  Quantity
                  <input
                    type="number"
                    min="1"
                    max={Math.max(1, maxQuantity)}
                    step="1"
                    value={quantities[show.id] || 1}
                    onChange={(changeEvent) => {
                      const next = Math.min(Math.max(Number(changeEvent.target.value) || 1, 1), Math.max(1, maxQuantity));
                      setQuantities((current) => ({ ...current, [show.id]: next }));
                    }}
                    disabled={unavailable || Boolean(busyShowId) || submitted}
                    className="mt-1 block w-20 rounded border px-3 py-2"
                  />
                </label>
                <div>
                  <p className="mb-1 font-black">{money(show.pricePaise)} each</p>
                  <Button
                    onClick={() => buyTickets(show)}
                    disabled={unavailable || Boolean(busyShowId) || user?.role === 'organizer' || submitted}
                  >
                    {busy ? 'Opening checkout…' : submitted ? 'Payment submitted' : unavailable ? 'Sold out' : user ? 'Buy tickets' : 'Sign in to buy'}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {shows.length === 0 && <p className="mt-4 text-muted-foreground">No shows scheduled.</p>}
    </div>
  );
}
