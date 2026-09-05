import express from "express";
import {
  getVendorDashboard,
  getVendorProfile,
  getVendorPermissionsSelf,
  getVendorEarningsSelf,
  getVendorSettlementsSelf,
  requestWithdrawalSelf,
  getVendorCommissionSelf,
  getVendorSalesReportSelf,
  updateVendorProfileSelf,
  getVendorOrders,
  assignDeliveryBoy,
  listActiveDeliveryBoys,
  reassignDeliveryBoy,
  getOrderDeliveryStatus,
  acceptOrder,
  rejectOrder,
  searchVendorEntities,
} from "../controllers/vendorController.js";
import { protectVendor } from "../middleware/vendorAuthMiddleware.js";

const router = express.Router();

// Apply protectVendor to all routes in this router
router.use(protectVendor);

router.get("/dashboard", getVendorDashboard);
router.get("/profile", getVendorProfile);
router.put("/profile", updateVendorProfileSelf);
router.get("/permissions", getVendorPermissionsSelf);
router.get("/earnings", getVendorEarningsSelf);
router.get("/settlements", getVendorSettlementsSelf);
router.post("/settlements/withdraw", requestWithdrawalSelf);
router.get("/commission", getVendorCommissionSelf);
router.get("/search", searchVendorEntities);
router.get("/sales-report", getVendorSalesReportSelf);

// Order & Delivery Boy management
router.get("/orders", getVendorOrders);
router.post("/orders/:id/accept", acceptOrder);
router.post("/orders/:id/reject", rejectOrder);
router.post("/orders/:id/assign-delivery-boy", assignDeliveryBoy);
router.put("/orders/:id/reassign-delivery-boy", reassignDeliveryBoy);
router.get("/orders/:id/delivery-status", getOrderDeliveryStatus);
router.get("/delivery-boys", listActiveDeliveryBoys);

export default router;