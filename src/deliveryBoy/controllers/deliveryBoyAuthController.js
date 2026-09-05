import DeliveryBoy from "../models/DeliveryBoy.js";
import DeliveryBoyEarnings from "../models/DeliveryBoyEarnings.js";
import bcrypt from "bcryptjs";
import generateOtp from "../../utils/generateOtp.js";
import generateToken from "../../utils/generateToken.js";

// Register Delivery Boy
export const registerDeliveryBoy = async (req, res) => {
  try {
    const { fullName, phone, password, vehicleType, vehicleNumber } = req.body;

    if (!fullName || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    const deliveryBoyExists = await DeliveryBoy.findOne({ phone });

    if (deliveryBoyExists) {
      return res.status(400).json({
        success: false,
        message: "Delivery Boy already exists with this phone number",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOtp();

    const deliveryBoy = await DeliveryBoy.create({
      fullName,
      phone,
      password: hashedPassword,
      vehicleDetails: {
        type: vehicleType || "Bike",
        number: vehicleNumber || "",
      },
      status: "approved", // approved by default for quick testing
      accountStatus: "active",
      onboardingStatus: "signup_pending",
      otp,
      otpExpiry: Date.now() + 10 * 60 * 1000
    });

    console.log("================================");
    console.log(`DELIVERY BOY SIGNUP OTP FOR ${phone}: ${otp}`);
    console.log("================================");

    // Initialize Earnings records
    await DeliveryBoyEarnings.create({
      deliveryBoy: deliveryBoy._id,
      totalEarnings: 0,
      incentives: 0,
      commissions: 0,
      walletBalance: 0,
      pendingBalance: 0,
      settledBalance: 0,
    });

    const token = generateToken(deliveryBoy._id);

    res.status(201).json({
      success: true,
      message: "Delivery Boy registered successfully. Please verify OTP.",
      deliveryBoy,
      token,
    });
  } catch (error) {
    console.error("Register Delivery Boy Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};

// Login Delivery Boy
export const loginDeliveryBoy = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide phone number and password",
      });
    }

    const deliveryBoy = await DeliveryBoy.findOne({ phone });

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    if (deliveryBoy.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: `Your account is pending verification or rejected. Current status: ${deliveryBoy.status}`,
      });
    }

    if (deliveryBoy.accountStatus !== "active") {
      return res.status(403).json({
        success: false,
        message: `Your account is currently ${deliveryBoy.accountStatus}.`,
      });
    }

    const isMatch = await bcrypt.compare(password, deliveryBoy.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = generateToken(deliveryBoy._id);

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      deliveryBoy,
    });
  } catch (error) {
    console.error("Login Delivery Boy Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// Send Login OTP
export const sendLoginOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    const deliveryBoy = await DeliveryBoy.findOne({ phone });

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    if (deliveryBoy.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: `Your account status is ${deliveryBoy.status}.`,
      });
    }

    if (deliveryBoy.accountStatus !== "active") {
      return res.status(403).json({
        success: false,
        message: `Your account is ${deliveryBoy.accountStatus}.`,
      });
    }

    const otp = generateOtp();
    deliveryBoy.otp = otp;
    deliveryBoy.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

    await deliveryBoy.save();

    console.log("================================");
    console.log(`DELIVERY BOY LOGIN OTP FOR ${phone}: ${otp}`);
    console.log("================================");

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Send Login OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// Verify Login OTP
export const verifyLoginOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required",
      });
    }

    const deliveryBoy = await DeliveryBoy.findOne({ phone });

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    if (deliveryBoy.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (new Date() > deliveryBoy.otpExpiry) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    deliveryBoy.otp = null;
    deliveryBoy.otpExpiry = null;
    await deliveryBoy.save();

    const token = generateToken(deliveryBoy._id);

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      deliveryBoy,
    });
  } catch (error) {
    console.error("Verify Login OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// Forgot Password
export const forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    const deliveryBoy = await DeliveryBoy.findOne({ phone });

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy account not found",
      });
    }

    const otp = generateOtp();
    deliveryBoy.otp = otp;
    deliveryBoy.otpExpiry = Date.now() + 10 * 60 * 1000;

    await deliveryBoy.save();

    console.log("================================");
    console.log(`DELIVERY BOY FORGOT PASSWORD OTP FOR ${phone}: ${otp}`);
    console.log("================================");

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// Verify OTP
export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: "Phone and OTP are required" });
    }

    const deliveryBoy = await DeliveryBoy.findOne({ phone });

    if (!deliveryBoy) {
      return res.status(404).json({ success: false, message: "Delivery boy not found" });
    }

    if (deliveryBoy.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (new Date() > deliveryBoy.otpExpiry) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    if (deliveryBoy.onboardingStatus === "signup_pending") {
      deliveryBoy.onboardingStatus = "kyc_pending";
    }

    deliveryBoy.otp = null;
    deliveryBoy.otpExpiry = null;
    await deliveryBoy.save();

    res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      onboardingStatus: deliveryBoy.onboardingStatus
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Reset Password
export const resetPassword = async (req, res) => {
  try {
    const { phone, newPassword } = req.body;

    if (!phone || !newPassword) {
      return res.status(400).json({ success: false, message: "Phone and password are required" });
    }

    const deliveryBoy = await DeliveryBoy.findOne({ phone });

    if (!deliveryBoy) {
      return res.status(404).json({ success: false, message: "Delivery boy not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    deliveryBoy.password = hashedPassword;
    deliveryBoy.otp = null;
    deliveryBoy.otpExpiry = null;

    await deliveryBoy.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
