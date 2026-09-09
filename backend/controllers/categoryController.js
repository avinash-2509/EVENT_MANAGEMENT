import Category from '../models/Category.js';

export const getCategories = async (_req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
    return res.json({
      data: categories.map((category) => ({
        id: category._id,
        name: category.name,
        slug: category.slug,
      })),
    });
  } catch {
    return res.status(500).json({ code: 'CATEGORY_LIST_FAILED', message: 'Unable to load categories.' });
  }
};
