import mongoose from "mongoose";
import { Product, ProductVariant, VendorListing, VendorProduct } from "../../models/catalog.js";
import Coupon from "../../admin/models/Coupon.js";
import CouponApplicability from "../../admin/models/CouponApplicability.js";
import { calculateOrderFees } from "../../utils/feeCalculator.js";
import { calculateCouponDiscount } from "../../utils/couponCalculator.js";
import CustomerOrder from "../models/CustomerOrder.js";
import DeliverySlot from "../models/DeliverySlot.js";

/**
 * Helper: Resolve cart items with current database prices and MRP to prevent client-side price tampering.
 */
const resolveCartItems = async (items, vendorId) => {
  const resolved = [];
  if (!Array.isArray(items) || items.length === 0) return resolved;

  for (const item of items) {
    let price = item.price;
    let mrp = item.mrp;
    let name = item.name;
    let img = item.img;
    let brand = item.brand;
    let packSize = item.packSize;

    try {
      // 1. Resolve from VendorListing (standard variant catalog link)
      const listing = await VendorListing.findOne({
        vendorId,
        variantId: item.variantId
      }).populate("variantId");

      if (listing) {
        price = listing.sellingPrice;
        if (listing.variantId) {
          mrp = listing.variantId.mrp;
          packSize = listing.variantId.packSize;
        }
      } else {
        // 2. Fallback to VendorProduct reference
        const vpLink = await VendorProduct.findOne({
          vendorId,
          masterProductId: item.productId
        }).populate("masterProductId");

        if (vpLink) {
          price = vpLink.price;
          mrp = vpLink.mrp; // optional mrp
          if (vpLink.masterProductId) {
            name = vpLink.masterProductId.name;
            brand = vpLink.masterProductId.brand;
            if (vpLink.masterProductId.images && vpLink.masterProductId.images.length > 0) {
              img = vpLink.masterProductId.images[0];
            }
          }
        }
      }
    } catch (err) {
      console.error("Error resolving item price:", err);
    }

    resolved.push({
      productId: item.productId,
      variantId: item.variantId,
      name: name || item.name,
      brand: brand || item.brand || "Generic",
      img: img || item.img,
      packSize: typeof packSize === "object" && packSize?.value ? `${packSize.value} ${packSize.unit}` : packSize || item.packSize || "1 Unit",
      qty: Number(item.qty || 1),
      price: Number(price),
      mrp: mrp ? Number(mrp) : null,
      vendorId
    });
  }
  return resolved;
};

/**
 * Helper: Suggest related products (from same category, excluding existing cart products, top by stock)
 */
const getCrossSellSuggestions = async (items, vendorId) => {
  try {
    if (!Array.isArray(items) || items.length === 0) return [];
    
    const resolvedItems = await resolveCartItems(items, vendorId);
    const productIds = resolvedItems.map(i => i.productId).filter(Boolean);

    const productsInCart = await Product.find({ _id: { $in: productIds } });
    const categoryIds = productsInCart.map(p => p.categoryId).filter(Boolean);

    if (categoryIds.length === 0) return [];

    // Find other products in the same category
    const suggestedProducts = await Product.find({
      categoryId: { $in: categoryIds },
      _id: { $nin: productIds },
      status: "approved",
      isDeleted: { $ne: true }
    }).limit(15);

    const suggestions = [];
    for (const prod of suggestedProducts) {
      // Lookup variant details & check if vendor has listing
      const variant = await ProductVariant.findOne({ productId: prod._id, status: "active" });
      if (!variant) continue;

      let price = variant.basePrice;
      let mrp = variant.mrp;
      
      const listing = await VendorListing.findOne({ vendorId, variantId: variant._id });
      if (listing) {
        price = listing.sellingPrice;
      } else {
        const vpLink = await VendorProduct.findOne({ vendorId, masterProductId: prod._id });
        if (vpLink) {
          price = vpLink.price;
          mrp = vpLink.mrp;
        } else {
          continue; // Skip if not listed by the area's single vendor
        }
      }

      suggestions.push({
        productId: prod._id,
        variantId: variant._id,
        name: prod.name,
        brand: prod.brand || "Generic",
        price,
        mrp: mrp || null,
        img: variant.images?.[0] || prod.images?.[0] || "https://via.placeholder.com/150",
        packSize: variant.packSize && typeof variant.packSize === "object" && variant.packSize.value ? `${variant.packSize.value} ${variant.packSize.unit}` : variant.packSize || prod.unitType,
        vendorId
      });
    }

    return suggestions.slice(0, 8); // return top 5-8 recommendations
  } catch (error) {
    console.error("Cross-sell fetch failure (handled gracefully):", error);
    return []; // Return empty array on failure instead of crashing
  }
};

/**
 * Endpoint: Calculate full cart breakdown (GET/POST /customer/cart/summary)
 */
