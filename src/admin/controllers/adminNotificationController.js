import AdminNotification from "../models/AdminNotification.js";

// @desc    Get paginated admin notifications
// @route   GET /api/admin/notifications
// @access  Private (Admin)
export const getAdminNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const rawNotifications = await AdminNotification.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const notifications = rawNotifications.map((item) => ({
      ...item,
      read: Boolean(item.read || item.isRead),
      isRead: Boolean(item.read || item.isRead)
    }));

    const total = await AdminNotification.countDocuments();
    const unreadCount = await AdminNotification.countDocuments({ read: { $ne: true } });

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
    console.error("Get Admin Notifications Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get unread notification count
// @route   GET /api/admin/notifications/unread-count
// @access  Private (Admin)
export const getAdminUnreadCount = async (req, res) => {
  try {
    const count = await AdminNotification.countDocuments({ read: { $ne: true } });

    res.status(200).json({
      success: true,
      count
    });
  } catch (error) {
    console.error("Get Admin Unread Count Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Mark single admin notification as read
// @route   PATCH /api/admin/notifications/:id/read
// @access  Private (Admin)
export const markAdminNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await AdminNotification.findByIdAndUpdate(
      id,
      { $set: { read: true, isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    const unreadCount = await AdminNotification.countDocuments({ read: { $ne: true } });

    res.status(200).json({
      success: true,
      notification,
      unreadCount
    });
  } catch (error) {
    console.error("Mark Admin Read Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Mark all admin notifications as read
// @route   PATCH /api/admin/notifications/read-all
// @access  Private (Admin)
export const markAllAdminNotificationsRead = async (req, res) => {
  try {
    await AdminNotification.updateMany(
      { read: { $ne: true } },
      { $set: { read: true, isRead: true } }
    );

    res.status(200).json({
      success: true,
      message: "All admin notifications marked as read",
      unreadCount: 0
    });
  } catch (error) {
    console.error("Mark All Admin Read Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
