import { Router } from 'express';
import {
  createBatch,
  createMedicine,
  deleteMedicine,
  dispense,
  getBatch,
  getMedicine,
  getStock,
  clock,
  importBatchRows,
  listBatches,
  listDispensingHistory,
  listExpiredStock,
  listExpiryAlerts,
  listMedicines,
  listStockHistory,
  listOutbox,
  updateMedicine
} from '../controllers/inventoryController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
router.use(requireAuth);

router.post('/clock', clock);
router.get('/outbox', listOutbox);
router.post('/batches/import', importBatchRows);

router.route('/medicines').get(listMedicines).post(createMedicine);
router.route('/medicines/:medicineId').get(getMedicine).put(updateMedicine).delete(deleteMedicine);
router.get('/medicines/:medicineId/stock', getStock);
router.post('/medicines/:medicineId/batches', createBatch);
router.get('/medicines/:medicineId/batches', listBatches);
router.get('/batches/:batchId', getBatch);
router.post('/dispensing', dispense);
router.get('/history/dispensing', listDispensingHistory);
router.get('/history/stock', listStockHistory);
router.get('/alerts/expiring', listExpiryAlerts);
router.get('/alerts/expired', listExpiredStock);

export default router;
