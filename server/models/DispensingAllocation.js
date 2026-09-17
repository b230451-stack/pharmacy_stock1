import mongoose from 'mongoose';

const dispensingAllocationSchema = new mongoose.Schema(
  {
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DispensingTransaction',
      required: true,
      index: true
    },
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true,
      index: true
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      required: true,
      index: true
    },
    batchNumberSnapshot: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    expiryDateSnapshot: {
      type: Date,
      required: true
    },
    quantityDispensed: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'quantityDispensed must be a whole number'
      }
    }
  },
  { timestamps: true }
);

export default mongoose.model('DispensingAllocation', dispensingAllocationSchema);
