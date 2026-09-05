import jwt from "jsonwebtoken";
import Vendor from "../models/Vendor.js";
import Admin from "../../admin/models/Admin.js";

export const protectVendor = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No Token Provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 1. Try finding Vendor account
    const vendor = await Vendor.findById(decoded.id).select("-password");

    if (vendor) {
      // Check Approval Status
      if (vendor.status !== "approved") {
        return res.status(403).json({
          success: false,
          message: `Access Denied - Account status is '${vendor.status}'`,
        });
      }

      // Check Account Status (active, hold, suspended, deactivated)
      if (vendor.accountStatus !== "active") {
        return res.status(403).json({
          success: false,
          message: `Access Denied - Account is ${vendor.accountStatus}`,
        });
      }

      req.vendor = vendor;
      return next();
    }

    // 2. Fallback: Check if Admin account
    const admin = await Admin.findById(decoded.id).select("-password");

    if (admin) {
      req.admin = admin;
      const targetVendorId = req.body?.vendorId || req.query?.vendorId;
      if (targetVendorId) {
        req.vendor = await Vendor.findById(targetVendorId);
      }
      return next();
    }

    return res.status(404).json({
      success: false,
      message: "Account Not Found",
    });
  } catch (error) {
    console.error("Vendor Auth Error:", error);
    res.status(401).json({
      success: false,
      message: "Token Invalid or Expired",
    });
  }
};
