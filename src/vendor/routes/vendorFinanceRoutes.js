import express from "express";
import { protectVendor } from "../middleware/vendorAuthMiddleware.js";
import {
  getOwnCommissionRate,
  getOwnFinanceSummary,
  getOwnOrderBreakdownList,
  getOwnOrderCommissionBreakdown
} from "../controllers/vendorFinanceController.js";

const router = express.Router();

// Apply protectVendor to secure vendor finance routes
router.use(protectVendor);

router.get("/commission-rate", getOwnCommissionRate);
router.get("/summary",         getOwnFinanceSummary);
router.get("/orders",          getOwnOrderBreakdownList);       // per-order breakdown list
router.get("/orders/:id",      getOwnOrderCommissionBreakdown); // single order detail

export default router;

