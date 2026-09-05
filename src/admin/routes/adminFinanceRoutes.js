import express from "express";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";
import {
  listVendorsWithCommissions,
  updateVendorCommissionConfig,
  getFinanceSummary,
  getOrderBreakdownList,
  getOrderCommissionBreakdown,
  exportFinanceReportCSV,
  reconcileFinanceData,
  backfillHistoricalData
} from "../controllers/adminFinanceController.js";

const router = express.Router();

// Apply protectAdmin middleware to secure all finance routes
router.use(protectAdmin);

router.get("/vendors",      listVendorsWithCommissions);
router.put("/vendors/:id",  updateVendorCommissionConfig);
router.get("/summary",      getFinanceSummary);
router.get("/orders",       getOrderBreakdownList);       // per-order breakdown list
router.get("/orders/:id",   getOrderCommissionBreakdown); // single order detail
router.get("/export",       exportFinanceReportCSV);
router.post("/reconcile",   reconcileFinanceData);
router.post("/backfill",    backfillHistoricalData);

export default router;

