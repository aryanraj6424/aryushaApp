import VendorNotification from "../vendor/models/VendorNotification.js";
import { emitToRoom } from "../socket/socketManager.js";

/**
 * Safely create a vendor notification and emit real-time socket event.
 * Wrapped in try/catch to ensure notification failures never break core business logic.
 */
export async function createVendorNotification({
  vendorId,
  title,
  message,
  type = "GENERAL",
  relatedOrderId = null,
  relatedProductId = null,
  session = null
}) {
  try {
    if (!vendorId) return null;

    // De-duplication check for LOW_STOCK notifications:
    // Avoid creating duplicate unread low-stock notifications for the same product within 1 hour
    if (type === "LOW_STOCK" && relatedProductId) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const existing = await VendorNotification.findOne({
        vendorId,
        type: "LOW_STOCK",
        relatedProductId,
        read: false,
        createdAt: { $gte: oneHourAgo }
      });
      if (existing) {
        return existing;
      }
    }

    const options = session ? { session } : {};

    const [notification] = await VendorNotification.create(
      [
        {
          vendorId,
          title,
          message,
          type,
          relatedOrderId: relatedOrderId || null,
          relatedProductId: relatedProductId || null,
          read: false
        }
      ],
      options
    );

    // Emit live socket event to the vendor's socket room
    emitToRoom(`vendor:${vendorId}`, "vendor:notification", notification);

    return notification;
  } catch (error) {
    console.error("[NotificationHelper] Failed to create vendor notification:", error.message);
    return null;
  }
}
