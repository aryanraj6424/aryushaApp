import { buildWaterfall } from "./ledgerSyncHelper.js";

/**
 * Serializer helpers for CustomerOrder documents.
 * Uses the buildWaterfall helper for consistent, annotated fee separation.
 *
 * Business rules baked in:
 *  - Commission is on itemSubtotal ONLY.
 *  - Coupon discount is absorbed by admin — does NOT reduce vendor earning.
 *  - Platform fees (handling, smallCart, delivery) are admin-only revenue.
 *  - Vendor net payout = itemSubtotal − commission (coupon and platform fees do not affect this).
 *  - Admin net revenue = commission + platformFees − couponDiscount.
 */

/** Strip all commission/fee metadata before sending to a customer. */
export const serializeCustomerOrder = (order) => {
  if (!order) return null;
  const obj = typeof order.toObject === "function" ? order.toObject() : JSON.parse(JSON.stringify(order));
  delete obj.vendorCommission;
  if (Array.isArray(obj.items)) {
    obj.items = obj.items.map(item => {
      delete item.calculatedCommissionAmount;
      delete item.commissionRateApplied;
      delete item.commissionResolutionLevel;
      return item;
    });
  }
  if (Array.isArray(obj.feeBreakdown)) {
    obj.feeBreakdown = obj.feeBreakdown.filter(f => f.feeType !== "commission");
  }
  return obj;
};

/**
 * Vendor view — shows itemSubtotal, commission, and netPayout only.
 * Does NOT expose coupon discount or admin revenue (admin-internal figures).
 */
export const serializeVendorOrder = (order, vendorId) => {
  if (!order) return null;
  const obj = typeof order.toObject === "function" ? order.toObject() : JSON.parse(JSON.stringify(order));

  const orderVendorId = obj.vendorId?._id ? obj.vendorId._id.toString() : obj.vendorId?.toString();
  if (orderVendorId !== vendorId.toString()) return null;

  const wf = buildWaterfall(order);

  obj.waterfall = {
    itemSubtotal:       wf.itemSubtotal,
    commissionType:     wf.commissionType,
    commissionRate:     wf.commissionRate,
    commissionAmount:   wf.commissionAmount,
    netPayout:          wf.netPayout,
    // Informational note for vendor
    note: "Commission is calculated on your item total only. Platform fees and coupon discounts are handled by the platform.",
  };

  // Also expose as flat fields for backwards compatibility
  obj.itemSubtotal     = wf.itemSubtotal;
  obj.commissionAmount = wf.commissionAmount;
  obj.netPayout        = wf.netPayout;

  return obj;
};

/**
 * Admin view — full waterfall including coupon, platform fees, and admin revenue.
 */
export const serializeAdminOrder = (order) => {
  if (!order) return null;
  const obj = typeof order.toObject === "function" ? order.toObject() : JSON.parse(JSON.stringify(order));

  const wf = buildWaterfall(order);

  obj.waterfall = {
    grandTotal:       wf.grandTotal,
    itemSubtotal:     wf.itemSubtotal,
    couponCode:       wf.couponCode,
    couponDiscount:   wf.couponDiscount,
    platformFees:     wf.platformFees,
    commissionType:   wf.commissionType,
    commissionRate:   wf.commissionRate,
    commissionAmount: wf.commissionAmount,
    netPayout:        wf.netPayout,
    adminNetRevenue:  wf.adminNetRevenue,
  };

  // Flat fields for backwards compatibility
  obj.itemSubtotal     = wf.itemSubtotal;
  obj.commissionAmount = wf.commissionAmount;
  obj.netPayout        = wf.netPayout;
  obj.platformFees     = wf.platformFees;
  obj.adminNetRevenue  = wf.adminNetRevenue;

  obj.adminCommissionDetails = {
    resolutionLevel:  obj.items?.[0]?.commissionResolutionLevel || "global",
    commissionType:   wf.commissionType,
    rate:             wf.commissionRate,
    amount:           wf.commissionAmount,
    itemSubtotal:     wf.itemSubtotal,
    netPayout:        wf.netPayout,
    platformFees:     wf.platformFees,
    couponDiscount:   wf.couponDiscount,
    adminNetRevenue:  wf.adminNetRevenue,
  };

  return obj;
};

