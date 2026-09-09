import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';

const authenticate = async (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;

  const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  const [user, session] = await Promise.all([
    User.findOne({ _id: decoded.sub, status: 'active' }),
    UserSession.findOne({ _id: decoded.sid, userId: decoded.sub, revokedAt: null, expiresAt: { $gt: new Date() } }),
  ]);
  if (!user || !session) return null;
  return user;
};
export const protect = async (req, res, next) => {
  try {
    req.user = await authenticate(req);
    if (!req.user) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required.' });
    return next();
  } catch {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required.' });
  }
};

export const optionalAuth = async (req, _res, next) => {
  try {
    req.user = await authenticate(req);
  } catch {
    req.user = null;
  }
  next();
};

export const requireOrganizer = (req, res, next) => {
  if (req.user?.role !== 'organizer') {
    return res.status(403).json({ code: 'ORGANIZER_REQUIRED', message: 'Organizer access required.' });
  }
  return next();
};

export const requireUser = (req, res, next) => {
  if (req.user?.role !== 'user') {
    return res.status(403).json({ code: 'USER_REQUIRED', message: 'User access required.' });
  }
  return next();
};
