import mongoose from "mongoose";
import AdminNotification from "./admin/models/AdminNotification.js";
import VendorNotification from "./vendor/models/VendorNotification.js";
import { markAdminNotificationRead, markAllAdminNotificationsRead } from "./admin/controllers/adminNotificationController.js";
import { markNotificationRead, markAllNotificationsRead } from "./vendor/controllers/vendorNotificationController.js";

const mongoUri = "mongodb://localhost:27017/quickkart";

async function testEndpoints() {
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to DB");

    // Get an admin notification
    const adminNotif = await AdminNotification.findOne({ read: false });
    if (adminNotif) {
      console.log("Testing markAdminNotificationRead for ID:", adminNotif._id);
      const req = { params: { id: adminNotif._id.toString() } };
      let resData = {};
      const res = {
        status: () => res,
        json: (data) => { resData = data; }
      };
      await markAdminNotificationRead(req, res);
      console.log("Result markAdminNotificationRead:", resData);

      // Check DB
      const updatedAdminNotif = await AdminNotification.findById(adminNotif._id);
      console.log("Updated AdminNotif in DB read status:", updatedAdminNotif.read);
    } else {
      console.log("No unread AdminNotification found to test.");
    }

    // Get a vendor notification
    const vendorNotif = await VendorNotification.findOne({ read: false });
    if (vendorNotif) {
      console.log("Testing markNotificationRead for ID:", vendorNotif._id, "vendorId:", vendorNotif.vendorId);
      const req = {
        params: { id: vendorNotif._id.toString() },
        vendor: { _id: vendorNotif.vendorId }
      };
      let resData = {};
      const res = {
        status: () => res,
        json: (data) => { resData = data; }
      };
      await markNotificationRead(req, res);
      console.log("Result markNotificationRead:", resData);

      // Check DB
      const updatedVendorNotif = await VendorNotification.findById(vendorNotif._id);
      console.log("Updated VendorNotif in DB read status:", updatedVendorNotif.read);
    } else {
      console.log("No unread VendorNotification found to test.");
    }

  } catch (err) {
    console.error("Test error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

testEndpoints();
