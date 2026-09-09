import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, ImageUp, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

const readerId = 'evently-ticket-reader';
const createScanner = async () => {
  const { Html5Qrcode } = await import('html5-qrcode');
  return new Html5Qrcode(readerId, false);
};

export default function CheckInPage() {
  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [payload, setPayload] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {
      // Camera teardown errors should not block another scan.
    }
    try { scanner.clear(); } catch { /* Reader may already be empty. */ }
    setScanning(false);
  }, []);

  useEffect(() => () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    if (scanner.isScanning) {
      scanner.stop().catch(() => {}).finally(() => {
        try { scanner.clear(); } catch { /* Reader may already be empty. */ }
      });
    } else {
      try { scanner.clear(); } catch { /* Reader may already be empty. */ }
    }
  }, []);

  const checkIn = useCallback(async (qrPayload) => {
    const value = String(qrPayload || '').trim();
    if (!value) {
      setResult({ type: 'error', message: 'Scan a ticket or paste its QR payload first.' });
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      const response = await apiFetch('/tickets/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrPayload: value }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Ticket check-in failed.');
      setResult({
        type: 'success',
        message: 'Check-in successful.',
        ticket: body.data,
      });
      setPayload('');
    } catch (error) {
      setResult({ type: 'error', message: error.message || 'Ticket check-in failed.' });
    } finally {
      setSubmitting(false);
    }
  }, []);

  const startScanner = async () => {
    setResult(null);
    processingRef.current = false;
    await stopScanner();
    try {
      const scanner = await createScanner();
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (processingRef.current) return;
          processingRef.current = true;
          setPayload(decodedText);
          await stopScanner();
          await checkIn(decodedText);
          processingRef.current = false;
        },
        () => {}
      );
      setScanning(true);
    } catch (error) {
      await stopScanner();
      setResult({ type: 'error', message: error?.message || String(error) || 'Unable to start the camera.' });
    }
  };

  const scanImage = async (file) => {
    if (!file) return;
    setResult(null);
    await stopScanner();
    try {
      const scanner = await createScanner();
      scannerRef.current = scanner;
      const decodedText = await scanner.scanFile(file, true);
      setPayload(decodedText);
      scanner.clear();
      scannerRef.current = null;
      await checkIn(decodedText);
    } catch (error) {
      await stopScanner();
      setResult({ type: 'error', message: error?.message || String(error) || 'No valid QR code was found in that image.' });
    }
  };

  const reset = () => {
    setPayload('');
    setResult(null);
    processingRef.current = false;
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <ScanLine className="h-10 w-10 text-primary" />
        <div><h1 className="text-4xl font-black">Ticket Check-in</h1><p className="text-muted-foreground">Scan tickets for events you organize.</p></div>
      </div>

      {result && (
        <div className={`mb-6 rounded-xl border p-5 ${result.type === 'success' ? 'border-green-500/30 bg-green-500/10 text-green-800' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
          <div className="flex items-center gap-2 font-black">{result.type === 'success' && <CheckCircle2 />}{result.message}</div>
          {result.ticket && <p className="mt-2 font-mono text-sm">{result.ticket.ticketNumber} · checked in {new Date(result.ticket.checkedInAt).toLocaleString('en-IN')}</p>}
          <Button className="mt-4" variant="outline" onClick={reset}>Scan another ticket</Button>
        </div>
      )}

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-black">Camera scanner</h2>
        <p className="mt-1 text-sm text-muted-foreground">Camera access works on HTTPS deployments and localhost. Permission is requested only when you start scanning.</p>
        <div id={readerId} className="mx-auto mt-5 max-w-xl overflow-hidden rounded-xl" />
        <div className="mt-5 flex flex-wrap gap-3">
          {!scanning ? <Button onClick={startScanner} disabled={submitting}><Camera />Start camera</Button> : <Button onClick={stopScanner} variant="outline"><CameraOff />Stop camera</Button>}
          <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium">
            <ImageUp className="h-4 w-4" />Scan QR image
            <input type="file" accept="image/*" className="sr-only" onChange={(event) => { scanImage(event.target.files?.[0]); event.target.value = ''; }} disabled={scanning || submitting} />
          </label>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-black">Manual fallback</h2>
        <p className="mt-1 text-sm text-muted-foreground">Paste the signed payload copied from the attendee's ticket.</p>
        <textarea className="mt-4 min-h-28 w-full rounded-lg border p-3 font-mono text-sm" value={payload} onChange={(event) => setPayload(event.target.value)} placeholder="v1.ticketId.publicCode.signature" />
        <Button className="mt-3" onClick={() => checkIn(payload)} disabled={submitting || !payload.trim()}>{submitting ? 'Checking in…' : 'Check in ticket'}</Button>
      </section>
    </div>
  );
}
