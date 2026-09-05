import mongoose from "mongoose";
import Coupon from "../admin/models/Coupon.js";
import CouponApplicability from "../admin/models/CouponApplicability.js";
import { Product, VendorProduct } from "../models/catalog.js";
import CustomerOrder from "../customer/models/CustomerOrder.js";

/**
 * Shared, authoritative coupon discount calculator for both checkout preview and order creation.
 * Evaluates:
 * 1. Coupon active status, validity window (valid_from / valid_to).
 * 2. Minimum order subtotal requirement (min_order_value).
 * 3. Global usage limit and per-customer usage limit.
 * 4. CouponApplicability scope rules (All, Category, Subcategory, ProductFamily, Product).
 * 5. Per-product / per-vendor-product coupon_allowed flags.
 * 6. Per-product / per-vendor-product max_discount_amount caps.
 * 7. Global coupon max_discount_cap.
 *
 * @param {Object} params
 * @param {String} params.couponCode - Code to validate/apply.
 * @param {Array} params.items - Cart/order items array [{ productId, price, qty, vendorId, ... }]
 * @param {String} [params.vendorId] - Vendor ID.
 * @param {String} [params.customerId] - Customer ID for usage limit checks.
 * @param {Object} [params.session] - Mongoose session for transactions (optional).
 * @returns {Promise<Object>} - { couponDiscount, appliedCoupon, couponError, coupon }
 */
