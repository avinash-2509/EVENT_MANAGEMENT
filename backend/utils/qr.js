import crypto from 'crypto';

const getSecret = () => {
  if (process.env.QR_SIGNING_SECRET) return process.env.QR_SIGNING_SECRET;
  if (process.env.NODE_ENV !== 'production' && process.env.JWT_SECRET) return process.env.JWT_SECRET;
  throw new Error('QR_SIGNING_SECRET is required.');
};

const signatureFor = (version, ticketId, publicCode) => crypto
  .createHmac('sha256', getSecret())
  .update(`${version}.${ticketId}.${publicCode}`)
  .digest('base64url');

export const createQrPayload = (ticket) => {
  const version = 'v1';
  const ticketId = String(ticket._id);
  return `${version}.${ticketId}.${ticket.publicCode}.${signatureFor(version, ticketId, ticket.publicCode)}`;
};

export const parseAndVerifyQrPayload = (payload) => {
  const [version, ticketId, publicCode, signature, ...extra] = String(payload || '').split('.');
  if (extra.length || version !== 'v1' || !ticketId || !publicCode || !signature) return null;
  const expected = signatureFor(version, ticketId, publicCode);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) return null;
  return { ticketId, publicCode };
};

export const randomPublicCode = () => crypto.randomBytes(18).toString('base64url');
export const randomTicketNumber = () => `EVT-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
