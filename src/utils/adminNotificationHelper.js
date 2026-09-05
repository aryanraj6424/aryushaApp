import AdminNotification from "../admin/models/AdminNotification.js";
import { emitToRoom } from "../socket/socketManager.js";

/**
 * Safely create an Admin notification and emit real-time socket event.
 * Wrapped in try/catch to ensure notification failures never break core business logic.
 */
export async function createAdminNotification({
  title,
  message,
  type = "GENERAL",
  relatedVendorId = null,
  relatedOrderId = null,
  session = null
}) {
  try {
    const options = session ? { session } : {};

    const [notification] = await AdminNotification.create(
      [
        {
          title,
          message,
          type,
          relatedVendorId: relatedVendorId || null,
          relatedOrderId: relatedOrderId || null,
          read: false
        }
      ],
      options
    );

    // Emit live socket event to the global admin room
    emitToRoom("admin:global", "admin:notification", notification);

    return notification;
  } catch (error) {
    console.error("[AdminNotificationHelper] Failed to create admin notification:", error.message);
    return null;
  }
}
