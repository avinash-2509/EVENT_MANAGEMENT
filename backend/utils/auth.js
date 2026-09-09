import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export const hashToken = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const tokenHashesMatch = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};
export const randomToken = () => crypto.randomBytes(32).toString('hex');
export const signAccessToken = (userId, sessionId) =>
  jwt.sign({ sub: String(userId), sid: String(sessionId) }, process.env.JWT_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
  });

export const refreshCookieName = 'evently_refresh';
export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/api',
  maxAge: Number(process.env.REFRESH_TOKEN_DAYS || 7) * 24 * 60 * 60 * 1000,
});

export const refreshCookieClearOptions = () => {
  const { maxAge: _maxAge, ...options } = refreshCookieOptions();
  return options;
};
