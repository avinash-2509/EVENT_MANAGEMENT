import Event from '../models/events.js';
import EventShow from '../models/EventShow.js';

export const getDashboardStats = async (req, res) => {
  const eventIds = await Event.find({ organizerId: req.user._id }).distinct('_id');
  const [totalEvents, publishedEvents, cancelledEvents, totalShows] = await Promise.all([
    Event.countDocuments({ organizerId: req.user._id }),
    Event.countDocuments({ organizerId: req.user._id, status: 'published' }),
    Event.countDocuments({ organizerId: req.user._id, status: 'cancelled' }),
    EventShow.countDocuments({ eventId: { $in: eventIds } }),
  ]);
  return res.json({ data: { totalEvents, publishedEvents, cancelledEvents, totalShows } });
};
export const getCategoryStats = async (req, res) => {
  const rows = await Event.aggregate([
    { $match: { organizerId: req.user._id } },
    { $group: { _id: '$categoryId', eventCount: { $sum: 1 } } },
    { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
    { $unwind: '$category' },
    { $project: { _id: 0, categoryId: '$_id', categoryName: '$category.name', eventCount: 1 } },
    { $sort: { eventCount: -1 } },
  ]);
  return res.json({ data: rows });
};
