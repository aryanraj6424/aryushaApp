import express from "express";
import jwt from "jsonwebtoken";
import protect from "../../middleware/authMiddleware.js";
import User from "../models/User.js";
import {
  getCartSummary,
  getActiveCoupons,
  getEligibleCoupons,
  applyCoupon,
  removeCoupon,
  getDeliverySlots
} from "../controllers/cartController.js";

const router = express.Router();

// Optional authentication middleware to resolve req.user if a token is present
const optionalProtect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id);
    }
  } catch (error) {
    // Proceed as guest if token is invalid or expired
  }
  next();
};

router.post("/summary", optionalProtect, getCartSummary); // Allow POST for easy passing of cart items
router.get("/summary", optionalProtect, getCartSummary);  // Also support GET with query parameter for spec alignment
router.get("/coupons", protect, getActiveCoupons); // Active coupons route for customers
router.post("/eligible-coupons", optionalProtect, getEligibleCoupons); // Eligible coupons route for customer cart
router.get("/eligible-coupons", optionalProtect, getEligibleCoupons);
router.get("/coupons/eligible", optionalProtect, getEligibleCoupons);
router.post("/apply-coupon", protect, applyCoupon);
router.post("/remove-coupon", protect, removeCoupon);
router.get("/slots", protect, getDeliverySlots);

export default router;