export const getCartSummary = async (req, res) => {
  try {
    const rawItems = req.body.items || (req.query.items ? JSON.parse(req.query.items) : []);
    const couponCode = req.body.couponCode || req.query.couponCode || null;
    const customerId = req.user ? req.user._id : null;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.json({
        success: true,
        summary: {
          items: [],
          itemTotal: 0,
          mrpTotal: 0,
          couponDiscount: 0,
          handlingFee: 0,
          smallCartFee: 0,
          deliveryPartnerFee: 0,
          gst: 0,
          toPay: 0,
          appliedCoupon: null,
          suggestions: []
        }
      });
    }

    // Area-specific vendor is determined by first item's vendorId
    const vendorId = rawItems[0].vendorId || req.body.vendorId || req.query.vendorId;
    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId is required to calculate fees and resolve items." });
    }

    const items = await resolveCartItems(rawItems, vendorId);

    // Calculate Item Total and MRP Total
    let itemTotal = 0;
    let mrpTotal = 0;
    for (const item of items) {
      itemTotal += item.price * item.qty;
      mrpTotal += (item.mrp || item.price) * item.qty;
    }

    let couponDiscount = 0;
    let appliedCoupon = null;
    let couponError = null;

    // Validate and apply coupon if provided
    if (couponCode) {
      const calcResult = await calculateCouponDiscount({
        couponCode,
        items,
        vendorId,
        customerId
      });
      couponDiscount = calcResult.couponDiscount;
      appliedCoupon = calcResult.appliedCoupon;
      couponError = calcResult.couponError;
    }

    // Bill calculations using dynamic FeeConfig overrides
    const zoneId = req.body.zoneId || req.query.zoneId || "";
    const { breakdown, totalFees } = await calculateOrderFees(itemTotal, zoneId);

    const handlingFee = breakdown.find(f => f.feeType === "handling")?.amount || 0;
    const smallCartFee = breakdown.find(f => f.feeType === "small_cart")?.amount || 0;
    const deliveryPartnerFee = breakdown.find(f => f.feeType === "delivery_partner")?.amount || 0;
    const gst = breakdown.find(f => f.feeType === "gst")?.amount || 0;
    const rainFee = breakdown.find(f => f.feeType === "rain")?.amount || 0;
    const customFees = breakdown.filter(f => !["handling", "small_cart", "delivery_partner", "gst", "rain"].includes(f.feeType)).reduce((sum, f) => sum + f.amount, 0);

    const totalCalculatedFees = handlingFee + smallCartFee + deliveryPartnerFee + gst + rainFee + customFees;
    const toPay = Math.max(0, itemTotal - couponDiscount + totalCalculatedFees);

    const suggestions = await getCrossSellSuggestions(rawItems, vendorId);

    res.json({
      success: true,
      summary: {
        items,
        itemTotal,
        mrpTotal,
        couponDiscount,
        handlingFee,
        smallCartFee,
        deliveryPartnerFee,
        gst,
        rainFee,
        customFees,
        feeBreakdown: breakdown,
        toPay,
        appliedCoupon,
        couponError,
        suggestions
      }
    });

  } catch (error) {
    console.error("Cart summary calculation failure:", error);
    res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
};

/**
 * Endpoint: Get all active delivery slots (GET /customer/cart/slots)
 */
