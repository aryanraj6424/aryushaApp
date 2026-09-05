import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Vendor from "./vendor/models/Vendor.js";
import VendorNotification from "./vendor/models/VendorNotification.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const mongoUri = "mongodb://localhost:27017/quickkart";

async function testVendor2() {
  try {
    await mongoose.connect(mongoUri);
    console.log("=== DB Connected ===");

    const targetVendorId = "6a86ca2907d84af95967af94";
    const vendor = await Vendor.findById(targetVendorId);
    console.log("Vendor 2 in DB:", vendor ? { _id: vendor._id, status: vendor.status, accountStatus: vendor.accountStatus, shopName: vendor.shopName } : "NOT FOUND");

    if (!vendor) return;

    // Check unread count for Vendor 2 before
    const unreadBefore = await VendorNotification.countDocuments({ vendorId: vendor._id, read: { $ne: true } });
    console.log("Vendor 2 unread BEFORE HTTP PATCH:", unreadBefore);

    // Generate token for Vendor 2
    const token = jwt.sign({ id: vendor._id.toString(), role: "vendor" }, process.env.JWT_SECRET || "fallback_secret", { expiresIn: "1d" });

    // Send HTTP PATCH request to mark-all read
    console.log("\n--- Sending HTTP PATCH /api/vendor/notifications/read-all ---");
    try {
      const res = await axios.patch(
        "http://localhost:5000/api/vendor/notifications/read-all",
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      console.log("HTTP Response:", res.status, res.data);
    } catch (err) {
      console.error("HTTP Request Error:", err.response?.status, err.response?.data || err.message);
    }

    // Check unread count for Vendor 2 after
    const unreadAfter = await VendorNotification.countDocuments({ vendorId: vendor._id, read: { $ne: true } });
    console.log("Vendor 2 unread AFTER HTTP PATCH:", unreadAfter);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

testVendor2();
