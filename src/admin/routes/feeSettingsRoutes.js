import express from "express";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";
import {
  getFeeSettings,
  updateFeeSettings
} from "../controllers/feeSettingsController.js";

const router = express.Router();

// Secure all endpoints under this router
router.use(protectAdmin);

router.route("/")
  .get(getFeeSettings)
  .put(updateFeeSettings);

export default router;
