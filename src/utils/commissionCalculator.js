import Vendor from "../vendor/models/Vendor.js";
import PlatformFeeSettings from "../admin/models/PlatformFeeSettings.js";
import { Product, VendorProduct } from "../models/catalog.js";

/**
 * Calculates commission on the item/product subtotal for a vendor's items in the order.
 * Follows the 4-tier hierarchy:
 * 1. Vendor Product override (specific listing override)
 * 2. Product-level override (master product default)
 * 3. Vendor-level override (vendor default)
 * 4. Global platform default
 * 
 * Excludes delivery charge, handling fee, GST, small cart fee, rain fee, etc.
 * 
 * @param {Object} order - The order document/object containing items (with productId, price, qty).
 * @param {String} vendorId - The ID of the vendor.
 * @returns {Promise<Object>} - { commissionAmount, rate, type, itemSubtotal, resolutionLevel, items }
 */
export const calculateVendorOrderCommission = async (order, vendorId) => {
  // 1. Fetch vendor to check override commission settings
  const vendor = await Vendor.findById(vendorId);
  
  // 2. Fetch platform global default commission settings
  const platformSettings = await PlatformFeeSettings.findOne() || {
    defaultCommissionType: "percentage",
    defaultCommissionValue: 8
  };

  // Determine vendor/global level configuration
  const vendorOrGlobalType = vendor?.commissionValue !== null && vendor?.commissionValue !== undefined && vendor?.commissionValue !== ""
    ? vendor.commissionType 
    : platformSettings.defaultCommissionType || "percentage";
      
  const vendorOrGlobalVal = vendor?.commissionValue !== null && vendor?.commissionValue !== undefined && vendor?.commissionValue !== ""
    ? vendor.commissionValue 
    : platformSettings.defaultCommissionValue ?? 8;

  const vendorOrGlobalLevel = vendor?.commissionValue !== null && vendor?.commissionValue !== undefined && vendor?.commissionValue !== ""
    ? "vendor"
    : "global";

  const orderItems = order.items || [];
  let itemSubtotal = 0;
  let totalCommissionAmount = 0;
  
  let hasVendorProductOverride = false;
  let hasProductOverride = false;
  let hasVendorOverride = vendorOrGlobalLevel === "vendor";

  // Accumulate inherited items subtotal for order-level processing (like flat commission)
  let inheritedSubtotal = 0;
  const processedItems = [];

  // Step 1: Process per-item overrides (Tier 1: VendorProduct -> Tier 2: Product)
  for (const item of orderItems) {
    const itemQty = item.qty || item.quantity || 0;
    const itemPrice = item.price || 0;
    const subtotal = itemPrice * itemQty;
    itemSubtotal += subtotal;

    // Check Tier 1: VendorProduct override
    let vpLink = null;
    if (item.vendorProductId) {
      vpLink = await VendorProduct.findById(item.vendorProductId);
    } else if (vendorId && item.productId) {
      vpLink = await VendorProduct.findOne({ vendorId, masterProductId: item.productId });
    }

    if (vpLink && vpLink.commissionType !== "inherit" && vpLink.commissionValue !== null && vpLink.commissionValue !== undefined) {
      hasVendorProductOverride = true;
      let itemCommission = 0;
      if (vpLink.commissionType === "percentage") {
        itemCommission = subtotal * (vpLink.commissionValue / 100);
      } else if (vpLink.commissionType === "flat") {
        itemCommission = vpLink.commissionValue * itemQty;
      }

      processedItems.push({
        productId: item.productId,
        variantId: item.variantId,
        name: item.name,
        price: itemPrice,
        qty: itemQty,
        img: item.img,
        calculatedCommissionAmount: Math.round((itemCommission + Number.EPSILON) * 100) / 100,
        commissionRateApplied: vpLink.commissionValue,
        commissionResolutionLevel: "vendorProduct",
        commissionType: vpLink.commissionType,
        commissionValue: vpLink.commissionValue
      });

      totalCommissionAmount += itemCommission;
    } else {
      // Check Tier 2: Product override
      const product = await Product.findById(item.productId);
      
      if (product && product.commissionType !== "inherit" && product.commissionValue !== null && product.commissionValue !== undefined) {
        hasProductOverride = true;
        let itemCommission = 0;
        if (product.commissionType === "percentage") {
          itemCommission = subtotal * (product.commissionValue / 100);
        } else if (product.commissionType === "flat") {
          itemCommission = product.commissionValue * itemQty; // Flat rate per unit sold
        }

        processedItems.push({
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          price: itemPrice,
          qty: itemQty,
          img: item.img,
          calculatedCommissionAmount: Math.round((itemCommission + Number.EPSILON) * 100) / 100,
          commissionRateApplied: product.commissionValue,
          commissionResolutionLevel: "product",
          commissionType: product.commissionType,
          commissionValue: product.commissionValue
        });

        totalCommissionAmount += itemCommission;
      } else {
        inheritedSubtotal += subtotal;
        processedItems.push({
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          price: itemPrice,
          qty: itemQty,
          img: item.img,
          // will calculate in second step
          calculatedCommissionAmount: 0,
          commissionRateApplied: vendorOrGlobalVal,
          commissionResolutionLevel: vendorOrGlobalLevel,
          commissionType: vendorOrGlobalType,
          commissionValue: vendorOrGlobalVal
        });
      }
    }
  }

  // Step 2: Process inherited items using vendor-level or global default
  if (inheritedSubtotal > 0) {
    let inheritedCommission = 0;
    if (vendorOrGlobalType === "percentage") {
      inheritedCommission = inheritedSubtotal * (vendorOrGlobalVal / 100);
    } else if (vendorOrGlobalType === "flat") {
      // If flat commission on the sale, apply once to the inherited total
      inheritedCommission = vendorOrGlobalVal;
    }

    totalCommissionAmount += inheritedCommission;

    // Distribute inherited commission among inherited items
    for (const item of processedItems) {
      if (item.commissionResolutionLevel !== "vendorProduct" && item.commissionResolutionLevel !== "product") {
        const itemSubtotal = item.price * item.qty;
        let itemCommission = 0;
        if (vendorOrGlobalType === "percentage") {
          itemCommission = itemSubtotal * (vendorOrGlobalVal / 100);
        } else if (vendorOrGlobalType === "flat") {
          // Distribute the flat fee proportionally based on item value
          itemCommission = inheritedSubtotal > 0 ? (itemSubtotal / inheritedSubtotal) * inheritedCommission : 0;
        }
        item.calculatedCommissionAmount = Math.round((itemCommission + Number.EPSILON) * 100) / 100;
      }
    }
  }

  // Resolve overall order resolution level by priority hierarchy
  let resolvedLevel = "global";
  if (hasVendorProductOverride) {
    resolvedLevel = "vendorProduct";
  } else if (hasProductOverride) {
    resolvedLevel = "product";
  } else if (hasVendorOverride) {
    resolvedLevel = "vendor";
  }

  // Determine overall order-level commission rate and type
  let overallType = vendorOrGlobalType;
  let overallRate = vendorOrGlobalVal;

  if (hasVendorProductOverride || hasProductOverride) {
    if (processedItems.length > 0) {
      const firstItem = processedItems[0];
      const firstType = firstItem.commissionType;
      const firstVal = firstItem.commissionRateApplied ?? firstItem.commissionValue;

      const allSame = processedItems.every(
        it => it.commissionType === firstType && (it.commissionRateApplied ?? it.commissionValue) === firstVal
      );

      if (allSame && firstType && firstType !== "inherit") {
        overallType = firstType;
        overallRate = firstVal ?? 0;
      } else {
        overallType = "mixed";
        overallRate = 0;
      }
    } else {
      overallType = "mixed";
      overallRate = 0;
    }
  }

  totalCommissionAmount = Math.round((totalCommissionAmount + Number.EPSILON) * 100) / 100;

  return {
    commissionAmount: totalCommissionAmount,
    rate: overallRate,
    type: overallType,
    itemSubtotal,
    resolutionLevel: resolvedLevel,
    items: processedItems
  };
};

