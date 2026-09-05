import CommissionLedger from "../vendor/models/CommissionLedger.js";
import DailyCommissionSummary from "../vendor/models/DailyCommissionSummary.js";
import mongoose from "mongoose";

/**
 * Resilient transaction wrapper.
 * Falls back to non-transactional execution on standalone MongoDB deployments.
 */
export const runInTransaction = async (workFn) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await workFn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();

    const msg = error.message || "";
    const isStandalone =
      msg.includes("Transaction numbers are only allowed") ||
      msg.includes("does not support retryable writes") ||
      msg.includes("IllegalOperation");

    if (isStandalone) {
      console.warn("[MongoDB] Standalone deployment — falling back to non-transactional execution.");
      return await workFn(null);
    }
    throw error;
  } finally {
    session.endSession();
  }
};

/** Normalizes a Date to UTC midnight (start of day). */
export const getStartOfDayUTC = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// ──────────────────────────────────────────────────────────────
// WATERFALL CALCULATION HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * Computes item-only subtotal (price × qty) from order items.
 * This is the ONLY valid base for vendor commission calculations.
 * Platform fees and coupon discounts are EXCLUDED.
 */
export const computeItemSubtotal = (order) =>
  (order.items || []).reduce((sum, item) => {
    const qty = item.qty || item.quantity || 0;
    return sum + (item.price || 0) * qty;
  }, 0);

/**
 * Extracts platform-only fees from the order.
 * These fees go entirely to admin — never deducted from vendor commission math.
 */
export const extractPlatformFees = (order) => {
  const handlingFee    = order.handlingFee    || 0;
  const smallCartFee   = order.smallCartFee   || 0;
  const deliveryCharge = order.deliveryCharge || 0;
  return { handlingFee, smallCartFee, deliveryCharge, total: handlingFee + smallCartFee + deliveryCharge };
};

/**
 * Builds the full waterfall breakdown for an order.
 *
 * Waterfall:
 *   grandTotal          = full amount customer paid
 *   itemSubtotal        = vendor's commission base (price × qty)
 *   couponDiscount      = absorbed by admin (does NOT reduce vendor earning)
 *   platformFees        = admin-only fees (handling + smallCart + delivery)
 *   commissionAmount    = admin's cut from vendor (on itemSubtotal only)
 *   netPayout           = itemSubtotal − commissionAmount  (what vendor keeps)
 *   adminNetRevenue     = commissionAmount + platformFees.total − couponDiscount
 */
export const buildWaterfall = (order) => {
  const itemSubtotal      = Math.round((computeItemSubtotal(order)        + Number.EPSILON) * 100) / 100;
  const fees              = extractPlatformFees(order);
  const commissionAmount  = Math.round(((order.vendorCommission?.amount || 0) + Number.EPSILON) * 100) / 100;
  const couponDiscount    = Math.round(((order.couponDiscount || 0)           + Number.EPSILON) * 100) / 100;
  const grandTotal        = Math.round(((order.grandTotal || 0)               + Number.EPSILON) * 100) / 100;

  const netPayout         = Math.round((Math.max(0, itemSubtotal - commissionAmount) + Number.EPSILON) * 100) / 100;
  const adminNetRevenue   = Math.round((commissionAmount + fees.total - couponDiscount + Number.EPSILON) * 100) / 100;

  return {
    grandTotal,
    itemSubtotal,
    couponCode:      order.couponCode     || null,
    couponDiscount,
    platformFees:    fees,
    commissionType:  order.vendorCommission?.commissionType || "percentage",
    commissionRate:  order.vendorCommission?.rate           || 0,
    commissionAmount,
    netPayout,
    adminNetRevenue,
  };
};

// ──────────────────────────────────────────────────────────────
// LEDGER SYNC HANDLERS
// ──────────────────────────────────────────────────────────────

/**
 * Creates a CommissionLedger entry + increments DailyCommissionSummary counters
 * when a new order is placed.
 *
 * Must be called inside runInTransaction().
 */
