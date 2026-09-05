import axios from "axios";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
|--------------------------------------------------------------------------
| In-Memory Storage for OTPs and Reset Tokens
|--------------------------------------------------------------------------
| NOTE: Currently using an in-memory Map for storing active OTPs and reset
| tokens. In production, this can be easily swapped for Redis by replacing
| the set/get/delete calls below with Redis async methods (e.g., redisClient.setEx / redisClient.get).
|--------------------------------------------------------------------------
*/

const otpStore = new Map();
const tokenStore = new Map();

// Helper to normalize phone numbers to 91 + 10 digits
export const normalizePhoneNumber = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }
  return null;
};

// Lookup user by phone considering various stored phone formats (10-digit, 91+10-digit, +91+10-digit)
export const findAccountByPhone = async (Model, phoneField, normalizedPhone) => {
  const raw10Digits = normalizedPhone.slice(2);
  const possibleValues = [
    normalizedPhone,
    raw10Digits,
    `+${normalizedPhone}`,
    `+91${raw10Digits}`,
    `0${raw10Digits}`
  ];
  return await Model.findOne({ [phoneField]: { $in: possibleValues } });
};

// Generate 6-digit random numeric OTP
export const generateRandomOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send WhatsApp OTP via Fast2SMS API
export const sendWhatsappOtp = async (normalizedPhone, otp) => {
  const apiKey = (process.env.FAST2SMS_API_KEY || "").trim();
  const messageId = (process.env.FAST2SMS_MESSAGE_ID || "").trim();
  const phoneNumberId = (process.env.FAST2SMS_PHONE_NUMBER_ID || "").trim();

  const isPlaceholder = (val) => !val || val.includes("your_") || val.includes("YOUR_") || val.includes("sample_");

  console.log("DEBUG apiKey:", JSON.stringify(apiKey), "length:", apiKey?.length);
  console.log("DEBUG messageId:", JSON.stringify(messageId), "length:", messageId?.length);
  console.log("DEBUG phoneNumberId:", JSON.stringify(phoneNumberId), "length:", phoneNumberId?.length);

  if (isPlaceholder(apiKey) || isPlaceholder(messageId) || isPlaceholder(phoneNumberId)) {
    console.warn(`[DEV MODE] Fast2SMS credentials not fully set in .env. OTP for ${normalizedPhone}: ${otp}`);
    return { success: true, devMode: true };
  }

  try {
    const url = "https://www.fast2sms.com/dev/whatsapp";
    const response = await axios.get(url, {
      params: {
        message_id: messageId,
        phone_number_id: phoneNumberId,
        numbers: normalizedPhone,
        variables_values: otp,
      },
      headers: {
        Authorization: apiKey,
      },
    });

    if (response.data && response.data.return === false) {
      throw new Error(response.data.message || "Fast2SMS API returned a failure response.");
    }

    return { success: true, data: response.data };
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message || "Unknown Fast2SMS Error";
    console.error("Fast2SMS WhatsApp API Error:", error.response?.data || error.message);
    
    // In development mode, fallback gracefully if API key is invalid/expired so dev workflow continues:
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[DEV FALLBACK] Fast2SMS API call failed (${errorMsg}). OTP for ${normalizedPhone}: ${otp}`);
      return { success: true, devMode: true, fallback: true, error: errorMsg };
    }
    
    throw new Error(`Failed to send WhatsApp OTP via Fast2SMS: ${errorMsg}`);
  }
};

// Storage key format: `${role}:${normalizedPhone}`
const getStorageKey = (role, normalizedPhone) => `${role.toLowerCase()}:${normalizedPhone}`;

// Store OTP with 5 minute expiry & max 5 attempts
export const storeOtp = (role, normalizedPhone, otp) => {
  const key = getStorageKey(role, normalizedPhone);
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  otpStore.set(key, {
    otp,
    expiresAt,
    attempts: 0,
    maxAttempts: 5,
  });
};

// Verify OTP
export const verifyOtpToken = (role, normalizedPhone, userOtp) => {
  const key = getStorageKey(role, normalizedPhone);
  const record = otpStore.get(key);

  if (!record) {
    return { success: false, reason: "NOT_FOUND", message: "OTP not found or expired. Please request a new OTP." };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    return { success: false, reason: "EXPIRED", message: "OTP has expired. Please request a new OTP." };
  }

  if (record.attempts >= record.maxAttempts) {
    otpStore.delete(key);
    return { success: false, reason: "TOO_MANY_ATTEMPTS", message: "Maximum verification attempts exceeded (5). Please request a new OTP." };
  }

  record.attempts += 1;

  if (record.otp !== String(userOtp).trim()) {
    return {
      success: false,
      reason: "WRONG_OTP",
      message: `Invalid OTP. ${record.maxAttempts - record.attempts} attempt(s) remaining.`,
    };
  }

  // Verification succeeded - clear OTP and issue a short-lived reset token (10 min expiry)
  otpStore.delete(key);
  const resetToken = crypto.randomBytes(32).toString("hex");
  const tokenKey = `${key}:${resetToken}`;
  tokenStore.set(tokenKey, {
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });

  return { success: true, resetToken };
};

// Validate reset token before resetting password
export const validateResetToken = (role, normalizedPhone, resetToken) => {
  const key = getStorageKey(role, normalizedPhone);
  const tokenKey = `${key}:${resetToken}`;
  const record = tokenStore.get(tokenKey);

  if (!record) {
    return { success: false, message: "Invalid or expired reset token. Please restart the forgot password process." };
  }

  if (Date.now() > record.expiresAt) {
    tokenStore.delete(tokenKey);
    return { success: false, message: "Reset token has expired (10 min timeout). Please request a new OTP." };
  }

  return { success: true, tokenKey };
};

// Clean up consumed reset token
export const consumeResetToken = (tokenKey) => {
  tokenStore.delete(tokenKey);
};