/**
 * Formats a CustomerOrder object scoped specifically to a single vendor's portion.
 * Correctly separates item subtotals, vendor commission, vendor platform fee shares,
 * and customer paid amounts for multi-vendor orders.
 */
export const formatVendorScopedOrder = (order, vendorId) => {
  if (!order) return null;
  const obj = typeof order.toObject === "function" ? order.toObject() : JSON.parse(JSON.stringify(order));
  const vIdStr = vendorId ? vendorId.toString() : "";

  // 1. Locate vendor sub-order if multi-vendor
  const sub = Array.isArray(obj.vendorSubOrders)
    ? obj.vendorSubOrders.find(s => (s.vendorId?._id || s.vendorId)?.toString() === vIdStr)
    : null;

  // Items for this specific vendor
  let vendorItems = [];
  if (sub && Array.isArray(sub.items) && sub.items.length > 0) {
    vendorItems = sub.items;
  } else if (Array.isArray(obj.items)) {
    vendorItems = obj.items.filter(i => (i.vendorId?._id || i.vendorId)?.toString() === vIdStr);
    if (vendorItems.length === 0 && (!obj.vendorSubOrders || obj.vendorSubOrders.length === 0)) {
      vendorItems = obj.items; // single vendor fallback
    }
  }

  // Vendor subtotal
  const vendorSubtotal = sub?.subtotal ?? vendorItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 0)), 0);

  // Overall order item subtotal across all vendors
  let overallItemSubtotal = 0;
  if (Array.isArray(obj.vendorSubOrders) && obj.vendorSubOrders.length > 0) {
    overallItemSubtotal = obj.vendorSubOrders.reduce((sum, s) => sum + Number(s.subtotal || 0), 0);
  } else if (Array.isArray(obj.items)) {
    overallItemSubtotal = obj.items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 0)), 0);
  }
  if (overallItemSubtotal <= 0) overallItemSubtotal = vendorSubtotal || 1;

  // Proportional ratio for sharing order-level fees/discounts
  const ratio = vendorSubtotal / overallItemSubtotal;

  const fullOrderGrandTotal = Number(obj.grandTotal || 0);
  const vendorHandlingFee = Math.round(Number(obj.handlingFee || 0) * ratio * 100) / 100;
  const vendorSmallCartFee = Math.round(Number(obj.smallCartFee || 0) * ratio * 100) / 100;
  const vendorRainFee = Math.round(Number(obj.rainFee || 0) * ratio * 100) / 100;
  const vendorPlatformFee = vendorHandlingFee + vendorSmallCartFee + vendorRainFee;

  const vendorDeliveryCharge = Math.round(Number(obj.deliveryCharge || 0) * ratio * 100) / 100;
  const vendorTaxAmount = Math.round(Number(obj.taxAmount || 0) * ratio * 100) / 100;
  const vendorCouponDiscount = Math.round(Number(obj.couponDiscount || 0) * ratio * 100) / 100;

  const vendorCustomerTotal = Math.max(0, Math.round((vendorSubtotal - vendorCouponDiscount + vendorDeliveryCharge + vendorTaxAmount + vendorPlatformFee) * 100) / 100);

  obj.items = vendorItems;
  obj.totalAmount = vendorSubtotal;
  obj.vendorSubtotal = vendorSubtotal;
  obj.vendorCommission = sub?.vendorCommission || obj.vendorCommission || { rate: 8, commissionType: "percentage", amount: Math.round(vendorSubtotal * 0.08 * 100) / 100 };
  if (sub) {
    obj.orderStatus = sub.subOrderStatus || obj.orderStatus;
    obj.parentOrderStatus = obj.orderStatus;
  }

  obj.platformFee = vendorPlatformFee;
  obj.handlingFee = vendorHandlingFee;
  obj.smallCartFee = vendorSmallCartFee;
  obj.rainFee = vendorRainFee;
  obj.deliveryCharge = vendorDeliveryCharge;
  obj.taxAmount = vendorTaxAmount;
  obj.couponDiscount = vendorCouponDiscount;
  obj.vendorCustomerTotal = vendorCustomerTotal;
  obj.fullOrderGrandTotal = fullOrderGrandTotal;
  obj.isMultiVendor = Array.isArray(obj.vendorSubOrders) && obj.vendorSubOrders.length > 1;

  return obj;
};
