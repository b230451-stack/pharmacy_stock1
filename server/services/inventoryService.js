import mongoose from 'mongoose';
import Batch from '../models/Batch.js';
import DispensingAllocation from '../models/DispensingAllocation.js';
import DispensingTransaction from '../models/DispensingTransaction.js';
import Medicine from '../models/Medicine.js';
import StockMovement from '../models/StockMovement.js';

export function todayStart() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function parseDate(value, fieldName) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    const error = new Error(`${fieldName} must be a valid date`);
    error.statusCode = 400;
    throw error;
  }

  return date;
}

export function paginationFromQuery(query) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);

  return { page, limit, skip: (page - 1) * limit };
}

export function sortDirection(value) {
  return value === 'desc' ? -1 : 1;
}

export async function getStockSummary(medicineId) {
  const batches = await Batch.find({ medicine: medicineId }).lean();
  const today = todayStart();

  return batches.reduce(
    (summary, batch) => {
      if (batch.quantityRemaining === 0 || batch.status === 'QUARANTINED') {
        return summary;
      }

      if (batch.expiryDate < today) {
        summary.expiredQuantity += batch.quantityRemaining;
        return summary;
      }

      summary.sellableQuantity += batch.quantityRemaining;
      if (
        !summary.nextExpiry ||
        batch.expiryDate < summary.nextExpiry.expiryDate
      ) {
        summary.nextExpiry = batch;
      }
      return summary;
    },
    { sellableQuantity: 0, expiredQuantity: 0, depletedQuantity: 0, nextExpiry: null }
  );
}

export async function receiveBatch({ medicineId, body, userId }) {
  const medicine = await Medicine.findById(medicineId);
  if (!medicine) {
    const error = new Error('Medicine not found');
    error.statusCode = 404;
    throw error;
  }

  const batchNumber = body.batchNumber?.trim();
  const quantity = Number(body.quantityReceived);
  if (!batchNumber || !Number.isInteger(quantity) || quantity < 1) {
    const error = new Error('batchNumber and a positive whole quantityReceived are required');
    error.statusCode = 400;
    throw error;
  }

  const expiryDate = parseDate(body.expiryDate, 'expiryDate');
  const receivedDate = body.receivedDate
    ? parseDate(body.receivedDate, 'receivedDate')
    : new Date();
  const session = await mongoose.startSession();

  try {
    let createdBatch;
    await session.withTransaction(async () => {
      [createdBatch] = await Batch.create(
        [
          {
            medicine: medicineId,
            batchNumber,
            expiryDate,
            receivedDate,
            quantityReceived: quantity,
            quantityRemaining: quantity
          }
        ],
        { session }
      );

      await StockMovement.create(
        [
          {
            medicine: medicineId,
            batch: createdBatch._id,
            type: 'RECEIPT',
            quantity,
            reason: 'Stock received',
            performedBy: userId
          }
        ],
        { session }
      );
    });

    return createdBatch;
  } finally {
    await session.endSession();
  }
}

export async function dispenseMedicine({ medicineId, quantity, userId, reference }) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    const error = new Error('quantity must be a positive whole number');
    error.statusCode = 400;
    throw error;
  }

  const session = await mongoose.startSession();

  try {
    let result;
    await session.withTransaction(async () => {
      const medicine = await Medicine.findById(medicineId).session(session);
      if (!medicine) {
        const error = new Error('Medicine not found');
        error.statusCode = 404;
        throw error;
      }

      const eligibleBatches = await Batch.find({
        medicine: medicineId,
        expiryDate: { $gte: todayStart() },
        quantityRemaining: { $gt: 0 },
        status: { $ne: 'QUARANTINED' }
      })
        .sort({ expiryDate: 1, receivedDate: 1, _id: 1 })
        .session(session);

      const availableQuantity = eligibleBatches.reduce(
        (total, batch) => total + batch.quantityRemaining,
        0
      );

      if (availableQuantity < quantity) {
        const error = new Error(
          `Insufficient in-date stock. Available quantity: ${availableQuantity}`
        );
        error.statusCode = 400;
        error.details = { availableQuantity, requestedQuantity: quantity };
        throw error;
      }

      let remainingToDispense = quantity;
      const allocations = [];

      for (const batch of eligibleBatches) {
        if (remainingToDispense === 0) break;

        const quantityFromBatch = Math.min(
          remainingToDispense,
          batch.quantityRemaining
        );
        const updatedBatch = await Batch.findOneAndUpdate(
          { _id: batch._id, quantityRemaining: { $gte: quantityFromBatch } },
          { $inc: { quantityRemaining: -quantityFromBatch } },
          { returnDocument: 'after', session, runValidators: true }
        );

        if (!updatedBatch) {
          const error = new Error('Stock changed during dispensing; please retry');
          error.statusCode = 409;
          throw error;
        }

        allocations.push({ batch, quantityDispensed: quantityFromBatch });
        remainingToDispense -= quantityFromBatch;
      }

      const [transaction] = await DispensingTransaction.create(
        [
          {
            medicine: medicineId,
            requestedQuantity: quantity,
            dispensedQuantity: quantity,
            performedBy: userId,
            reference: reference?.trim()
          }
        ],
        { session }
      );

      const allocationDocuments = allocations.map(({ batch, quantityDispensed }) => ({
        transaction: transaction._id,
        medicine: medicineId,
        batch: batch._id,
        batchNumberSnapshot: batch.batchNumber,
        expiryDateSnapshot: batch.expiryDate,
        quantityDispensed
      }));
      await DispensingAllocation.create(allocationDocuments, { session, ordered: true });

      result = { transaction, allocations: allocationDocuments };
    });

    return result;
  } finally {
    await session.endSession();
  }
}
