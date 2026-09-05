import express from "express";
import {
  placeOrder,
  getCustomerOrders,
  getOrderById,
  downloadInvoice,
  getOrderTracking,
  getOrderOtp,
  rateOrder
} from "../controllers/orderController.js";
import protect from "../../middleware/authMiddleware.js";

const router = express.Router();

// Protect all customer order endpoints
router.use(protect);

router.put("/:id/rate", rateOrder);

// Place an order
router.post("/", placeOrder);

// Get orders history for a user
router.get("/user/:userId", getCustomerOrders);

// Get order details / tracking status
router.get("/:id", getOrderById);

// Get order tracking timeline and map coordinates
router.get("/:id/tracking", getOrderTracking);

// Get delivery OTP
router.get("/:id/otp", getOrderOtp);

// Download PDF invoice
router.get("/:id/invoice", downloadInvoice);

export default router;
