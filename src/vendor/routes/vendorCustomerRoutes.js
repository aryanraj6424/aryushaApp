import express from "express";
import { getCustomers, getCustomerOrders } from "../controllers/vendorCustomerController.js";
import { protectVendor } from "../middleware/vendorAuthMiddleware.js";

const router = express.Router();

// Apply protectVendor to secure all endpoints under /api/vendor/customers
router.use(protectVendor);

// GET /api/vendor/customers
router.get("/", getCustomers);

// GET /api/vendor/customers/:id/orders
router.get("/:id/orders", getCustomerOrders);

export default router;
