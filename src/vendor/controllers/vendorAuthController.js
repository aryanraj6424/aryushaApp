

import Vendor from "../models/Vendor.js";
import bcrypt from "bcryptjs";
import { createAdminNotification } from "../../utils/adminNotificationHelper.js";

import { generateVendorOtp } from "../utils/generateVendorOtp.js";
import { generateVendorToken } from "../utils/generateVendorToken.js";
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

// =========================
// Register Vendor
// =========================

export const registerVendor = async (
  req,
  res
) => {
  try {
    const {
      shopName,
      shopType,
      yearsInBusiness,
      employees,

      businessEmail,
      phone,
      whatsapp,

      village,
      district,
      state,
      pincode,
      country,

      businessRegNo,
      gstNumber,
      resellerCertificate,
      aadhaar,
      pan,
      storeFrontImage,
      storeBackImage,

      password,
    } = req.body;

    const vendorExists =
      await Vendor.findOne({
        $or: [
          { businessEmail },
          { phone },
        ],
      });

    if (vendorExists) {
      return res.status(400).json({
        success: false,
        message:
          "Vendor already exists",
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        password,
        10
      );

    const vendor =
      await Vendor.create({
        shopName,
        shopType,
        yearsInBusiness,
        employees,

        businessEmail,
        phone,
        whatsapp,

        address: {
          village,
          district,
          state,
          pincode,
          country,
        },

        documents: {
          businessRegNo,
          gstNumber,
          resellerCertificate,
          aadhaar,
          pan,
          storeFrontImage,
          storeBackImage,
        },

        ownerDetails: {
          ownerName: shopName || "",
          mobileNumber: phone || "",
          email: businessEmail || "",
        },

        password:
          hashedPassword,

        status: "pending",
      });

    // Trigger Admin Notification for New Vendor Onboarding
    await createAdminNotification({
      title: "New Vendor Registration 🏪",
      message: `New vendor onboarding request from "${shopName || vendor.storeDetails?.storeName || 'New Store'}"`,
      type: "NEW_VENDOR_ONBOARDING",
      relatedVendorId: vendor._id
    });

    res.status(201).json({
      success: true,
      message:
        "Vendor registration submitted successfully. Waiting for admin approval.",
      vendor,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Server Error",
    });
  }
};

// =========================
// Login Vendor
// =========================

export const loginVendor = async (req, res) => {
  try {
    const { phone, email, password } = req.body;
    const identifier = String(phone || email || "").trim();

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone number/Email and password are required",
      });
    }

    const vendor = await Vendor.findOne({
      $or: [
        { phone: identifier },
        { businessEmail: identifier.toLowerCase() },
        { "ownerDetails.mobileNumber": identifier },
        { "ownerDetails.email": identifier.toLowerCase() }
      ]
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor account not found with this mobile number or email",
      });
    }

    // Registration Approval Check
    if (vendor.status === "pending") {
      return res.status(403).json({
        success: false,
        message: "Your account is under verification. Please wait for admin approval.",
      });
    }

    if (vendor.status === "rejected") {
      return res.status(403).json({
        success: false,
        message: "Your vendor account has been rejected.",
      });
    }

    // Account Status Check
    if (vendor.accountStatus === "hold") {
      return res.status(403).json({
        success: false,
        message: "Your account is currently on hold.",
      });
    }

    if (vendor.accountStatus === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended by admin.",
      });
    }

    if (vendor.accountStatus === "deactivated") {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated.",
      });
    }

    let isMatch = false;
    if (vendor.password) {
      isMatch = await bcrypt.compare(password, vendor.password);
      if (!isMatch && vendor.password === password) {
        isMatch = true;
      }
    }

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid password. Please check your credentials.",
      });
    }

    const token = generateVendorToken(vendor._id);

    res.status(200).json({
      success: true,
      message: "Login Successful",
      token,
      vendor,
    });

  } catch (error) {
    console.error("Vendor Login Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// =========================
// =========================
// Forgot Password - WhatsApp OTP Flow (Vendor)
// =========================

export const sendVendorForgotPasswordOtp = async (req, res) => {
  try {
    const phoneInput = req.body.phone || req.body.phoneNumber;
    const normalizedPhone = normalizePhoneNumber(phoneInput);

    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number. Please enter a valid 10-digit mobile number.",
      });
    }

    const vendor = await findAccountByPhone(Vendor, "phone", normalizedPhone);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor account not found with this mobile number.",
      });
    }

    const otp = generateRandomOtp();
    await sendWhatsappOtp(normalizedPhone, otp);
    storeOtp("vendor", normalizedPhone, otp);

    res.status(200).json({
      success: true,
      message: "WhatsApp OTP sent successfully.",
    });
  } catch (error) {
    console.error("sendVendorForgotPasswordOtp Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to send WhatsApp OTP.",
    });
  }
};

