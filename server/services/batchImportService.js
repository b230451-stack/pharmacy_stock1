import mongoose from 'mongoose';
import Batch from '../models/Batch.js';
import Medicine from '../models/Medicine.js';
import StockMovement from '../models/StockMovement.js';

function parseImportQuantity(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).trim().match(/^\d+(?:\.0+)?\s*(?:units?)?$/i);
  if (!match) return null;
  const quantity = Number.parseInt(match[0], 10);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

function parseImportDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  const dayFirstMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dayFirstMatch) {
    const [, day, month, year] = dayFirstMatch;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) return null;
    return date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function textValue(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

async function findMedicine(value) {
  const text = textValue(value);
  if (!text) return null;
  if (mongoose.isValidObjectId(text)) return Medicine.findById(text);
  return Medicine.findOne({ name: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
}

export async function importBatches(rows, userId) {
  if (!Array.isArray(rows)) {
    const error = new Error('rows must be an array');
    error.statusCode = 400;
    throw error;
  }

  let imported = 0;
  let deduped = 0;
  let rejected = 0;
  const seen = new Set();
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      for (const row of rows) {
        if (!row || typeof row !== 'object') {
          rejected += 1;
          continue;
        }

        const medicine = await findMedicine(row.medicineId || row.medicine || row.medicineName);
        const batchNumber = textValue(row.batchNumber).toUpperCase();
        const quantity = parseImportQuantity(row.quantityReceived ?? row.quantity);
        const expiryDate = parseImportDate(row.expiryDate);
        const receivedDate = row.receivedDate ? parseImportDate(row.receivedDate) : new Date();

        if (!medicine || !batchNumber || !quantity || !expiryDate || !receivedDate) {
          rejected += 1;
          continue;
        }

        const dedupeKey = `${medicine._id}:${batchNumber}`;
        if (seen.has(dedupeKey) || await Batch.exists({ medicine: medicine._id, batchNumber }).session(session)) {
          deduped += 1;
          continue;
        }
        seen.add(dedupeKey);

        const [batch] = await Batch.create(
          [{
            medicine: medicine._id,
            batchNumber,
            expiryDate,
            receivedDate,
            quantityReceived: quantity,
            quantityRemaining: quantity
          }],
          { session }
        );
        await StockMovement.create(
          [{
            medicine: medicine._id,
            batch: batch._id,
            type: 'RECEIPT',
            quantity,
            reason: 'Batch import',
            performedBy: userId
          }],
          { session }
        );
        imported += 1;
      }
    });
  } finally {
    await session.endSession();
  }

  return { imported, deduped, rejected };
}
