import express from "express";
import {
  getVendorNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead
} from "../controllers/vendorNotificationController.js";
import { protectVendor } from "../middleware/vendorAuthMiddleware.js";

const router = express.Router();

router.use(protectVendor);

router.get("/", getVendorNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);

export default router;
