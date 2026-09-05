import CustomerOrder from "../../customer/models/CustomerOrder.js";
import User from "../../customer/models/User.js";
import { getNextInvoiceNumber } from "../../customer/controllers/orderController.js";
import { formatVendorScopedOrder } from "../../utils/financeSerializer.js";

// @desc    Get all customers with aggregated order stats for this vendor
// @route   GET /api/vendor/customers
// @access  Private/Vendor
export const getCustomers = async (req, res) => {
  try {
    const { search, status } = req.query;
    const vendorId = req.vendor._id;

    // 1. Get all customer IDs that have ordered from this vendor
    const orderQuery = { vendorId };
    
    // Aggregate order counts and totals per customer for this vendor
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

    if (orderStats.length === 0) {
      return res.status(200).json({ success: true, customers: [] });
    }

    const statsMap = new Map(
      orderStats.map((s) => [s._id ? s._id.toString() : "", s])
    );

    // Filter unique customer IDs
    const customerIds = orderStats
      .filter((s) => s._id)
      .map((s) => s._id);

    // 2. Fetch User profiles for these customer IDs
    const userQuery = { _id: { $in: customerIds } };
    if (search) {
      userQuery.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (status && status !== "all") {
      userQuery.status = status;
    }

    const users = await User.find(userQuery).select(
      "fullName email phoneNumber status createdAt profileImage"
    );

    // 3. Map user profile with vendor-specific stats
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
    console.error("Vendor Get Customers Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get all orders for a specific customer placed with this vendor
// @route   GET /api/vendor/customers/:id/orders
// @access  Private/Vendor
export const getCustomerOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.vendor._id;

    const orderQuery = { customerId: id, $or: [{ vendorId }, { "vendorSubOrders.vendorId": vendorId }] };

    const rawOrders = await CustomerOrder.find(orderQuery)
      .populate("vendorId", "shopName phone address")
      .populate("customerId", "fullName email phoneNumber")
      .sort({ createdAt: -1 });

    // Auto-assign invoiceNumber for any historical/existing orders missing one
    for (const order of rawOrders) {
      if (!order.invoiceNumber) {
        order.invoiceNumber = await getNextInvoiceNumber();
        await order.save();
      }
    }

    const orders = rawOrders.map(order => formatVendorScopedOrder(order, vendorId));

    res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error("Vendor Get Customer Orders Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