export const calculateCouponDiscount = async ({
  couponCode,
  items = [],
  vendorId = null,
  customerId = null,
  session = null
}) => {
  let couponDiscount = 0;
  let appliedCoupon = null;
  let couponError = null;

  if (!couponCode) {
    return { couponDiscount: 0, appliedCoupon: null, couponError: null, coupon: null };
  }

  const codeUpper = String(couponCode).toUpperCase().trim();
  const query = Coupon.findOne({ code: codeUpper });
  if (session) query.session(session);
  const coupon = await query.exec();

  if (!coupon) {
    return { couponDiscount: 0, appliedCoupon: null, couponError: "Invalid coupon code", coupon: null };
  }

  const minOrderVal = coupon.min_order_value !== undefined && coupon.min_order_value !== null ? coupon.min_order_value : (coupon.minCartValue || 0);
  const validFrom = coupon.valid_from || coupon.startDate || null;
  const validTo = coupon.valid_to || coupon.expiryDate || null;
  const totalLimit = coupon.total_usage_limit !== undefined && coupon.total_usage_limit !== null ? coupon.total_usage_limit : coupon.usageLimit;
  const userLimit = coupon.usage_limit_per_user !== undefined && coupon.usage_limit_per_user !== null ? coupon.usage_limit_per_user : coupon.perCustomerLimit;
  const maxCap = coupon.max_discount_cap !== undefined && coupon.max_discount_cap !== null ? coupon.max_discount_cap : coupon.maxDiscountCap;
  const discType = coupon.discount_type || coupon.discountType || "flat";
  const discVal = coupon.discount_value !== undefined ? coupon.discount_value : (coupon.discountValue || 0);

  // Calculate cart item total
  let itemTotal = 0;
  for (const item of items) {
    itemTotal += Number(item.price || 0) * Number(item.qty || item.quantity || 1);
  }

  const now = new Date();

  if (coupon.status !== "active") {
    couponError = "This coupon is inactive";
  } else if (validFrom && now < new Date(validFrom)) {
    couponError = "This coupon is not active yet";
  } else if (validTo && now > new Date(validTo)) {
    couponError = "This coupon has expired";
  } else if (itemTotal < minOrderVal) {
    couponError = `Minimum order amount of ₹${minOrderVal} is required to use this coupon`;
  } else if (totalLimit !== null && totalLimit !== undefined && (coupon.usedCount || 0) >= totalLimit) {
    couponError = "Coupon usage limit has been reached";
  } else if (customerId && userLimit !== null && userLimit !== undefined) {
    const countQuery = CustomerOrder.countDocuments({ customerId, couponCode: codeUpper });
    if (session) countQuery.session(session);
    const count = await countQuery.exec();
    if (count >= userLimit) {
      couponError = "You have already used this coupon maximum times";
    }
  }

  if (couponError) {
    return { couponDiscount: 0, appliedCoupon: null, couponError, coupon };
  }

  // Fetch applicability rules
  const appQuery = CouponApplicability.find({ coupon_id: coupon._id });
  if (session) appQuery.session(session);
  const applicabilityRules = await appQuery.exec();
  const isAllScope = applicabilityRules.length === 0 || applicabilityRules.some(r => r.scope_type === "All");

  // Calculate item-level discounts
  let calculatedTotalDiscount = 0;
  let totalEligibleSubtotal = 0;

  const itemDetails = [];
  for (const item of items) {
    const itemVendorId = item.vendorId || vendorId;
    
    let masterProd = null;
    let vpLink = null;

    if (item.productId) {
      const pQuery = Product.findById(item.productId);
      if (session) pQuery.session(session);
      masterProd = await pQuery.exec();
    }

    if (itemVendorId && item.productId) {
      const vpQuery = VendorProduct.findOne({ vendorId: itemVendorId, masterProductId: item.productId });
      if (session) vpQuery.session(session);
      vpLink = await vpQuery.exec();
    }

    const isCouponAllowed = (vpLink && vpLink.coupon_allowed !== undefined) 
      ? vpLink.coupon_allowed 
      : (masterProd?.coupon_allowed || false);

    const maxDiscountCapProduct = (vpLink && vpLink.max_discount_amount !== undefined && vpLink.max_discount_amount !== null) 
      ? vpLink.max_discount_amount 
      : (masterProd?.max_discount_amount ?? null);

    let isScopeMatch = isAllScope;
    if (!isScopeMatch && masterProd) {
      isScopeMatch = applicabilityRules.some(r => {
        if (r.scope_type === "Product" && r.scope_id?.toString() === masterProd._id.toString()) return true;
        if (r.scope_type === "Category" && masterProd.categoryId && r.scope_id?.toString() === masterProd.categoryId.toString()) return true;
        if (r.scope_type === "Subcategory" && masterProd.subCategoryId && r.scope_id?.toString() === masterProd.subCategoryId.toString()) return true;
        if (r.scope_type === "ProductFamily" && masterProd.familyId && r.scope_id?.toString() === masterProd.familyId.toString()) return true;
        return false;
      });
    }

    const isEligible = isCouponAllowed && isScopeMatch;
    const lineSubtotal = Number(item.price || 0) * Number(item.qty || item.quantity || 1);

    if (isEligible) {
      totalEligibleSubtotal += lineSubtotal;
    }

    itemDetails.push({
      item,
      lineSubtotal,
      isEligible,
      maxDiscountCapProduct
    });
  }

  if (totalEligibleSubtotal > 0) {
    for (const detail of itemDetails) {
      if (!detail.isEligible) continue;

      let itemRawDiscount = 0;
      if (discType === "percentage") {
        itemRawDiscount = (detail.lineSubtotal * discVal) / 100;
      } else if (discType === "flat") {
        itemRawDiscount = (detail.lineSubtotal / totalEligibleSubtotal) * discVal;
      }

      let itemFinalDiscount = itemRawDiscount;
      if (detail.maxDiscountCapProduct !== null && detail.maxDiscountCapProduct !== undefined && detail.maxDiscountCapProduct >= 0) {
        const vendorCapForLine = detail.maxDiscountCapProduct * (detail.item.qty || detail.item.quantity || 1);
        itemFinalDiscount = Math.min(itemRawDiscount, vendorCapForLine);
      }

      itemFinalDiscount = Math.min(itemFinalDiscount, detail.lineSubtotal);
      calculatedTotalDiscount += itemFinalDiscount;
    }
  }

  if (maxCap !== null && maxCap !== undefined && maxCap >= 0) {
    calculatedTotalDiscount = Math.min(calculatedTotalDiscount, Number(maxCap));
  }

  couponDiscount = Math.round((Math.min(calculatedTotalDiscount, itemTotal) + Number.EPSILON) * 100) / 100;

  if (couponDiscount <= 0 && totalEligibleSubtotal === 0) {
    couponError = "None of the products in your cart are eligible for this coupon";
    couponDiscount = 0;
  } else {
    appliedCoupon = {
      code: coupon.code,
      discountType: discType,
      discountValue: discVal,
      discountAmount: couponDiscount
    };
  }

  return {
    couponDiscount,
    appliedCoupon,
    couponError,
    coupon
  };
};
