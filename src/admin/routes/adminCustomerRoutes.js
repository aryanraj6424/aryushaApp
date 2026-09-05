import express from "express";
import { getCustomers, getCustomerOrders } from "../controllers/adminCustomerController.js";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";

const router = express.Router();

// GET /api/admin/customers
router.get("/", protectAdmin, getCustomers);

// GET /api/admin/customers/:id/orders
router.get("/:id/orders", protectAdmin, getCustomerOrders);

export default router;
