import express from "express";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";
import {
  getCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon
} from "../controllers/couponController.js";

const router = express.Router();

// Secure all endpoints under this router
router.use(protectAdmin);

router.get("/all", getCoupons);
router.get("/:id", getCouponById);
router.post("/create", createCoupon);
router.put("/update/:id", updateCoupon);
router.delete("/delete/:id", deleteCoupon);

export default router;
