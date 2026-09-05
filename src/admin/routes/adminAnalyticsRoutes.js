import express from "express";
import { getAdminAnalyticsStats, getReportsAnalytics } from "../controllers/adminAnalyticsController.js";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";

const router = express.Router();

router.use(protectAdmin);

router.get("/stats", getAdminAnalyticsStats);
router.get("/reports", getReportsAnalytics);

export default router;