export const forgotPassword = sendVendorForgotPasswordOtp;

export const verifyVendorForgotPasswordOtp = async (req, res) => {
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

    const result = verifyOtpToken("vendor", normalizedPhone, otp);
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
    console.error("verifyVendorForgotPasswordOtp Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify OTP.",
    });
  }
};

export const verifyOtp = verifyVendorForgotPasswordOtp;



  // =========================
// Send Login OTP
// =========================

export const sendLoginOtp = async (
  req,
  res
) => {
  try {
    const { phone } = req.body;

    const vendor =
      await Vendor.findOne({
        phone,
      });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message:
          "Vendor not found",
      });
    }

    // Registration Approval Check

    if (
      vendor.status ===
      "pending"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is under verification. Please wait for admin approval.",
      });
    }

    if (
      vendor.status ===
      "rejected"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Your vendor account has been rejected.",
      });
    }

    // Account Status Check

    if (
      vendor.accountStatus ===
      "hold"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is currently on hold.",
      });
    }

    if (
      vendor.accountStatus ===
      "suspended"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Your account has been suspended by admin.",
      });
    }

    if (
      vendor.accountStatus ===
      "deactivated"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Your account has been deactivated.",
      });
    }

    const otp =
      generateVendorOtp();

    vendor.otp = otp;

    vendor.otpExpiry =
      Date.now() +
      10 * 60 * 1000;

    await vendor.save();

    console.log(
      "================================"
    );

    console.log(
      "LOGIN OTP:",
      otp
    );

    console.log(
      "================================"
    );

    res.status(200).json({
      success: true,
      message:
        "OTP sent successfully",
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
// Verify Login OTP
// =========================

export const verifyLoginOtp =
  async (req, res) => {
    try {
      const {
        phone,
        otp,
      } = req.body;

      const vendor =
        await Vendor.findOne({
          phone,
        });

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message:
            "Vendor not found",
        });
      }

      // Registration Status Check

      if (
        vendor.status ===
        "pending"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is under verification. Please wait for admin approval.",
        });
      }

      if (
        vendor.status ===
        "rejected"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Your vendor account has been rejected.",
        });
      }

      // Account Status Check

      if (
        vendor.accountStatus ===
        "hold"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is currently on hold.",
        });
      }

      if (
        vendor.accountStatus ===
        "suspended"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Your account has been suspended by admin.",
        });
      }

      if (
        vendor.accountStatus ===
        "deactivated"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Your account has been deactivated.",
        });
      }

      // OTP Check

      if (
        vendor.otp !== otp
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid OTP",
        });
      }

      if (
        new Date() >
        vendor.otpExpiry
      ) {
        return res.status(400).json({
          success: false,
          message:
            "OTP expired",
        });
      }

      // Clear OTP

      vendor.otp = null;
      vendor.otpExpiry = null;

      await vendor.save();

      const token =
        generateVendorToken(
          vendor._id
        );

      res.status(200).json({
        success: true,
        message:
          "Login Successful",
        token,
        vendor,
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
// Reset Password (Vendor)
// =========================

export const resetVendorPassword = async (req, res) => {
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

    const tokenValidation = validateResetToken("vendor", normalizedPhone, resetToken);
    if (!tokenValidation.success) {
      return res.status(400).json({
        success: false,
        message: tokenValidation.message,
      });
    }

    const vendor = await findAccountByPhone(Vendor, "phone", normalizedPhone);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor account not found.",
      });
    }

    vendor.password = await bcrypt.hash(newPassword, 10);
    vendor.otp = null;
    vendor.otpExpiry = null;
    await vendor.save();

    consumeResetToken(tokenValidation.tokenKey);

    res.status(200).json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    console.error("resetVendorPassword Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to reset password.",
    });
  }
};

export const resetPassword = resetVendorPassword;