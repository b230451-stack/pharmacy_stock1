import Batch from '../models/Batch.js';
import Medicine from '../models/Medicine.js';
import OutboxEvent from '../models/OutboxEvent.js';
import { getStockSummary, todayStart } from './inventoryService.js';

export async function createReorderNotifications() {
  const medicines = await Medicine.find({ reorderThreshold: { $gt: 0 } }).lean();
  let created = 0;

  for (const medicine of medicines) {
    const stock = await getStockSummary(medicine._id);
    if (stock.sellableQuantity >= medicine.reorderThreshold) continue;

    try {
      await OutboxEvent.create({
        type: 'REORDER_REQUIRED',
        medicine: medicine._id,
        sellableQuantity: stock.sellableQuantity,
        reorderThreshold: medicine.reorderThreshold
      });
      created += 1;
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  return created;
}

export async function runClockJob() {
  const today = todayStart();
  const sevenDaysFromToday = new Date(today);
  sevenDaysFromToday.setUTCDate(sevenDaysFromToday.getUTCDate() + 7);

  const quarantineResult = await Batch.updateMany(
    {
      expiryDate: { $lt: today },
      quantityRemaining: { $gt: 0 },
      status: { $ne: 'QUARANTINED' }
    },
    {
      $set: {
        status: 'QUARANTINED',
        quarantinedAt: new Date(),
        quarantineReason: 'Expired stock'
      }
    }
  );

  await Batch.updateMany(
    {
      status: 'EXPIRING_SOON',
      quantityRemaining: 0,
      expiryDate: { $gte: today }
    },
    { $set: { status: 'ACTIVE', expiringSoon: false } }
  );

  const expiringResult = await Batch.updateMany(
    {
      expiryDate: { $gte: today, $lte: sevenDaysFromToday },
      quantityRemaining: { $gt: 0 },
      status: { $ne: 'QUARANTINED' }
    },
    { $set: { status: 'EXPIRING_SOON', expiringSoon: true } }
  );

  const reorderNotifications = await createReorderNotifications();

  return {
    quarantined: quarantineResult.modifiedCount,
    expiringSoon: expiringResult.modifiedCount,
    reorderNotifications
  };
}
