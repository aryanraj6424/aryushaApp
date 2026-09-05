import CustomerOrder from "../../customer/models/CustomerOrder.js";
import User from "../../customer/models/User.js";

// @desc    Get all customers with aggregated order stats
// @route   GET /api/admin/customers
// @access  Private/Admin
export const getCustomers = async (req, res) => {
  try {
    const { search, vendor, status, dateFrom, dateTo } = req.query;

    // Build user query
    const userQuery = {};
    if (search) {
      userQuery.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(userQuery).select(
      "fullName email phoneNumber status createdAt profileImage"
    );

    // Build order query for stats
    const orderQuery = {};
    if (vendor) orderQuery.vendorId = vendor;
    if (status) orderQuery.orderStatus = status;
    if (dateFrom || dateTo) {
      orderQuery.createdAt = {};
      if (dateFrom) orderQuery.createdAt.$gte = new Date(dateFrom);
      if (dateTo) orderQuery.createdAt.$lte = new Date(dateTo);
    }

    // Aggregate order counts and totals per customer
    const orderStats = await CustomerOrder.aggregate([
      { $match: orderQuery },
      {
        $group: {
          _id: "$customerId",
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: "$grandTotal" },
        },
      },
    ]);

    const statsMap = new Map(
      orderStats.map((s) => [s._id.toString(), s])
    );

    const customers = users.map((u) => {
      const stats = statsMap.get(u._id.toString()) || {
        totalOrders: 0,
        totalSpent: 0,
      };
      return {
        _id: u._id,
        fullName: u.fullName,
        email: u.email,
        phoneNumber: u.phoneNumber,
        status: u.status || "active",
        createdAt: u.createdAt,
        profileImage: u.profileImage,
        totalOrders: stats.totalOrders,
        totalSpent: stats.totalSpent,
      };
    });

    res.status(200).json({ success: true, customers });
  } catch (error) {
    console.error("Admin Get Customers Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get all orders for a specific customer
// @route   GET /api/admin/customers/:id/orders
// @access  Private/Admin
export const getCustomerOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, vendor, dateFrom, dateTo } = req.query;

    const orderQuery = { customerId: id };
    if (status) orderQuery.orderStatus = status;
    if (vendor) orderQuery.vendorId = vendor;
    if (dateFrom || dateTo) {
      orderQuery.createdAt = {};
      if (dateFrom) orderQuery.createdAt.$gte = new Date(dateFrom);
      if (dateTo) orderQuery.createdAt.$lte = new Date(dateTo);
    }

    const orders = await CustomerOrder.find(orderQuery)
      .populate("vendorId", "shopName phone address")
      .populate("customerId", "fullName email phoneNumber")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error("Admin Get Customer Orders Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