/**
 * Synchronous commission calculator.
 * Sums pre-calculated item-level commission amounts, or falls back to legacy order-level math.
 */
export const calculateCommissionSync = (order, commType, commVal) => {
  const orderItems = order.items || [];
  let hasItemCommission = false;
  let totalCommission = 0;

  for (const item of orderItems) {
    if (item.calculatedCommissionAmount !== undefined && item.calculatedCommissionAmount !== null) {
      hasItemCommission = true;
      totalCommission += item.calculatedCommissionAmount;
    }
  }

  if (hasItemCommission) {
    return Math.round((totalCommission + Number.EPSILON) * 100) / 100;
  }

  if (order.vendorCommission && order.vendorCommission.amount !== undefined && order.vendorCommission.amount !== null) {
    return Math.round((order.vendorCommission.amount + Number.EPSILON) * 100) / 100;
  }

  // Fallback for legacy orders (prior to item-level commission tracking)
  let itemSubtotal = 0;
  for (const item of orderItems) {
    const itemQty = item.qty || item.quantity || 0;
    const itemPrice = item.price || 0;
    itemSubtotal += itemPrice * itemQty;
  }

  let commissionAmount = 0;
  if (commType === "percentage") {
    commissionAmount = itemSubtotal * (commVal / 100);
  } else if (commType === "flat") {
    commissionAmount = itemSubtotal > 0 ? commVal : 0;
  }

  return Math.round((commissionAmount + Number.EPSILON) * 100) / 100;
};

