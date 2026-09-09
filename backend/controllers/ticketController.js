import QRCode from 'qrcode';
import Event from '../models/events.js';
import Ticket from '../models/Ticket.js';
import { AppError } from '../utils/errors.js';
import { createQrPayload, parseAndVerifyQrPayload } from '../utils/qr.js';
import { isObjectId } from '../utils/validation.js';

export const getMyTicket = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) throw new AppError(400, 'INVALID_TICKET_ID', 'Invalid ticket ID.');
    const ticket = await Ticket.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('eventId', 'title venue timezone')
      .populate('showId', 'startsAt endsAt').lean();
    if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
    return res.json({ data: ticket });
  } catch (error) {
    return next(error);
  }
};

export const getMyTicketQr = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) throw new AppError(400, 'INVALID_TICKET_ID', 'Invalid ticket ID.');
    const ticket = await Ticket.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
    const qrPayload = createQrPayload(ticket);
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'M', margin: 2, width: 360 });
    return res.json({
      data: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber, status: ticket.status, qrPayload, qrDataUrl },
    });
  } catch (error) {
    return next(error);
  }
};

export const checkInTicket = async (req, res, next) => {
  try {
    const parsed = parseAndVerifyQrPayload(req.body.qrPayload);
    if (!parsed || !isObjectId(parsed.ticketId)) throw new AppError(400, 'INVALID_QR', 'Ticket QR is invalid.');
    const ticket = await Ticket.findOne({ _id: parsed.ticketId, publicCode: parsed.publicCode }).lean();
    if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
    const event = await Event.findOne({ _id: ticket.eventId, organizerId: req.user._id }).select('_id').lean();
    if (!event) throw new AppError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
    if (ticket.status !== 'valid') {
      throw new AppError(409, 'TICKET_NOT_VALID', ticket.status === 'used' ? 'Ticket has already been checked in.' : 'Ticket is not valid.');
    }
    const checkedIn = await Ticket.findOneAndUpdate(
      { _id: ticket._id, publicCode: parsed.publicCode, status: 'valid' },
      { $set: { status: 'used', checkedInAt: new Date(), checkedInBy: req.user._id } },
      { returnDocument: 'after' }
    ).lean();
    if (!checkedIn) throw new AppError(409, 'TICKET_ALREADY_USED', 'Ticket has already been checked in.');
    return res.json({ data: checkedIn });
  } catch (error) {
    return next(error);
  }
};
