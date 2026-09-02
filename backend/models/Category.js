import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    // MongoDB's _id (ObjectId) is the category identifier.
    // Events reference this via ObjectId — no custom Number ID needed.
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Category = mongoose.model('Category', categorySchema);
export default Category;