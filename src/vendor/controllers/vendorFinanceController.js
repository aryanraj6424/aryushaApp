import Vendor from "../models/Vendor.js";
import DailyCommissionSummary from "../models/DailyCommissionSummary.js";
import CommissionLedger from "../models/CommissionLedger.js";
import CustomerOrder from "../../customer/models/CustomerOrder.js";
import PlatformFeeSettings from "../../admin/models/PlatformFeeSettings.js";
import { serializeVendorOrder } from "../../utils/financeSerializer.js";

// @desc    Get vendor's current commission rate
// @route   GET /api/vendor/finance/commission-rate
export const getOwnCommissionRate = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor._id).select("commissionType commissionValue");
    const platform = await PlatformFeeSettings.findOne() || { defaultCommissionType: "percentage", defaultCommissionValue: 8 };
    const isVendor = vendor.commissionValue !== null && vendor.commissionValue !== undefined && vendor.commissionValue !== "";
    res.status(200).json({
      success: true,
      data: {
        commissionType:  isVendor ? vendor.commissionType  : platform.defaultCommissionType,
        commissionValue: isVendor ? vendor.commissionValue : platform.defaultCommissionValue,
        resolvedFrom:    isVendor ? "vendor"               : "global",
      },
    });
  } catch (error) {
    console.error("getOwnCommissionRate error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get vendor's own aggregated daily summaries (vendor-scoped waterfall)
// @route   GET /api/vendor/finance/summary
export const getOwnFinanceSummary = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const { startDate, endDate } = req.query;
    const query = { vendorId };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate)   query.date.$lte = new Date(endDate);
    }

    const summaries = await DailyCommissionSummary.find(query).sort({ date: 1 });

    const totalOrders       = summaries.reduce((s, r) => s + r.totalOrders, 0);
    const totalItemSubtotal = summaries.reduce((s, r) => s + (r.totalItemSubtotal ?? r.totalSalesAmount ?? 0), 0);
    const totalCommission   = summaries.reduce((s, r) => s + r.totalCommissionAmount, 0);
    const totalNetPayout    = summaries.reduce((s, r) => s + (r.totalNetPayout || 0), 0);

    res.status(200).json({
      success: true,
      summary: {
        totalOrders,
        totalItemSubtotal,
        totalSalesAmount: totalItemSubtotal, // legacy
        totalCommissionAmount: totalCommission,
        totalNetPayout,
        // NOTE: coupon & admin revenue deliberately excluded from vendor view
      },
      timeline: summaries,
    });
  } catch (error) {
    console.error("getOwnFinanceSummary error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get vendor's per-order breakdown from CommissionLedger (vendor-scoped)
// @route   GET /api/vendor/finance/orders
export const getOwnOrderBreakdownList = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const { startDate, endDate, page = 1, limit = 50 } = req.query;

    const query = { vendorId };
    if (startDate || endDate) {
      query.orderDate = {};
      if (startDate) query.orderDate.$gte = new Date(startDate);
      if (endDate)   query.orderDate.$lte = new Date(endDate);
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await CommissionLedger.countDocuments(query);
    const ledgers = await CommissionLedger.find(query)
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(Number(limit));

    const rows = ledgers.map(l => {
      const itemSub = l.itemSubtotal ?? l.orderAmount;
      const netPay  = l.netPayout    ?? Math.max(0, itemSub - l.commissionAmount);
      return {
        _id:                   l._id,
        orderIdStr:            l.orderIdStr,
        orderDate:             l.orderDate,
        itemSubtotal:          itemSub,
        commissionType:        l.commissionType,
        commissionRateApplied: l.commissionRateApplied,
        commissionAmount:      l.commissionAmount,
        netPayout:             netPay,
        orderStatus:           l.orderStatus,
        resolutionLevel:       l.resolutionLevel,
        // NOTE: platformFees, coupon, adminNetRevenue deliberately excluded from vendor view
      };
    });

    res.status(200).json({ success: true, total, page: Number(page), limit: Number(limit), data: rows });
  } catch (error) {
    console.error("getOwnOrderBreakdownList error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get single order details
// @route   GET /api/vendor/finance/orders/:id
export const getOwnOrderCommissionBreakdown = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const order = await CustomerOrder.findOne({ _id: req.params.id, $or: [{ vendorId }, { "vendorSubOrders.vendorId": vendorId }] })
      .populate("vendorId",   "shopName phone")
      .populate("customerId", "fullName phoneNumber email");
    if (!order) return res.status(404).json({ success: false, message: "Order not found or access denied" });

    const serialized = serializeVendorOrder(order, vendorId);
    if (!serialized) return res.status(403).json({ success: false, message: "Access denied" });

    res.status(200).json({ success: true, order: serialized });
  } catch (error) {
    console.error("getOwnOrderCommissionBreakdown error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
