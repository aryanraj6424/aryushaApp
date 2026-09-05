import express from "express";
import {
  getDashboard,
  getOrders,
  getOrderById,
  updateOrderStatus,
  updateVendorPickupStatus,
  verifyOtp,
  getEarnings,
  updateProfile,
  getOnboardingStatus,
  updateVehicleSelection,
  submitKycDetails,
  submitTrainingChecklist,
  signAgreement,
  getNotifications,
  markNotificationRead,
  toggleOnlineStatus,
  submitSupportTicket,
  getOptimizedRoute
} from "../controllers/deliveryBoyController.js";
import { protectDeliveryBoy } from "../middleware/deliveryBoyAuthMiddleware.js";

const router = express.Router();

// Apply protectDeliveryBoy middleware to all endpoints
router.use(protectDeliveryBoy);

router.get("/dashboard", getDashboard);
router.get("/orders", getOrders);
router.get("/optimize-route", getOptimizedRoute);
router.get("/orders/:id", getOrderById);
router.put("/orders/:id/status", updateOrderStatus);
router.put("/orders/:id/pickup-vendor", updateVendorPickupStatus);
router.post("/orders/:id/verify-otp", verifyOtp);
router.get("/earnings", getEarnings);
router.put("/profile", updateProfile);
router.post("/support-ticket", submitSupportTicket);

// Onboarding & Availability
router.get("/onboarding-status", getOnboardingStatus);
router.put("/vehicle", updateVehicleSelection);
router.put("/kyc", submitKycDetails);
router.put("/training", submitTrainingChecklist);
router.post("/sign-agreement", signAgreement);
router.get("/notifications", getNotifications);
router.put("/notifications/:id/read", markNotificationRead);
router.put("/go-online", toggleOnlineStatus);

export default router;
