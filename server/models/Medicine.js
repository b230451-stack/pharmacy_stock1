import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },
    genericName: {
      type: String,
      trim: true,
      maxlength: 150
    },
    strength: {
      type: String,
      trim: true,
      maxlength: 50
    },
    form: {
      type: String,
      trim: true,
      maxlength: 50
    },
    sku: {
      type: String,
      trim: true,
      maxlength: 50
    },
    reorderThreshold: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: 'reorderThreshold must be a whole number'
      }
    }
  },
  { timestamps: true }
);

medicineSchema.index({ name: 1 });
medicineSchema.index({ genericName: 1 });
medicineSchema.index({ name: 'text', genericName: 'text' });

export default mongoose.model('Medicine', medicineSchema);