export const handleOrderCreated = async (order, session) => {
  try {
    const orderDate  = order.createdAt || new Date();
    const startOfDay = getStartOfDayUTC(orderDate);

    // Resolve resolution level
    let resolutionLevel = "global";
    if (order.items?.some(i => i.commissionResolutionLevel === "product")) resolutionLevel = "product";
    else if (order.items?.some(i => i.commissionResolutionLevel === "vendor")) resolutionLevel = "vendor";

    const wf = buildWaterfall(order);

    await CommissionLedger.create(
      [{
        orderId:               order._id,
        orderIdStr:            order.orderId,
        vendorId:              order.vendorId,
        orderDate,
        grandTotal:            wf.grandTotal,
        orderAmount:           wf.itemSubtotal,     // legacy
        itemSubtotal:          wf.itemSubtotal,
        couponCode:            wf.couponCode,
        couponDiscount:        wf.couponDiscount,
        platformFees:          wf.platformFees,
        commissionType:        wf.commissionType,
        commissionRateApplied: wf.commissionRate,
        commissionAmount:      wf.commissionAmount,
        netPayout:             wf.netPayout,
        adminNetRevenue:       wf.adminNetRevenue,
        resolutionLevel,
        orderStatus:           order.orderStatus || "Pending",
      }],
      { session }
    );

    const inc = {
      totalOrders:           1,
      totalSalesAmount:      wf.itemSubtotal,       // legacy
      totalItemSubtotal:     wf.itemSubtotal,
      totalCouponDiscount:   wf.couponDiscount,
      totalPlatformFees:     wf.platformFees.total,
      totalCommissionAmount: wf.commissionAmount,
      totalNetPayout:        wf.netPayout,
      totalAdminNetRevenue:  wf.adminNetRevenue,
    };

    const updateQuery = { $inc: inc, $set: { lastUpdatedAt: new Date() } };

    await DailyCommissionSummary.findOneAndUpdate(
      { vendorId: order.vendorId, date: startOfDay },
      updateQuery,
      { upsert: true, session, new: true }
    );
    await DailyCommissionSummary.findOneAndUpdate(
      { vendorId: null, date: startOfDay },
      updateQuery,
      { upsert: true, session, new: true }
    );

    console.log(
      `[LedgerSync] Order ${order.orderId} | ` +
      `ItemSubtotal: ₹${wf.itemSubtotal} | Commission: ₹${wf.commissionAmount} | ` +
      `NetPayout: ₹${wf.netPayout} | PlatformFees: ₹${wf.platformFees.total} | ` +
      `Coupon: ₹${wf.couponDiscount} | AdminRevenue: ₹${wf.adminNetRevenue}`
    );
  } catch (error) {
    console.error("[LedgerSync] handleOrderCreated failed:", error);
    throw error;
  }
};

/**
 * Updates status in CommissionLedger and reverses/restores DailyCommissionSummary
 * when order is Cancelled/Rejected/Returned (or moved back to active).
 */
export const handleOrderStatusChange = async (orderId, targetStatus, session) => {
  try {
    const ledger = await CommissionLedger.findOne({ orderId }).session(session);
    if (!ledger) {
      console.warn(`[LedgerSync] CommissionLedger not found for Order ID ${orderId}`);
      return;
    }

    const currentStatus       = ledger.orderStatus;
    const isCurrentlyReversed = ["Cancelled", "Rejected", "Returned"].includes(currentStatus);
    const shouldBeReversed    = ["Cancelled", "Rejected", "Returned"].includes(targetStatus);

    ledger.orderStatus = targetStatus;
    await ledger.save({ session });

    // Resolve all fields — support legacy ledger entries pre-dating new fields
    const itemSub       = ledger.itemSubtotal     ?? ledger.orderAmount;
    const netPay        = ledger.netPayout        ?? Math.max(0, itemSub - ledger.commissionAmount);
    const platFees      = (ledger.platformFees?.handlingFee || 0) + (ledger.platformFees?.smallCartFee || 0) + (ledger.platformFees?.deliveryCharge || 0);
    const couponDisc    = ledger.couponDiscount    || 0;
    const adminRevenue  = ledger.adminNetRevenue   ?? (ledger.commissionAmount + platFees - couponDisc);

    if (shouldBeReversed && !isCurrentlyReversed) {
      const startOfDay = getStartOfDayUTC(ledger.orderDate);
      const reverseQuery = {
        $inc: {
          totalOrders:           -1,
          totalSalesAmount:      -itemSub,
          totalItemSubtotal:     -itemSub,
          totalCouponDiscount:   -couponDisc,
          totalPlatformFees:     -platFees,
          totalCommissionAmount: -ledger.commissionAmount,
          totalNetPayout:        -netPay,
          totalAdminNetRevenue:  -adminRevenue,
        },
        $set: { lastUpdatedAt: new Date() },
      };
      await DailyCommissionSummary.findOneAndUpdate({ vendorId: ledger.vendorId, date: startOfDay }, reverseQuery, { upsert: true, session });
      await DailyCommissionSummary.findOneAndUpdate({ vendorId: null,            date: startOfDay }, reverseQuery, { upsert: true, session });
      console.log(`[LedgerSync] Reversed Order ${ledger.orderIdStr}: ${currentStatus} → ${targetStatus}`);

    } else if (!shouldBeReversed && isCurrentlyReversed) {
      const startOfDay = getStartOfDayUTC(ledger.orderDate);
      const restoreQuery = {
        $inc: {
          totalOrders:           1,
          totalSalesAmount:      itemSub,
          totalItemSubtotal:     itemSub,
          totalCouponDiscount:   couponDisc,
          totalPlatformFees:     platFees,
          totalCommissionAmount: ledger.commissionAmount,
          totalNetPayout:        netPay,
          totalAdminNetRevenue:  adminRevenue,
        },
        $set: { lastUpdatedAt: new Date() },
      };
      await DailyCommissionSummary.findOneAndUpdate({ vendorId: ledger.vendorId, date: startOfDay }, restoreQuery, { upsert: true, session });
      await DailyCommissionSummary.findOneAndUpdate({ vendorId: null,            date: startOfDay }, restoreQuery, { upsert: true, session });
      console.log(`[LedgerSync] Restored Order ${ledger.orderIdStr}: ${currentStatus} → ${targetStatus}`);

    } else {
      console.log(`[LedgerSync] Status change ${ledger.orderIdStr} → ${targetStatus} (no reversal needed)`);
    }
  } catch (error) {
    console.error(`[LedgerSync] handleOrderStatusChange failed for Order ${orderId}:`, error);
    throw error;
  }
};
