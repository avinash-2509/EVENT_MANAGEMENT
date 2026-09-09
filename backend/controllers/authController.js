import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';
import {
  hashToken,
  randomToken,
  refreshCookieClearOptions,
  refreshCookieName,
  refreshCookieOptions,
  signAccessToken,
  tokenHashesMatch,
} from '../utils/auth.js';

const publicUser = (user) => ({
  id: user._id,
  username: user.username,
  email: user.email,
  role: user.role,
  status: user.status,
});

const setRefreshCookie = (res, sessionId, secret) => {
  res.cookie(refreshCookieName, `${sessionId}.${secret}`, refreshCookieOptions());
};

export const register = async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!/^[a-z0-9_]{3,40}$/.test(username)) {
      return res.status(400).json({ code: 'INVALID_USERNAME', message: 'Username must be 3-40 letters, numbers, or underscores.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ code: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ code: 'INVALID_PASSWORD', message: 'Password must be 8-128 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email, passwordHash, role: 'user' });
    return res.status(201).json({ data: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ code: 'ACCOUNT_EXISTS', message: 'Username or email is already registered.' });
    }
    return res.status(500).json({ code: 'REGISTRATION_FAILED', message: 'Unable to create account.' });
  }
};

export const login = async (req, res) => {
  try {
    const identifier = String(req.body.username || req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] }).select('+passwordHash');

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ code: 'ACCOUNT_SUSPENDED', message: 'This account is suspended.' });
    }

    const secret = randomToken();
    const days = Number(process.env.REFRESH_TOKEN_DAYS || 7);
    const session = await UserSession.create({
      userId: user._id,
      refreshTokenHash: hashToken(secret),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      userAgent: String(req.get('user-agent') || '').slice(0, 500),
    });

    setRefreshCookie(res, session._id, secret);
    return res.json({ data: { accessToken: signAccessToken(user._id, session._id), user: publicUser(user) } });
  } catch {
    return res.status(500).json({ code: 'LOGIN_FAILED', message: 'Unable to sign in.' });
  }
};

export const refresh = async (req, res) => {
  const raw = req.cookies?.[refreshCookieName];
  const [sessionId, secret] = String(raw || '').split('.');
  if (!sessionId || !secret || !mongoose.isValidObjectId(sessionId)) {
    return res.status(401).json({ code: 'INVALID_SESSION', message: 'Session is invalid or expired.' });
  }

  const session = await UserSession.findOne({
    _id: sessionId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).select('+refreshTokenHash');
  if (!session || !tokenHashesMatch(session.refreshTokenHash, hashToken(secret))) {
    if (session) await UserSession.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
    res.clearCookie(refreshCookieName, refreshCookieClearOptions());
    return res.status(401).json({ code: 'INVALID_SESSION', message: 'Session is invalid or expired.' });
  }

  const user = await User.findOne({ _id: session.userId, status: 'active' });
  if (!user) {
    await UserSession.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
    return res.status(401).json({ code: 'INVALID_SESSION', message: 'Session is invalid or expired.' });
  }

  const nextSecret = randomToken();
  const result = await UserSession.updateOne(
    { _id: session._id, refreshTokenHash: session.refreshTokenHash, revokedAt: null },
    { $set: { refreshTokenHash: hashToken(nextSecret) } }
  );
  if (result.modifiedCount !== 1) {
    return res.status(409).json({ code: 'SESSION_ROTATED', message: 'Session was already refreshed.' });
  }

  setRefreshCookie(res, session._id, nextSecret);
  return res.json({ data: { accessToken: signAccessToken(user._id, session._id), user: publicUser(user) } });
};

export const logout = async (req, res) => {
  const [sessionId] = String(req.cookies?.[refreshCookieName] || '').split('.');
  if (sessionId) {
    await UserSession.updateOne({ _id: sessionId }, { $set: { revokedAt: new Date() } }).catch(() => {});
  }
  res.clearCookie(refreshCookieName, refreshCookieClearOptions());
  return res.sendStatus(204);
};

export const me = async (req, res) => res.json({ data: publicUser(req.user) });
