import mongoose from 'mongoose';

const dispensingTransactionSchema = new mongoose.Schema(
  {
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true,
      index: true
    },
    requestedQuantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'requestedQuantity must be a whole number'
      }
    },
    dispensedQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'dispensedQuantity must be a whole number'
      }
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reference: {
      type: String,
      trim: true,
      maxlength: 100
    }
  },
  { timestamps: true }
);

dispensingTransactionSchema.index({ createdAt: -1 });

dispensingTransactionSchema.pre('validate', function validateDispensedQuantity() {
  if (this.dispensedQuantity > this.requestedQuantity) {
    this.invalidate(
      'dispensedQuantity',
      'dispensedQuantity cannot exceed requestedQuantity'
    );
  }
});

export default mongoose.model('DispensingTransaction', dispensingTransactionSchema);
