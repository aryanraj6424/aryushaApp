import express from "express";

console.log("✅ adminAuthRoutes.js Loaded");

import {
  loginAdmin,
  forgotPassword,
  verifyOtp,
  resetPassword,
  sendAdminForgotPasswordOtp,
  verifyAdminForgotPasswordOtp,
  resetAdminPassword,
} from "../controllers/adminAuthController.js";

const router =
  express.Router();

// Admin Login
router.post(
  "/login",
  loginAdmin
);

// WhatsApp OTP 3-Step Forgot Password Routes
router.post(
  "/forgot-password/send-otp",
  sendAdminForgotPasswordOtp
);

router.post(
  "/forgot-password/verify-otp",
  verifyAdminForgotPasswordOtp
);

router.post(
  "/forgot-password/reset",
  resetAdminPassword
);

// Compatibility alias routes
router.post(
  "/forgot-password",
  forgotPassword
);

router.post(
  "/verify-otp",
  verifyOtp
);

router.post(
  "/reset-password",
  resetPassword
);



router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Admin Auth Route Working",
  });
});

export default router;