import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, QrCode, RefreshCw, Ticket as TicketIcon } from 'lucide-react';
import { Link, useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

const money = (paise, currency = 'INR') => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency,
}).format(paise / 100);

const dateTime = (value, timezone) => value
  ? new Date(value).toLocaleString('en-IN', timezone ? { timeZone: timezone } : undefined)
  : 'Not available';

function TicketQrCard({ ticket }) {
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const loadQr = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(`/tickets/${ticket._id}/qr`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Unable to load this ticket QR code.');
      setQr(body.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(qr.qrPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Unable to copy the QR payload.');
    }
  };

  return (
    <article className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Ticket #{ticket.sequence}</p>
          <h3 className="font-mono text-lg font-black">{ticket.ticketNumber}</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${ticket.status === 'valid' ? 'bg-green-500/10 text-green-700' : 'bg-muted text-muted-foreground'}`}>
          {ticket.status}
        </span>
      </div>

      {!qr && (
        <Button className="mt-4" onClick={loadQr} disabled={loading || ticket.status !== 'valid'}>
          <QrCode />{loading ? 'Generating QR…' : 'Show QR ticket'}
        </Button>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {qr && (
        <div className="mt-5 grid gap-4 md:grid-cols-[220px_1fr] md:items-center">
          <img src={qr.qrDataUrl} alt={`QR code for ticket ${ticket.ticketNumber}`} className="w-full max-w-[220px] rounded-xl border bg-white p-2" />
          <div>
            <p className="font-bold">Present this QR code at entry</p>
            <p className="mt-1 text-sm text-muted-foreground">Each ticket can be checked in only once. Do not share this code publicly.</p>
            <Button className="mt-4" variant="outline" onClick={copyPayload}>
              {copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy payload'}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(`/orders/${id}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Unable to load this order.');
      setBundle(body.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="container mx-auto px-4 py-20">Loading order...</div>;
  if (error) return <div className="container mx-auto px-4 py-20 text-destructive">{error}</div>;

  const { order, payment, reservation, tickets = [] } = bundle;
  const timezone = order.eventId?.timezone;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <Link href="/orders" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-primary"><ArrowLeft className="h-4 w-4" />Back to orders</Link>
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Order {order._id}</p>
            <h1 className="mt-1 text-3xl font-black">{order.eventId?.title || 'Event booking'}</h1>
            <p className="mt-2 text-muted-foreground">{order.eventId?.venue}</p>
          </div>
          <span className="rounded-full bg-primary/10 px-4 py-2 font-bold text-primary">{order.status.replaceAll('_', ' ')}</span>
        </div>
        <dl className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-sm text-muted-foreground">Show</dt><dd className="font-semibold">{dateTime(order.showId?.startsAt, timezone)}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Quantity</dt><dd className="font-semibold">{order.quantity}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Total</dt><dd className="font-semibold">{money(order.totalAmountPaise, order.currency)}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Payment</dt><dd className="font-semibold">{payment?.status || 'not created'}</dd></div>
        </dl>
        {reservation?.status === 'active' && <p className="mt-5 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800">Payment reservation expires {dateTime(reservation.expiresAt)}.</p>}
        {order.status === 'pending_payment' && <Button className="mt-5" variant="outline" onClick={load}><RefreshCw />Refresh payment status</Button>}
      </div>

      <div className="mt-10 flex items-center gap-3"><TicketIcon className="h-7 w-7 text-primary" /><h2 className="text-2xl font-black">Tickets</h2></div>
      {tickets.length === 0 && (
        <p className="mt-4 rounded-xl border p-5 text-muted-foreground">
          {order.status === 'paid' ? 'Tickets are still being generated. Refresh this page shortly.' : 'Tickets appear here after payment is confirmed.'}
        </p>
      )}
      <div className="mt-4 space-y-4">{tickets.map((ticket) => <TicketQrCard key={ticket._id} ticket={ticket} />)}</div>
    </div>
  );
}
