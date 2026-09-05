import { Product, VendorProduct, VendorListing, CommissionChangeHistory } from "../../models/catalog.js";
import VendorPermission from "../models/VendorPermission.js";

/**
 * ============================================================================
 * Vendor Product Reference Controller
 * ============================================================================
 * Enables vendors to search the master product catalog and link existing
 * master products to their store rather than creating duplicate catalog entries.
 * ============================================================================
 */

// @desc    Search master catalog products not yet linked to this vendor
// @route   GET /api/vendor/products/search
// @access  Private/Vendor
export const searchMasterProducts = async (req, res) => {
  try {
    const { query } = req.query;
    const vendorId = req.vendor?._id;

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId is required" });
    }

    // 1. Get IDs of products already linked to this vendor
    const linkedReferences = await VendorProduct.find({ vendorId })
      .select("masterProductId");
    
    const linkedProductIds = linkedReferences.map(r => r.masterProductId);

    // 2. Query products: must be created by Admin or be approved vendor products,
    //    and not yet linked by this vendor
    const searchFilter = {
      _id: { $nin: linkedProductIds },
      isDeleted: { $ne: true },
      $or: [
        { creatorModel: "Admin" },
        { status: "approved" }
      ]
    };

    // 3. Apply search query
    if (query && query.trim()) {
      const regex = new RegExp(query.trim(), "i");
      searchFilter.$and = [
        {
          $or: [
            { name: regex },
            { brand: regex }
          ]
        }
      ];
    }

    const products = await Product.find(searchFilter)
      .populate("categoryId", "name")
      .populate("subCategoryId", "name")
      .populate("familyId", "name")
      .populate("variants")
      .limit(30);

    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create vendor product reference (link existing master product)
// @route   POST /api/vendor/products
// @access  Private/Vendor
export const createVendorProductReference = async (req, res) => {
  try {
    const { masterProductId, price, mrp, stock, sku, condition, vendorNotes, variants, commissionType, commissionValue } = req.body;
    const vendorId = req.vendor?._id;

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId is required" });
    }

    if (!masterProductId || !price || !sku) {
      return res.status(400).json({ success: false, message: "masterProductId, price, and sku are required" });
    }

    if (mrp && Number(price) > Number(mrp)) {
      return res.status(400).json({ success: false, message: "Selling price cannot exceed MRP" });
    }

    // 1. Verify master product exists and is active/approved
    const product = await Product.findOne({ _id: masterProductId, isDeleted: { $ne: true } });
    if (!product) {
      return res.status(404).json({ success: false, message: "Master product not found or is inactive" });
    }

    // 2. Ensure it is not already linked
    const existingLink = await VendorProduct.findOne({ vendorId, masterProductId });
    if (existingLink) {
      return res.status(400).json({ success: false, message: "This product is already linked to your store" });
    }

    const { coupon_allowed, couponAllowed, max_discount_amount, maxDiscountAmount } = req.body;
    const finalCouponAllowed = coupon_allowed !== undefined ? Boolean(coupon_allowed) : Boolean(couponAllowed);
    const finalMaxDiscount = max_discount_amount !== undefined ? max_discount_amount : maxDiscountAmount;

    // Process commission override if set by Admin
    let targetCommType = "inherit";
    let targetCommVal = null;

    if (req.admin && (commissionType !== undefined || commissionValue !== undefined)) {
      targetCommType = commissionType || "inherit";
      targetCommVal = commissionValue !== "" && commissionValue !== null && commissionValue !== undefined ? Number(commissionValue) : null;
    }

    // 3. Create the reference entry (pending admin approval if created by vendor)
    const initialStatus = req.admin ? "active" : "pending";

    const link = await VendorProduct.create({
      masterProductId,
      vendorId,
      price: Number(price),
      mrp: mrp ? Number(mrp) : null,
      stock: Number(stock || 0),
      sku: sku.trim(),
      condition: condition || "New",
      vendorNotes: vendorNotes || "",
      coupon_allowed: finalCouponAllowed,
      max_discount_amount: finalMaxDiscount !== "" && finalMaxDiscount !== null && finalMaxDiscount !== undefined ? Number(finalMaxDiscount) : null,
      commissionType: targetCommType,
      commissionValue: targetCommVal,
      status: initialStatus
    });

    // 4. Audit trail: log if custom commission was assigned by Admin at creation
    if (req.admin && targetCommType !== "inherit" && targetCommVal !== null) {
      await CommissionChangeHistory.create({
        vendorProductId: link._id,
        previousType: "inherit",
        previousValue: null,
        newType: targetCommType,
        newValue: targetCommVal,
        changedBy: req.admin._id,
        changedAt: new Date()
      });
    }

    if (variants && Array.isArray(variants) && variants.length > 0) {
      const listings = variants.map(v => ({
        vendorId,
        variantId: v.variantId,
        sellingPrice: Number(v.sellingPrice),
        stock: { quantity: Number(v.stock || 0) },
        isAvailable: v.isAvailable !== false,
        createdBy: vendorId
      }));
      await VendorListing.insertMany(listings);
    }

    const populated = await VendorProduct.findById(link._id)
      .populate({
        path: "masterProductId",
        populate: [
          { path: "categoryId", select: "name" },
          { path: "subCategoryId", select: "name" },
          { path: "familyId", select: "name" },
          { path: "variants" }
        ]
      });

    res.status(201).json({ success: true, message: "Product linked to store successfully", vendorProduct: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all master products linked to this vendor
// @route   GET /api/vendor/products/my-links
// @access  Private/Vendor
export const getMyLinkedProducts = async (req, res) => {
  try {
    const vendorId = req.vendor?._id;
    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId is required" });
    }

    const linked = await VendorProduct.find({ vendorId })
      .populate({
        path: "masterProductId",
        populate: [
          { path: "categoryId", select: "name" },
          { path: "subCategoryId", select: "name" },
          { path: "familyId", select: "name" },
          {
            path: "variants",
            populate: { path: "vendorListings", match: { vendorId } }
          }
        ]
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, linked });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update linked product details (price, stock, notes, commission)
// @route   PUT /api/vendor/products/link/:id
// @access  Private/Vendor
export const updateLinkedProductDetails = async (req, res) => {
  try {
    const { price, mrp, stock, sku, condition, vendorNotes, variants, commissionType, commissionValue } = req.body;
    const vendorId = req.vendor?._id;

    const query = { _id: req.params.id };
    if (vendorId) query.vendorId = vendorId;

    const link = await VendorProduct.findOne(query);
    if (!link) {
      return res.status(404).json({ success: false, message: "Linked product reference not found" });
    }

    // Validate price vs MRP relation
    const targetPrice = price !== undefined ? Number(price) : link.price;
    const targetMrp = mrp !== undefined ? (mrp ? Number(mrp) : null) : link.mrp;
    if (targetMrp && targetPrice > targetMrp) {
      return res.status(400).json({ success: false, message: "Selling price cannot exceed MRP" });
    }

    if (price !== undefined) link.price = Number(price);
    if (mrp !== undefined) link.mrp = mrp ? Number(mrp) : null;
    if (stock !== undefined) link.stock = Number(stock);
    if (sku !== undefined) link.sku = sku.trim();
    if (condition !== undefined) link.condition = condition;
    if (vendorNotes !== undefined) link.vendorNotes = vendorNotes;

    const { coupon_allowed, couponAllowed, max_discount_amount, maxDiscountAmount } = req.body;
    if (coupon_allowed !== undefined || couponAllowed !== undefined) {
      link.coupon_allowed = coupon_allowed !== undefined ? Boolean(coupon_allowed) : Boolean(couponAllowed);
    }
    if (max_discount_amount !== undefined || maxDiscountAmount !== undefined) {
      const val = max_discount_amount !== undefined ? max_discount_amount : maxDiscountAmount;
      link.max_discount_amount = val !== "" && val !== null && val !== undefined ? Number(val) : null;
    }

    // Commission update logic (Admin ALWAYS allowed; Vendor allowed ONLY if commissionEditAccess permission is granted)
    if (req.admin && (commissionType !== undefined || commissionValue !== undefined)) {
      const targetType = commissionType || link.commissionType || "inherit";
      const targetVal = commissionValue !== "" && commissionValue !== null && commissionValue !== undefined ? Number(commissionValue) : null;

      if (link.commissionType !== targetType || link.commissionValue !== targetVal) {
        const prevType = link.commissionType || "inherit";
        const prevVal = link.commissionValue;

        link.commissionType = targetType;
        link.commissionValue = targetVal;

        await CommissionChangeHistory.create({
          vendorProductId: link._id,
          previousType: prevType,
          previousValue: prevVal,
          newType: targetType,
          newValue: targetVal,
          changedBy: req.admin._id,
          changedAt: new Date()
        });
      }
    } else if (req.vendor && (commissionType !== undefined || commissionValue !== undefined)) {
      const permDoc = await VendorPermission.findOne({ vendor: req.vendor._id });
      const canEditComm = permDoc?.permissions?.commissionEditAccess?.edit === true;

      if (canEditComm) {
        const targetType = commissionType || link.commissionType || "inherit";
        const targetVal = commissionValue !== "" && commissionValue !== null && commissionValue !== undefined ? Number(commissionValue) : null;
        link.commissionType = targetType;
        link.commissionValue = targetVal;
      }
    }

    await link.save();

    if (variants && Array.isArray(variants)) {
      const targetVendorId = vendorId || link.vendorId;
      for (const v of variants) {
        await VendorListing.findOneAndUpdate(
          { vendorId: targetVendorId, variantId: v.variantId },
          { 
            $set: { 
              sellingPrice: Number(v.sellingPrice), 
              mrp: v.mrp ? Number(v.mrp) : null,
              "stock.quantity": Number(v.stock || 0), 
              isAvailable: v.isAvailable !== false 
            } 
          },
          { upsert: true }
        );
      }
    }

    res.json({ success: true, message: "Linked product updated successfully", vendorProduct: link });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Unlink a master product from vendor's store
// @route   DELETE /api/vendor/products/link/:id
// @access  Private/Vendor
export const unlinkProductFromStore = async (req, res) => {
  try {
    const vendorId = req.vendor?._id;
    const query = { _id: req.params.id };
    if (vendorId) query.vendorId = vendorId;

    const link = await VendorProduct.findOne(query);
    if (!link) {
      return res.status(404).json({ success: false, message: "Linked product reference not found" });
    }

    const product = await Product.findById(link.masterProductId).populate("variants");
    if (product && product.variants) {
      const variantIds = product.variants.map(v => v._id);
      await VendorListing.deleteMany({ vendorId: link.vendorId, variantId: { $in: variantIds } });
    }

    await VendorProduct.deleteOne({ _id: req.params.id });
    res.json({ success: true, message: "Product unlinked successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get read-only commission preview for a product
// @route   GET /api/vendor/products/:productId/commission-preview
// @access  Private
export const getCommissionPreview = async (req, res) => {
  try {
    const { productId } = req.params;
    const vendorId = req.vendor?._id || req.query.vendorId;

    const { getCommissionPreviewForProduct } = await import("../../utils/commissionCalculator.js");
    const preview = await getCommissionPreviewForProduct(productId, vendorId);

    res.json({
      success: true,
      commission: preview
    });
  } catch (error) {
    console.error("Error fetching commission preview:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get commission change history for a vendor product listing
// @route   GET /api/vendor/products/link/:id/history
// @access  Private
export const getCommissionHistory = async (req, res) => {
  try {
    const history = await CommissionChangeHistory.find({ vendorProductId: req.params.id })
      .sort({ changedAt: -1 })
      .populate("changedBy", "name email");

    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
