import { releaseExpiredReservations } from '../services/reservationService.js';

export const startReservationExpiryWorker = () => {
  const intervalMs = Math.min(Math.max(Number(process.env.RESERVATION_SWEEP_MS || 30000), 5000), 300000);
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await releaseExpiredReservations();
    } catch (error) {
      console.error('Reservation expiry sweep failed:', error.message);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
};
