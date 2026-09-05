import User from "../models/User.js";
import bcrypt from "bcryptjs";
import generateOtp from "../../utils/generateOtp.js";
import generateToken from "../../utils/generateToken.js";
import Vendor from "../../vendor/models/Vendor.js";
import DeliveryBoy from "../../deliveryBoy/models/DeliveryBoy.js";
import Admin from "../../admin/models/Admin.js";
import { generateVendorToken } from "../../vendor/utils/generateVendorToken.js";
import { generateAdminToken } from "../../admin/utils/generateAdminToken.js";
import { verifyGoogleToken } from "../../config/googleOAuth.js";
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

const sanitizeUser = (user) => {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.otp;
  delete obj.otpExpires;
  return obj;
};

/*
|--------------------------------------------------------------------------
| Signup
|--------------------------------------------------------------------------
*/
export const signup = async (req, res) => {
  try {
    const { fullName, phoneNumber, email, password } = req.body;

    const rawInput = (phoneNumber || "").trim();
    const isEmailInput = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawInput);

    let finalEmail = (email || "").trim().toLowerCase();
    let finalPhone = (isEmailInput ? "" : rawInput);

    if (isEmailInput && !finalEmail) {
      finalEmail = rawInput.toLowerCase();
    }

    if (!fullName?.trim()) {
      return res.status(400).json({ success: false, message: "Full name is required." });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters long." });
    }

    const query = [];
    if (finalPhone) query.push({ phoneNumber: finalPhone });
    if (finalEmail) query.push({ email: finalEmail });

    if (query.length > 0) {
      const userExists = await User.findOne({ $or: query });
      if (userExists) {
        return res.status(400).json({ success: false, message: "User already exists with this phone number or email." });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      fullName: fullName.trim(),
      phoneNumber: finalPhone || undefined,
      email: finalEmail,
      password: hashedPassword,
    });
    const token = generateToken(user._id);

    res.status(201).json({ success: true, message: "Account Created Successfully", user: sanitizeUser(user), token });
  } catch (error) {
    console.error("SIGNUP ERROR:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
*/
export const login = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    const input = (phoneNumber || "").trim();

    if (!input || !password) {
      return res.status(400).json({ success: false, message: "Please provide credentials." });
    }

    const user = await User.findOne({
      $or: [{ phoneNumber: input }, { email: input.toLowerCase() }],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid Credentials" });
    }

    const token = generateToken(user._id);
    res.status(200).json({ success: true, message: "Login Successful", user: sanitizeUser(user), token });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/*
|--------------------------------------------------------------------------
| Google OAuth Login / Signup
| Verifies a Google ID token (from GIS frontend) without Firebase.
|--------------------------------------------------------------------------
*/
export const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, message: "Google ID token is required." });
    }

    // Verify with google-auth-library
    const { email, name, picture, googleId } = await verifyGoogleToken(idToken);

    if (!email) {
      return res.status(400).json({ success: false, message: "Google account has no email." });
    }

    // Find existing user by googleId or email
    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      // Sync Google fields in case they changed
      if (!user.googleId) user.googleId = googleId;
      if (picture && !user.photoURL) user.photoURL = picture;
      user.provider = "google";
      await user.save();
    } else {
      // First-time Google sign-up — create account
      user = await User.create({
        fullName: name,
        email,
        googleId,
        photoURL: picture,
        provider: "google",
        isVerified: true,
      });
    }

    const token = generateToken(user._id);
    res.status(200).json({ success: true, message: "Google login successful", user: sanitizeUser(user), token });
  } catch (error) {
    console.error("Google Login Error:", error);
    res.status(401).json({
      success: false,
      message: "Google authentication failed. Please try again.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Forgot Password - 3-Step WhatsApp OTP Flow (Customer)
|--------------------------------------------------------------------------
*/

// 1. Send OTP
export const sendCustomerForgotPasswordOtp = async (req, res) => {
  try {
    const phoneInput = req.body.phone || req.body.phoneNumber;
    const normalizedPhone = normalizePhoneNumber(phoneInput);

    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number. Please enter a valid 10-digit mobile number.",
      });
    }

    const user = await findAccountByPhone(User, "phoneNumber", normalizedPhone);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found with this phone number.",
      });
    }

    const otp = generateRandomOtp();
    await sendWhatsappOtp(normalizedPhone, otp);
    storeOtp("customer", normalizedPhone, otp);

    res.status(200).json({
      success: true,
      message: "WhatsApp OTP sent successfully.",
    });
  } catch (error) {
    console.error("sendCustomerForgotPasswordOtp Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to send WhatsApp OTP.",
    });
  }
};

export const forgotPassword = sendCustomerForgotPasswordOtp;

// 2. Verify OTP
export const verifyCustomerForgotPasswordOtp = async (req, res) => {
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

    const result = verifyOtpToken("customer", normalizedPhone, otp);
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
    console.error("verifyCustomerForgotPasswordOtp Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify OTP.",
    });
  }
};

export const verifyOtp = verifyCustomerForgotPasswordOtp;

// 3. Reset Password
export const resetCustomerPassword = async (req, res) => {
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

    const tokenValidation = validateResetToken("customer", normalizedPhone, resetToken);
    if (!tokenValidation.success) {
      return res.status(400).json({
        success: false,
        message: tokenValidation.message,
      });
    }

    const user = await findAccountByPhone(User, "phoneNumber", normalizedPhone);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    consumeResetToken(tokenValidation.tokenKey);

    res.status(200).json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    console.error("resetCustomerPassword Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to reset password.",
    });
  }
};

export const resetPassword = resetCustomerPassword;

/*
|--------------------------------------------------------------------------
| Update Profile
|--------------------------------------------------------------------------
*/
export const updateProfile = async (req, res) => {
  try {
    const { fullName, phoneNumber, email } = req.body;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!fullName?.trim()) {
      return res.status(400).json({ success: false, message: "Full name is required." });
    }

    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = (phoneNumber || "").trim();

    // Validate Email format if provided
    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ success: false, message: "Please enter a valid email address." });
      }

      // Uniqueness check for email against other users
      const existingEmail = await User.findOne({ email: cleanEmail, _id: { $ne: userId } });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: "Email is already in use by another account." });
      }
    }

    // Validate Phone Number format if provided
    if (cleanPhone) {
      const phoneRegex = /^\d{10}$/;
      if (!phoneRegex.test(cleanPhone)) {
        return res.status(400).json({ success: false, message: "Please enter a valid 10-digit phone number." });
      }

      // Uniqueness check for phone number against other users
      const existingPhone = await User.findOne({ phoneNumber: cleanPhone, _id: { $ne: userId } });
      if (existingPhone) {
        return res.status(400).json({ success: false, message: "Phone number is already registered to another account." });
      }
    }

    const updateFields = {
      fullName: fullName.trim(),
      email: cleanEmail,
    };

    if (cleanPhone) {
      updateFields.phoneNumber = cleanPhone;
    } else {
      updateFields.$unset = { phoneNumber: 1 };
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, message: "Profile updated successfully.", user: sanitizeUser(updated) });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update profile." });
  }
};
