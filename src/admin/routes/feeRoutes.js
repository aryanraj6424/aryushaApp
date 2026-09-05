import express from "express";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";
import {
  getFees,
  createFee,
  updateFee,
  deleteFee
} from "../controllers/feeController.js";

const router = express.Router();

// Secure all admin fee paths
router.use(protectAdmin);

router.route("/")
  .get(getFees)
  .post(createFee);

router.route("/:id")
  .put(updateFee)
  .delete(deleteFee);

export default router;
