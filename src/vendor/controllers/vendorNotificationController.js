import VendorNotification from "../models/VendorNotification.js";

// @desc    Get paginated vendor notifications
// @route   GET /api/vendor/notifications
// @access  Private (Vendor)
export const getVendorNotifications = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const rawNotifications = await VendorNotification.find({ vendorId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const notifications = rawNotifications.map((item) => ({
      ...item,
      read: Boolean(item.read || item.isRead),
      isRead: Boolean(item.read || item.isRead)
    }));

    const total = await VendorNotification.countDocuments({ vendorId });
    const unreadCount = await VendorNotification.countDocuments({ vendorId, read: { $ne: true } });

    res.status(200).json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get Vendor Notifications Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get unread notification count
// @route   GET /api/vendor/notifications/unread-count
// @access  Private (Vendor)
export const getUnreadCount = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const count = await VendorNotification.countDocuments({ vendorId, read: { $ne: true } });

    res.status(200).json({
      success: true,
      count
    });
  } catch (error) {
    console.error("Get Unread Count Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Mark single notification as read
// @route   PATCH /api/vendor/notifications/:id/read
// @access  Private (Vendor)
export const markNotificationRead = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const { id } = req.params;

    const notification = await VendorNotification.findOneAndUpdate(
      { _id: id, vendorId },
      { $set: { read: true, isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    const unreadCount = await VendorNotification.countDocuments({ vendorId, read: { $ne: true } });

    res.status(200).json({
      success: true,
      notification,
      unreadCount
    });
  } catch (error) {
    console.error("Mark Read Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Mark all vendor notifications as read
// @route   PATCH /api/vendor/notifications/read-all
// @access  Private (Vendor)
export const markAllNotificationsRead = async (req, res) => {
  try {
    const vendorId = req.vendor._id;

    await VendorNotification.updateMany(
      { vendorId, read: { $ne: true } },
      { $set: { read: true, isRead: true } }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      unreadCount: 0
    });
  } catch (error) {
    console.error("Mark All Read Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
