import Vendor from "../../vendor/models/Vendor.js";
import Commission from "../../vendor/models/Commission.js";
import DailyCommissionSummary from "../../vendor/models/DailyCommissionSummary.js";
import CommissionLedger from "../../vendor/models/CommissionLedger.js";
import CustomerOrder from "../../customer/models/CustomerOrder.js";
import PlatformFeeSettings from "../models/PlatformFeeSettings.js";
import { serializeAdminOrder } from "../../utils/financeSerializer.js";
import { runReconciliationJob } from "../../utils/reconciliationJob.js";
import { runBackfillMigration } from "../../utils/backfillFinanceData.js";

// @desc    List all vendors with resolved commission settings
// @route   GET /api/admin/finance/vendors
export const listVendorsWithCommissions = async (req, res) => {
  try {
    const vendors = await Vendor.find().select("shopName businessEmail phone commissionType commissionValue");
    const platform = await PlatformFeeSettings.findOne() || { defaultCommissionType: "percentage", defaultCommissionValue: 8 };

    const mapped = vendors.map(v => {
      const isVendor = v.commissionValue !== null && v.commissionValue !== undefined && v.commissionValue !== "";
      return {
        _id: v._id,
        shopName: v.shopName,
        businessEmail: v.businessEmail,
        phone: v.phone,
        commissionType:  isVendor ? v.commissionType  : platform.defaultCommissionType,
        commissionValue: isVendor ? v.commissionValue : platform.defaultCommissionValue,
        resolvedFrom: isVendor ? "vendor" : "global",
      };
    });

    res.status(200).json({ success: true, data: mapped });
  } catch (error) {
    console.error("listVendorsWithCommissions error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Set/update a vendor's commission rate
// @route   PUT /api/admin/finance/vendors/:id
export const updateVendorCommissionConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const { commissionType, commissionValue } = req.body;

    if (!commissionType || commissionValue == null || commissionValue === "") {
      return res.status(400).json({ success: false, message: "commissionType and commissionValue are required" });
    }
    if (!["percentage", "flat"].includes(commissionType)) {
      return res.status(400).json({ success: false, message: "commissionType must be percentage or flat" });
    }
    const valueNum = Number(commissionValue);
    if (isNaN(valueNum) || valueNum < 0) {
      return res.status(400).json({ success: false, message: "commissionValue must be a positive number" });
    }
    if (commissionType === "percentage" && valueNum > 100) {
      return res.status(400).json({ success: false, message: "percentage commission value cannot exceed 100" });
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

    vendor.commissionType      = commissionType;
    vendor.commissionValue     = valueNum;
    vendor.commissionUpdatedAt = new Date();
    vendor.commissionUpdatedBy = req.user?._id || req.admin?._id || null;
    await vendor.save();

    await Commission.findOneAndUpdate({ vendor: id }, { rate: valueNum }, { upsert: true, new: true });

    res.status(200).json({
      success: true,
      message: "Commission configuration updated",
      vendor: { _id: vendor._id, shopName: vendor.shopName, commissionType: vendor.commissionType, commissionValue: vendor.commissionValue },
    });
  } catch (error) {
    console.error("updateVendorCommissionConfig error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Helper for end-of-day date range parsing
const parseDateRange = (startDate, endDate) => {
  const filter = {};
  if (startDate) filter.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filter.$lte = end;
  }
  return Object.keys(filter).length ? filter : null;
};

// @desc    Get aggregated financial summary — full waterfall breakdown
// @route   GET /api/admin/finance/summary
export const getFinanceSummary = async (req, res) => {
  try {
    const { vendorId, startDate, endDate } = req.query;

    // Auto-sync check: if ledger entries are missing compared to CustomerOrder, trigger backfill
    const orderCount = await CustomerOrder.countDocuments();
    const ledgerCount = await CommissionLedger.countDocuments();
    if (orderCount > 0 && ledgerCount < orderCount) {
      try {
        await runBackfillMigration();
      } catch (e) {
        console.warn("[getFinanceSummary] Auto-sync backfill warning:", e.message);
      }
    }

    const dateFilter = parseDateRange(startDate, endDate);
    const query = { vendorId: vendorId || null };
    if (dateFilter) query.date = dateFilter;

    let summaries = await DailyCommissionSummary.find(query).sort({ date: 1 });

    // Fallback: if no platform-wide (vendorId: null) rows exist, aggregate per-vendor rows
    if (summaries.length === 0 && !vendorId) {
      const allVendorQuery = { vendorId: { $ne: null } };
      if (dateFilter) allVendorQuery.date = dateFilter;
      summaries = await DailyCommissionSummary.find(allVendorQuery).sort({ date: 1 });
    }

    const totalOrders          = summaries.reduce((s, r) => s + r.totalOrders, 0);
    const totalItemSubtotal    = summaries.reduce((s, r) => s + (r.totalItemSubtotal ?? r.totalSalesAmount ?? 0), 0);
    const totalCouponDiscount  = summaries.reduce((s, r) => s + (r.totalCouponDiscount  || 0), 0);
    const totalPlatformFees    = summaries.reduce((s, r) => s + (r.totalPlatformFees    || 0), 0);
    const totalCommission      = summaries.reduce((s, r) => s + r.totalCommissionAmount, 0);
    const totalNetPayout       = summaries.reduce((s, r) => s + (r.totalNetPayout       || 0), 0);
    const totalAdminNetRevenue = summaries.reduce((s, r) => s + (r.totalAdminNetRevenue || 0), 0);

    res.status(200).json({
      success: true,
      summary: {
        totalOrders,
        // Waterfall fields
        totalItemSubtotal,
        totalCouponDiscount,
        totalPlatformFees,
        totalCommissionAmount: totalCommission,
        totalNetPayout,
        totalAdminNetRevenue,
        // Legacy alias
        totalSalesAmount: totalItemSubtotal,
      },
      timeline: summaries,
    });
  } catch (error) {
    console.error("getFinanceSummary error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get per-order breakdown list from CommissionLedger
// @route   GET /api/admin/finance/orders
export const getOrderBreakdownList = async (req, res) => {
  try {
    const { vendorId, startDate, endDate, page = 1, limit = 50 } = req.query;

    const dateFilter = parseDateRange(startDate, endDate);
    const query = {};
    if (vendorId)   query.vendorId = vendorId;
    if (dateFilter) query.orderDate = dateFilter;

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await CommissionLedger.countDocuments(query);
    const ledgers = await CommissionLedger.find(query)
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("vendorId", "shopName");

    const rows = ledgers.map(l => {
      const itemSub      = l.itemSubtotal ?? l.orderAmount;
      const netPay       = l.netPayout    ?? Math.max(0, itemSub - l.commissionAmount);
      const platTotal    = (l.platformFees?.handlingFee || 0) + (l.platformFees?.smallCartFee || 0) + (l.platformFees?.deliveryCharge || 0);
      const adminRevenue = l.adminNetRevenue ?? (l.commissionAmount + platTotal - (l.couponDiscount || 0));

      return {
        _id:                   l._id,
        orderIdStr:            l.orderIdStr,
        orderDate:             l.orderDate,
        vendorId:              l.vendorId?._id  || l.vendorId,
        vendorName:            l.vendorId?.shopName || "—",
        grandTotal:            l.grandTotal     || 0,
        itemSubtotal:          itemSub,
        couponCode:            l.couponCode     || null,
        couponDiscount:        l.couponDiscount || 0,
        platformFees: {
          handlingFee:    l.platformFees?.handlingFee    || 0,
          smallCartFee:   l.platformFees?.smallCartFee   || 0,
          deliveryCharge: l.platformFees?.deliveryCharge || 0,
          total: platTotal,
        },
        commissionType:        l.commissionType,
        commissionRateApplied: l.commissionRateApplied,
        commissionAmount:      l.commissionAmount,
        netPayout:             netPay,
        adminNetRevenue:       adminRevenue,
        orderStatus:           l.orderStatus,
        resolutionLevel:       l.resolutionLevel,
      };
    });

    res.status(200).json({ success: true, total, page: Number(page), limit: Number(limit), data: rows });
  } catch (error) {
    console.error("getOrderBreakdownList error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get commission details for a specific order
// @route   GET /api/admin/finance/orders/:id
export const getOrderCommissionBreakdown = async (req, res) => {
  try {
    const order = await CustomerOrder.findById(req.params.id)
      .populate("vendorId",   "shopName phone")
      .populate("customerId", "fullName phoneNumber email");
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.status(200).json({ success: true, order: serializeAdminOrder(order) });
  } catch (error) {
    console.error("getOrderCommissionBreakdown error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Export CSV
// @route   GET /api/admin/finance/export
export const exportFinanceReportCSV = async (req, res) => {
  try {
    const { vendorId } = req.query;
    const summaries = await DailyCommissionSummary.find(vendorId ? { vendorId } : { vendorId: null })
      .populate("vendorId", "shopName")
      .sort({ date: -1 });

    let csv = "Date,Vendor,Orders,Item Subtotal,Coupon Discount,Platform Fees,Commission,Vendor Net Payout,Admin Net Revenue\n";
    for (const s of summaries) {
      const d = new Date(s.date).toISOString().split("T")[0];
      const v = s.vendorId?.shopName || "Platform-wide";
      const it = (s.totalItemSubtotal   ?? s.totalSalesAmount ?? 0).toFixed(2);
      const co = (s.totalCouponDiscount  || 0).toFixed(2);
      const pf = (s.totalPlatformFees    || 0).toFixed(2);
      const cm = s.totalCommissionAmount.toFixed(2);
      const np = (s.totalNetPayout       || 0).toFixed(2);
      const ar = (s.totalAdminNetRevenue || 0).toFixed(2);
      csv += `${d},"${v}",${s.totalOrders},${it},${co},${pf},${cm},${np},${ar}\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=finance_report.csv");
    res.status(200).send(csv);
  } catch (error) {
    console.error("exportFinanceReportCSV error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Run reconciliation audit
// @route   POST /api/admin/finance/reconcile
export const reconcileFinanceData = async (req, res) => {
  try {
    const report = await runReconciliationJob();
    res.status(200).json({ success: true, message: "Reconciliation completed", report });
  } catch (error) {
    console.error("reconcileFinanceData error:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

// @desc    Run backfill migration
// @route   POST /api/admin/finance/backfill
export const backfillHistoricalData = async (req, res) => {
  try {
    const report = await runBackfillMigration();
    res.status(200).json({ success: true, message: "Backfill completed", report });
  } catch (error) {
    console.error("backfillHistoricalData error:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};
