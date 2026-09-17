import mongoose from 'mongoose';

const batchSchema = new mongoose.Schema(
  {
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true,
      index: true
    },
    batchNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100
    },
    expiryDate: {
      type: Date,
      required: true
    },
    receivedDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    quantityReceived: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'quantityReceived must be a whole number'
      }
    },
    quantityRemaining: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'quantityRemaining must be a whole number'
      }
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'EXPIRING_SOON', 'QUARANTINED'],
      default: 'ACTIVE',
      index: true
    },
    expiringSoon: {
      type: Boolean,
      default: false,
      index: true
    },
    quarantinedAt: Date,
    quarantineReason: String
  },
  { timestamps: true }
);

batchSchema.index({ medicine: 1, batchNumber: 1 }, { unique: true });
batchSchema.index({ medicine: 1, expiryDate: 1, receivedDate: 1 });
batchSchema.index({ expiryDate: 1, quantityRemaining: 1 });

batchSchema.pre('validate', function validateRemainingQuantity() {
  if (this.quantityRemaining > this.quantityReceived) {
    this.invalidate(
      'quantityRemaining',
      'quantityRemaining cannot exceed quantityReceived'
    );
  }
});

export default mongoose.model('Batch', batchSchema);
