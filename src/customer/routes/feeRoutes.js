import express from "express";
import { getCustomerFees } from "../../admin/controllers/feeController.js";

const router = express.Router();

// Publicly accessible fees route (for checkout queries)
router.get("/", getCustomerFees);

export default router;
