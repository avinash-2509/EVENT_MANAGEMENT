const buckets = new Map();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 10 * 60 * 1000);
cleanupTimer.unref();

const fixedWindowLimiter = ({ name, windowMs, max, message }) => (req, res, next) => {
  const now = Date.now();
  const key = `${name}:${req.ip}`;
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, max - bucket.count);
  const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  res.set('RateLimit-Limit', String(max));
  res.set('RateLimit-Remaining', String(remaining));
  res.set('RateLimit-Reset', String(resetSeconds));

  if (bucket.count > max) {
    res.set('Retry-After', String(resetSeconds));
    return res.status(429).json({ code: 'RATE_LIMITED', message });
  }

  return next();
};

export const loginLimiter = fixedWindowLimiter({
  name: 'login',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Try again later.',
});

export const registerLimiter = fixedWindowLimiter({
  name: 'register',
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many registration attempts. Try again later.',
});
