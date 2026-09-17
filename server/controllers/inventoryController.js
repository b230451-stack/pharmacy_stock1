import Batch from '../models/Batch.js';
import DispensingAllocation from '../models/DispensingAllocation.js';
import DispensingTransaction from '../models/DispensingTransaction.js';
import Medicine from '../models/Medicine.js';
import StockMovement from '../models/StockMovement.js';
import { dispenseMedicine, getStockSummary, paginationFromQuery, receiveBatch, sortDirection, todayStart } from '../services/inventoryService.js';
import { createReorderNotifications, runClockJob } from '../services/clockService.js';
import { importBatches } from '../services/batchImportService.js';
import OutboxEvent from '../models/OutboxEvent.js';

const medicineSortFields = new Set(['name', 'genericName', 'createdAt', 'updatedAt']);
const batchSortFields = new Set(['expiryDate', 'receivedDate', 'batchNumber', 'quantityRemaining']);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listMedicines(request, response) {
  const { page, limit, skip } = paginationFromQuery(request.query);
  const search = request.query.search?.trim();
  const sortBy = medicineSortFields.has(request.query.sortBy)
    ? request.query.sortBy
    : 'name';
  const sort = { [sortBy]: sortDirection(request.query.sortOrder) };
  const safeSearch = search ? escapeRegex(search) : null;
  const filter = safeSearch
    ? { $or: [{ name: new RegExp(safeSearch, 'i') }, { genericName: new RegExp(safeSearch, 'i') }] }
    : {};
  const [medicines, total] = await Promise.all([
    Medicine.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Medicine.countDocuments(filter)
  ]);

  const items = await Promise.all(
    medicines.map(async (medicine) => ({
      ...medicine,
      stock: await getStockSummary(medicine._id)
    }))
  );

  return response.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function createMedicine(request, response) {
  const { name, genericName, strength, form, sku, reorderThreshold } = request.body;
  if (!name?.trim()) {
    return response.status(400).json({ message: 'Medicine name is required' });
  }

  const medicine = await Medicine.create({
    name: name.trim(),
    genericName: genericName?.trim(),
    strength: strength?.trim(),
    form: form?.trim(),
    sku: sku?.trim(),
    ...(reorderThreshold !== undefined ? { reorderThreshold: Number(reorderThreshold) } : {})
  });
  return response.status(201).json({ medicine });
}

export async function getMedicine(request, response) {
  const medicine = await Medicine.findById(request.params.medicineId);
  if (!medicine) return response.status(404).json({ message: 'Medicine not found' });

  return response.json({ medicine, stock: await getStockSummary(medicine._id) });
}

export async function updateMedicine(request, response) {
  const allowedFields = ['name', 'genericName', 'strength', 'form', 'sku', 'reorderThreshold'];
  const updates = {};
  for (const field of allowedFields) {
    if (request.body[field] !== undefined) {
      updates[field] = field === 'reorderThreshold'
        ? Number(request.body[field])
        : request.body[field]?.trim();
    }
  }
  if (updates.name !== undefined && !updates.name) {
    return response.status(400).json({ message: 'Medicine name cannot be empty' });
  }

  const medicine = await Medicine.findByIdAndUpdate(request.params.medicineId, updates, {
    new: true,
    runValidators: true
  });
  if (!medicine) return response.status(404).json({ message: 'Medicine not found' });
  return response.json({ medicine });
}

export async function deleteMedicine(request, response) {
  const medicine = await Medicine.findById(request.params.medicineId);
  if (!medicine) return response.status(404).json({ message: 'Medicine not found' });

  const hasBatches = await Batch.exists({ medicine: medicine._id });
  if (hasBatches) {
    return response.status(409).json({ message: 'Cannot delete a medicine with batches' });
  }

  await medicine.deleteOne();
  return response.json({ message: 'Medicine deleted' });
}

export async function createBatch(request, response) {
  const batch = await receiveBatch({
    medicineId: request.params.medicineId,
    body: request.body,
    userId: request.user._id
  });
  return response.status(201).json({ batch });
}

export async function listBatches(request, response) {
  const filter = { medicine: request.params.medicineId };
  const today = todayStart();
  if (request.query.status === 'sellable') {
    filter.expiryDate = { $gte: today };
    filter.quantityRemaining = { $gt: 0 };
  } else if (request.query.status === 'expired') {
    filter.expiryDate = { $lt: today };
    filter.quantityRemaining = { $gt: 0 };
  } else if (request.query.status === 'depleted') {
    filter.quantityRemaining = 0;
  }

  const { page, limit, skip } = paginationFromQuery(request.query);
  const sortBy = batchSortFields.has(request.query.sortBy) ? request.query.sortBy : 'expiryDate';
  const sort = { [sortBy]: sortDirection(request.query.sortOrder) };
  const [batches, total] = await Promise.all([
    Batch.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Batch.countDocuments(filter)
  ]);
  return response.json({ batches, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function getStock(request, response) {
  const medicine = await Medicine.findById(request.params.medicineId);
  if (!medicine) return response.status(404).json({ message: 'Medicine not found' });
  return response.json({ medicine, stock: await getStockSummary(medicine._id) });
}

export async function listExpiryAlerts(request, response) {
  const days = Math.min(Math.max(Number.parseInt(request.query.days, 10) || 30, 1), 365);
  const endDate = new Date(todayStart());
  endDate.setUTCDate(endDate.getUTCDate() + days);
  const filter = {
    expiryDate: { $gte: todayStart(), $lte: endDate },
    quantityRemaining: { $gt: 0 }
  };
  const { page, limit, skip } = paginationFromQuery(request.query);
  const [batches, total] = await Promise.all([
    Batch.find(filter).populate('medicine', 'name genericName strength form').sort({ expiryDate: 1 }).skip(skip).limit(limit).lean(),
    Batch.countDocuments(filter)
  ]);
  return response.json({ items: batches, days, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function listExpiredStock(request, response) {
  const filter = { expiryDate: { $lt: todayStart() }, quantityRemaining: { $gt: 0 } };
  const { page, limit, skip } = paginationFromQuery(request.query);
  const [batches, total] = await Promise.all([
    Batch.find(filter).populate('medicine', 'name genericName strength form').sort({ expiryDate: 1 }).skip(skip).limit(limit).lean(),
    Batch.countDocuments(filter)
  ]);
  return response.json({ items: batches, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function dispense(request, response) {
  const quantity = Number(request.body.quantity);
  const result = await dispenseMedicine({
    medicineId: request.body.medicineId,
    quantity,
    userId: request.user._id,
    reference: request.body.reference
  });
  await createReorderNotifications();
  return response.status(201).json(result);
}

export async function clock(request, response) {
  return response.json(await runClockJob());
}

export async function importBatchRows(request, response) {
  const result = await importBatches(request.body.rows, request.user._id);
  return response.status(201).json(result);
}

export async function listOutbox(request, response) {
  const { page, limit, skip } = paginationFromQuery(request.query);
  const [items, total] = await Promise.all([
    OutboxEvent.find({ status: 'PENDING' })
      .populate('medicine', 'name genericName strength form reorderThreshold')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    OutboxEvent.countDocuments({ status: 'PENDING' })
  ]);
  return response.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function listDispensingHistory(request, response) {
  const { page, limit, skip } = paginationFromQuery(request.query);
  const [transactions, total] = await Promise.all([
    DispensingTransaction.find()
      .populate('medicine', 'name strength form')
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DispensingTransaction.countDocuments()
  ]);

  const items = await Promise.all(
    transactions.map(async (transaction) => ({
      ...transaction,
      allocations: await DispensingAllocation.find({ transaction: transaction._id })
        .sort({ expiryDateSnapshot: 1 })
        .lean()
    }))
  );
  return response.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function listStockHistory(request, response) {
  const { page, limit, skip } = paginationFromQuery(request.query);
  const [items, total] = await Promise.all([
    StockMovement.find()
      .populate('medicine', 'name strength form')
      .populate('batch', 'batchNumber expiryDate')
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StockMovement.countDocuments()
  ]);
  return response.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function getBatch(request, response) {
  const batch = await Batch.findById(request.params.batchId).populate('medicine', 'name genericName strength form');
  if (!batch) return response.status(404).json({ message: 'Batch not found' });
  return response.json({ batch });
}