/**
 * Exposes a read-only commission preview for a single product & vendor.
 * Adheres strictly to 4-tier hierarchy: Vendor Product -> Product -> Vendor -> Platform default.
 */
export const getCommissionPreviewForProduct = async (productId, vendorId, vendorProductId = null) => {
  // Tier 1: Check VendorProduct override
  let vp = null;
  if (vendorProductId) {
    vp = await VendorProduct.findById(vendorProductId);
  } else if (vendorId && productId) {
    vp = await VendorProduct.findOne({ vendorId, masterProductId: productId });
  }

  if (vp && vp.commissionType !== "inherit" && vp.commissionValue !== null && vp.commissionValue !== undefined) {
    const type = vp.commissionType;
    const val = vp.commissionValue;
    return {
      commissionType: type,
      commissionValue: val,
      resolutionLevel: "vendorProduct",
      displayText: `Listing override: ${type === "percentage" ? `${val}%` : `₹${val} flat`}`
    };
  }

  // Tier 2: Check Product override
  if (productId) {
    const product = await Product.findById(productId);
    if (product && product.commissionType !== "inherit" && product.commissionValue !== null && product.commissionValue !== undefined) {
      const type = product.commissionType;
      const val = product.commissionValue;
      return {
        commissionType: type,
        commissionValue: val,
        resolutionLevel: "product",
        displayText: `Product override: ${type === "percentage" ? `${val}%` : `₹${val} flat`}`
      };
    }
  }

  // Tier 3: Check Vendor override
  if (vendorId) {
    const vendor = await Vendor.findById(vendorId);
    if (vendor && vendor.commissionValue !== null && vendor.commissionValue !== undefined && vendor.commissionValue !== "" && Number(vendor.commissionValue) > 0) {
      const type = vendor.commissionType || "percentage";
      const val = vendor.commissionValue;
      return {
        commissionType: type,
        commissionValue: val,
        resolutionLevel: "vendor",
        displayText: `Vendor override: ${type === "percentage" ? `${val}%` : `₹${val} flat`}`
      };
    }
  }

  // Tier 4: Platform global default
  const platformSettings = await PlatformFeeSettings.findOne() || {
    defaultCommissionType: "percentage",
    defaultCommissionValue: 8
  };
  const type = platformSettings.defaultCommissionType || "percentage";
  const val = platformSettings.defaultCommissionValue ?? 8;
  return {
    commissionType: type,
    commissionValue: val,
    resolutionLevel: "global",
    displayText: `Platform default: ${type === "percentage" ? `${val}%` : `₹${val} flat`}`
  };
};

