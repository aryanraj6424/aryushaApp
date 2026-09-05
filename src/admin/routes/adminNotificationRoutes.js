import express from "express";
import {
  getAdminNotifications,
  getAdminUnreadCount,
  markAdminNotificationRead,
  markAllAdminNotificationsRead
} from "../controllers/adminNotificationController.js";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";

const router = express.Router();

router.use(protectAdmin);

router.get("/", getAdminNotifications);
router.get("/unread-count", getAdminUnreadCount);
router.patch("/read-all", markAllAdminNotificationsRead);
router.patch("/:id/read", markAdminNotificationRead);

export default router;
