import express from 'express';
import {
  cancelEvent,
  cancelShow,
  createEvent,
  createShow,
  deleteEvent,
  getEventById,
  getEvents,
  getOrganizerEvents,
  getRelatedEvents,
  getShows,
  getTrendingEvents,
  publishEvent,
  updateEvent,
  updateShow,
} from '../controllers/eventController.js';
import { optionalAuth, protect, requireOrganizer } from '../middleware/authMiddleware.js';
import { isObjectId } from '../utils/validation.js';

const router = express.Router();

const validateIdParam = (req, res, next, value) => {
  if (!isObjectId(value)) {
    return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid resource ID.' });
  }
  return next();
};

router.param('id', validateIdParam);
router.param('showId', validateIdParam);

router.get('/', getEvents);
router.post('/', protect, requireOrganizer, createEvent);
router.get('/mine', protect, requireOrganizer, getOrganizerEvents);
router.get('/trending', getTrendingEvents);

router.get('/:id/shows', optionalAuth, getShows);
router.post('/:id/shows', protect, requireOrganizer, createShow);
router.patch('/:id/shows/:showId', protect, requireOrganizer, updateShow);
router.post('/:id/shows/:showId/cancel', protect, requireOrganizer, cancelShow);

router.get('/:id/related', getRelatedEvents);
router.post('/:id/publish', protect, requireOrganizer, publishEvent);
router.post('/:id/cancel', protect, requireOrganizer, cancelEvent);
router.get('/:id', optionalAuth, getEventById);
router.patch('/:id', protect, requireOrganizer, updateEvent);
router.delete('/:id', protect, requireOrganizer, deleteEvent);

export default router;
