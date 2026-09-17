import mongoose from 'mongoose';

const outboxEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['REORDER_REQUIRED'],
      required: true
    },
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true,
      index: true
    },
    sellableQuantity: {
      type: Number,
      required: true,
      min: 0
    },
    reorderThreshold: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['PENDING', 'SENT'],
      default: 'PENDING',
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

outboxEventSchema.index(
  { medicine: 1, type: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);

export default mongoose.model('OutboxEvent', outboxEventSchema);