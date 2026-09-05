import Admin from "../models/Admin.js";
import bcrypt from "bcryptjs";

import { generateAdminOtp } from "../utils/generateAdminOtp.js";
import { generateAdminToken } from "../utils/generateAdminToken.js";
import {
  normalizePhoneNumber,
  findAccountByPhone,
  generateRandomOtp,
  sendWhatsappOtp,
  storeOtp,
  verifyOtpToken,
  validateResetToken,
  consumeResetToken
} from "../../utils/whatsappOtpService.js";

const sanitizeAdmin = (admin) => {
  if (!admin) return null;
  const obj = admin.toObject ? admin.toObject() : { ...admin };
  delete obj.password;
  delete obj.otp;
  delete obj.otpExpiry;
  return obj;
};

// =========================
// Login Admin
// =========================

export const loginAdmin =
  async (req, res) => {
    try {
      const {
        phone,
        password,
      } = req.body;

      const admin =
        await Admin.findOne({
          phone,
        });

      if (!admin) {
        return res.status(404).json({
          success: false,
          message:
            "Admin not found",
        });
      }

      const isMatch =
        await bcrypt.compare(
          password,
          admin.password
        );

      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid credentials",
        });
      }

      const token =
        generateAdminToken(
          admin._id
        );

      res.status(200).json({
        success: true,
        message:
          "Login Successful",
        token,
        admin: sanitizeAdmin(admin),
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        message:
          "Server Error",
      });
    }
  };

// =========================
// Forgot Password - WhatsApp OTP Flow (Admin)
// =========================

export const sendAdminForgotPasswordOtp = async (req, res) => {
  try {
    const phoneInput = req.body.phone || req.body.phoneNumber;
    const normalizedPhone = normalizePhoneNumber(phoneInput);

    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number. Please enter a valid 10-digit mobile number.",
      });
    }

    const admin = await findAccountByPhone(Admin, "phone", normalizedPhone);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found with this mobile number.",
      });
    }

    const otp = generateRandomOtp();
    await sendWhatsappOtp(normalizedPhone, otp);
    storeOtp("admin", normalizedPhone, otp);

    res.status(200).json({
      success: true,
      message: "WhatsApp OTP sent successfully.",
    });
  } catch (error) {
    console.error("sendAdminForgotPasswordOtp Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to send WhatsApp OTP.",
    });
  }
};

export const forgotPassword = sendAdminForgotPasswordOtp;

export const verifyAdminForgotPasswordOtp = async (req, res) => {
  try {
    const phoneInput = req.body.phone || req.body.phoneNumber;
    const { otp } = req.body;
    const normalizedPhone = normalizePhoneNumber(phoneInput);

    if (!normalizedPhone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone number and OTP are required.",
      });
    }

    const result = verifyOtpToken("admin", normalizedPhone, otp);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.status(200).json({
      success: true,
      message: "OTP verified successfully.",
      resetToken: result.resetToken,
    });
  } catch (error) {
    console.error("verifyAdminForgotPasswordOtp Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify OTP.",
    });
  }
};

export const verifyOtp = verifyAdminForgotPasswordOtp;

export const resetAdminPassword = async (req, res) => {
  try {
    const phoneInput = req.body.phone || req.body.phoneNumber;
    const newPassword = req.body.newPassword || req.body.password;
    const { resetToken } = req.body;

    const normalizedPhone = normalizePhoneNumber(phoneInput);

    if (!normalizedPhone || !resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Phone number, resetToken, and newPassword are required.",
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long.",
      });
    }

    const tokenValidation = validateResetToken("admin", normalizedPhone, resetToken);
    if (!tokenValidation.success) {
      return res.status(400).json({
        success: false,
        message: tokenValidation.message,
      });
    }

    const admin = await findAccountByPhone(Admin, "phone", normalizedPhone);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found.",
      });
    }

    admin.password = await bcrypt.hash(newPassword, 10);
    admin.otp = null;
    admin.otpExpiry = null;
    await admin.save();

    consumeResetToken(tokenValidation.tokenKey);

    res.status(200).json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    console.error("resetAdminPassword Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to reset password.",
    });
  }
};

export const resetPassword = resetAdminPassword;