export const getDeliverySlots = async (req, res) => {
  try {
    const city = (req.query.city || req.query.zoneId || "").trim();
    const vendorId = (req.query.vendorId || "").trim();

    // Query active slots (isActive is true or undefined)
    const query = { isActive: { $ne: false } };

    const conditions = [];

    // Global slots apply to everyone
    conditions.push({ isGlobal: true });
    conditions.push({ isGlobal: { $exists: false } });

    // Specific vendor matching
    if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) {
      conditions.push({ vendorIds: vendorId });
    }

    // Specific city matching
    if (city) {
      conditions.push({ city: new RegExp(`^${city}$`, "i") });
    }

    query.$or = conditions;

    let slots = await DeliverySlot.find(query).sort({ cutoffTime: 1, startTime: 1 });

    // If database is completely empty (no slots ever created), seed defaults dynamically
    const totalCount = await DeliverySlot.countDocuments();
    if (totalCount === 0) {
      const defaults = [
        { name: "Early Morning Slot", startTime: "07:00 AM", endTime: "10:00 AM", cutoffTime: "06:00", isGlobal: true, isActive: true },
        { name: "Mid Day Slot", startTime: "11:00 AM", endTime: "02:00 PM", cutoffTime: "10:00", isGlobal: true, isActive: true },
        { name: "Evening Rush Slot", startTime: "03:00 PM", endTime: "06:00 PM", cutoffTime: "14:00", isGlobal: true, isActive: true },
        { name: "Night Delivery Slot", startTime: "07:00 PM", endTime: "10:00 PM", cutoffTime: "18:00", isGlobal: true, isActive: true }
      ];
      slots = await DeliverySlot.insertMany(defaults);
    }

    res.json({ success: true, slots });
  } catch (error) {
    console.error("Get Delivery Slots Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Endpoint: Apply a coupon code (POST /customer/cart/apply-coupon)
 */
export const applyCoupon = async (req, res) => {
  try {
    const { couponCode, items, vendorId } = req.body;
    if (!couponCode) {
      return res.status(400).json({ success: false, message: "Coupon code is required" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart items are required to apply coupon" });
    }

    // Directly populate req.body and delegate to summary calculator
    req.body.couponCode = couponCode;
    return getCartSummary(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Endpoint: Remove currently applied coupon (POST /customer/cart/remove-coupon)
 */
export const removeCoupon = async (req, res) => {
  try {
    // Clear coupon and calculate updated summary
    req.body.couponCode = null;
    req.query.couponCode = null;
    return getCartSummary(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Endpoint: Get all active coupons (GET /customer/cart/coupons)
 */
export const getActiveCoupons = async (req, res) => {
  try {
    const subtotal = Number(req.query.subtotal || 0);
    const currentDate = new Date();

    const query = {
      status: "active",
      startDate: { $lte: currentDate },
      expiryDate: { $gte: currentDate }
    };

    if (subtotal > 0) {
      query.minCartValue = { $lte: subtotal };
    }

    const coupons = await Coupon.find(query).sort({ expiryDate: 1 });
    res.json({ success: true, coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Endpoint: Get eligible coupons for current cart (POST or GET /customer/cart/eligible-coupons)
 */
export const getEligibleCoupons = async (req, res) => {
  try {
    const rawItems = req.body?.items || req.query?.items || [];
    const items = typeof rawItems === "string" ? JSON.parse(rawItems) : rawItems;
    const vendorId = req.body?.vendorId || req.query?.vendorId || (items[0]?.vendorId || null);

    // Calculate cart item total
    let itemTotal = 0;
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const price = Number(item.price || 0);
        const qty = Number(item.qty || 1);
        itemTotal += price * qty;
      }
    } else {
      itemTotal = Number(req.body?.subtotal || req.query?.subtotal || 0);
    }

    const currentDate = new Date();

    // Query all active coupons within date validity
    const coupons = await Coupon.find({
      status: "active",
      $and: [
        {
          $or: [
            { valid_from: { $lte: currentDate } },
            { startDate: { $lte: currentDate } },
            { valid_from: { $exists: false }, startDate: { $exists: false } }
          ]
        },
        {
          $or: [
            { valid_to: { $gte: currentDate } },
            { expiryDate: { $gte: currentDate } },
            { valid_to: { $exists: false }, expiryDate: { $exists: false } }
          ]
        }
      ]
    }).lean();

    const eligibleCoupons = [];

    for (const coupon of coupons) {
      const minOrderVal = coupon.min_order_value !== undefined && coupon.min_order_value !== null ? coupon.min_order_value : (coupon.minCartValue || 0);
      const totalLimit = coupon.total_usage_limit !== undefined ? coupon.total_usage_limit : coupon.usageLimit;

      // 1. Min order value check
      if (itemTotal < minOrderVal) {
        continue;
      }

      // 2. Usage limit check
      if (totalLimit !== null && totalLimit !== undefined && (coupon.usedCount || 0) >= totalLimit) {
        continue;
      }

      // 3. Applicability scope & product coupon-allowed check
      const applicabilityRules = await CouponApplicability.find({ coupon_id: coupon._id });
      const isAllScope = applicabilityRules.length === 0 || applicabilityRules.some(r => r.scope_type === "All");

      let isEligibleForCart = false;

      if (Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          const masterProd = item.productId ? await Product.findById(item.productId) : null;
          const vpLink = (vendorId && item.productId) ? await VendorProduct.findOne({ vendorId, masterProductId: item.productId }) : null;

          const isCouponAllowed = (vpLink && vpLink.coupon_allowed !== undefined) ? vpLink.coupon_allowed : (masterProd?.coupon_allowed || false);

          if (!isCouponAllowed) continue;

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

          if (isScopeMatch) {
            isEligibleForCart = true;
            break;
          }
        }
      } else {
        // If cart items array is not provided, fallback to isAllScope
        isEligibleForCart = isAllScope;
      }

      if (isEligibleForCart) {
        eligibleCoupons.push({
          _id: coupon._id,
          code: coupon.code,
          discount_type: coupon.discount_type || coupon.discountType || "flat",
          discount_value: coupon.discount_value !== undefined ? coupon.discount_value : (coupon.discountValue || 0),
          max_discount_cap: coupon.max_discount_cap !== undefined && coupon.max_discount_cap !== null ? coupon.max_discount_cap : (coupon.maxDiscountCap || null),
          min_order_value: minOrderVal,
          expiry: coupon.valid_to || coupon.expiryDate
        });
      }
    }

    res.json({ success: true, coupons: eligibleCoupons });
  } catch (error) {
    console.error("Get Eligible Coupons Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
