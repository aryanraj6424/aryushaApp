import express from "express";
import jwt from "jsonwebtoken";
import User from "../customer/models/User.js";
import Admin from "../admin/models/Admin.js";
import Vendor from "../vendor/models/Vendor.js";
import DeliveryBoy from "../deliveryBoy/models/DeliveryBoy.js";
import { uploadMiddleware } from "../middleware/uploadMiddleware.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/imageUpload.js";

const router = express.Router();

// Middleware to protect upload & delete for any authenticated user
const protectUpload = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized - No Token Provided" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded._id;
    const user = (await User.findById(userId)) ||
                 (await Admin.findById(userId)) ||
                 (await Vendor.findById(userId)) ||
                 (await DeliveryBoy.findById(userId));
    if (!user) {
      return res.status(401).json({ success: false, message: "Account Not Found" });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Token Invalid or Expired" });
  }
};

router.use(protectUpload);

// Upload endpoint
router.post("/", uploadMiddleware.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const folder = req.body.folder || req.query.folder || "general";
    const result = await uploadToCloudinary(req.file.buffer, folder);

    res.status(200).json({
      success: true,
      message: "File uploaded successfully to Cloudinary",
      url: result.secure_url,
      public_id: result.public_id,
    });
  } catch (error) {
    console.error("Upload route error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload image to Cloudinary",
    });
  }
});

// Delete endpoint
router.post("/delete", async (req, res) => {
  try {
    const { public_id } = req.body;
    if (!public_id) {
      return res.status(400).json({ success: false, message: "public_id is required" });
    }

    await deleteFromCloudinary(public_id);

    res.status(200).json({
      success: true,
      message: "Asset deleted successfully from Cloudinary",
    });
  } catch (error) {
    console.error("Delete route error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete image from Cloudinary",
    });
  }
});

export default router;
