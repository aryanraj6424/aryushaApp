import express from "express";
import {
  registerDeliveryBoy,
  loginDeliveryBoy,
  sendLoginOtp,
  verifyLoginOtp,
  forgotPassword,
  verifyOtp,
  resetPassword,
} from "../controllers/deliveryBoyAuthController.js";

const router = express.Router();

router.post("/register", registerDeliveryBoy);
router.post("/login", loginDeliveryBoy);
router.post("/send-login-otp", sendLoginOtp);
router.post("/verify-login-otp", verifyLoginOtp);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);

export default router;
