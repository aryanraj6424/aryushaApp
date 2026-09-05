import Vendor from "../../vendor/models/Vendor.js";
import { Product } from "../../models/catalog.js";
import CustomerOrder from "../../customer/models/CustomerOrder.js";
import User from "../../customer/models/User.js";

// Active/non-cancelled order statuses
const ACTIVE_STATUS_FILTER = { $nin: ["Cancelled", "cancelled", "Rejected", "rejected"] };

// @desc    Get real platform analytics & stats for Admin Dashboard
// @route   GET /api/admin/analytics/stats
// @access  Private (Admin)
export const getAdminAnalyticsStats = async (req, res) => {
  try {
    // 1. Vendor Counts
    const totalVendors = await Vendor.countDocuments();
    const pendingVendors = await Vendor.countDocuments({ status: "pending" });
    const approvedVendors = await Vendor.countDocuments({ status: "approved" });
    const rejectedVendors = await Vendor.countDocuments({ status: "rejected" });

    // 2. Catalog & User Counts
    const totalProducts = await Product.countDocuments({ isDeleted: { $ne: true } });
    const totalOrders = await CustomerOrder.countDocuments();
    const totalCustomers = await User.countDocuments();

    // 3. Platform Revenue
    const revenueAgg = await CustomerOrder.aggregate([
      { $match: { orderStatus: ACTIVE_STATUS_FILTER } },
      { $group: { _id: null, total: { $sum: "$grandTotal" } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // 4. Month-over-Month Revenue Growth %
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisMonthOrders = await CustomerOrder.aggregate([
      { $match: { createdAt: { $gte: startOfThisMonth }, orderStatus: ACTIVE_STATUS_FILTER } },
      { $group: { _id: null, total: { $sum: "$grandTotal" } } }
    ]);

    const lastMonthOrders = await CustomerOrder.aggregate([
      { $match: { createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth }, orderStatus: ACTIVE_STATUS_FILTER } },
      { $group: { _id: null, total: { $sum: "$grandTotal" } } }
    ]);

    const thisMonthRev = thisMonthOrders[0]?.total || 0;
    const lastMonthRev = lastMonthOrders[0]?.total || 0;

    let growthPct = 0;
    if (lastMonthRev > 0) {
      growthPct = Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100);
    } else if (thisMonthRev > 0) {
      growthPct = 100;
    }

    res.status(200).json({
      success: true,
      vendorOverview: {
        totalVendors,
        pendingVendors,
        approvedVendors,
        rejectedVendors
      },
      analytics: {
        totalProducts,
        totalOrders,
        totalCustomers,
        totalVendors,
        totalRevenue,
        growthPct
      }
    });
  } catch (error) {
    console.error("Admin Analytics Error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch analytics" });
  }
};

// @desc    Get detailed real platform analytics for Reports & Analytics screen
// @route   GET /api/admin/analytics/reports
// @access  Private (Admin)
export const getReportsAnalytics = async (req, res) => {
  try {
    const totalOrders = await CustomerOrder.countDocuments();
    const totalCustomers = await User.countDocuments();
    const totalProducts = await Product.countDocuments({ isDeleted: { $ne: true } });

    const revenueAgg = await CustomerOrder.aggregate([
      { $match: { orderStatus: ACTIVE_STATUS_FILTER } },
      { $group: { _id: null, total: { $sum: "$grandTotal" } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;
    const averageOrderValue = totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0;

    // Top selling products aggregation
    const topProductsAgg = await CustomerOrder.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          totalQty: { $sum: "$items.qty" },
          totalSales: { $sum: { $multiply: ["$items.price", "$items.qty"] } }
        }
      },
      { $sort: { totalQty: -1 } },
      { $limit: 5 }
    ]);

    const topProducts = topProductsAgg.map(p => ({
      name: p._id || "Unknown Product",
      qty: p.totalQty,
      sales: Math.round((p.totalSales + Number.EPSILON) * 100) / 100
    }));

    // Month-over-Month Growth
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisMonthRevAgg = await CustomerOrder.aggregate([
      { $match: { createdAt: { $gte: startOfThisMonth }, orderStatus: ACTIVE_STATUS_FILTER } },
      { $group: { _id: null, total: { $sum: "$grandTotal" } } }
    ]);

    const lastMonthRevAgg = await CustomerOrder.aggregate([
      { $match: { createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth }, orderStatus: ACTIVE_STATUS_FILTER } },
      { $group: { _id: null, total: { $sum: "$grandTotal" } } }
    ]);

    const thisMonthRev = thisMonthRevAgg[0]?.total || 0;
    const lastMonthRev = lastMonthRevAgg[0]?.total || 0;

    let growthPct = 0;
    if (lastMonthRev > 0) {
      growthPct = Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100);
    } else if (thisMonthRev > 0) {
      growthPct = 100;
    }

    res.status(200).json({
      success: true,
      reports: {
        totalRevenue,
        totalOrders,
        averageOrderValue,
        activeCustomers: totalCustomers,
        totalProducts,
        growthPct,
        topProducts
      }
    });
  } catch (error) {
    console.error("Reports Analytics Error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch reports analytics" });
  }
};
