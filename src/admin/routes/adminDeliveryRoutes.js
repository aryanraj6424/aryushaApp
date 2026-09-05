import express from "express";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";
import {
  getDeliveries,
  getDeliveryById,
  getDeliveryLogs,
  exportDeliveryLogs,
  getDeliveryReports,
  exportDeliveryReports,
  getDeliveryBoys,
  getDeliveryBoyById,
  updateDeliveryBoyStatus,
  getOnboardingRequests,
  getOnboardingDetail,
  verifyRiderDocument,
  verifyRiderTraining,
  getStoreRecommendations,
  assignRiderStore,
  getPayoutSettings,
  updatePayoutSettings,
  updateRiderPayoutOverride,
  getAdminDeliverySlots,
  createAdminDeliverySlot,
  updateAdminDeliverySlot,
  deleteAdminDeliverySlot
} from "../controllers/adminDeliveryController.js";

const router = express.Router();

// Enforce protectAdmin session check on all routes in this file
router.use(protectAdmin);

router.get("/deliveries", getDeliveries);
router.get("/deliveries/:orderId", getDeliveryById);
router.get("/delivery-logs", getDeliveryLogs);
router.get("/delivery-logs/export", exportDeliveryLogs);
router.get("/reports/deliveries", getDeliveryReports);
router.get("/reports/deliveries/export", exportDeliveryReports);

// Payout Settings
router.get("/payout-settings", getPayoutSettings);
router.put("/payout-settings", updatePayoutSettings);

// Delivery Time Slots Admin CRUD
router.get("/delivery-slots", getAdminDeliverySlots);
router.post("/delivery-slots", createAdminDeliverySlot);
router.put("/delivery-slots/:id", updateAdminDeliverySlot);
router.delete("/delivery-slots/:id", deleteAdminDeliverySlot);

router.get("/delivery-boys", getDeliveryBoys);
router.get("/delivery-boys/onboarding", getOnboardingRequests);
router.get("/delivery-boys/:id", getDeliveryBoyById);
router.get("/delivery-boys/:id/onboarding", getOnboardingDetail);
router.put("/delivery-boys/:id/status", updateDeliveryBoyStatus);
router.put("/delivery-boys/:id/verify-document", verifyRiderDocument);
router.put("/delivery-boys/:id/training", verifyRiderTraining);
router.get("/delivery-boys/:id/store-recommendations", getStoreRecommendations);
router.put("/delivery-boys/:id/assign-store", assignRiderStore);
router.put("/delivery-boys/:id/payout-override", updateRiderPayoutOverride);

export default router;
