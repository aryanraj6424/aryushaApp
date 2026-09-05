import {
  Product,
  ProductFamily,
  Category,
  SubCategory,
  ProductVariant
} from "../../models/catalog.js";
import CustomerOrder from "../../customer/models/CustomerOrder.js";
import mongoose from "mongoose";

// @desc    Get all vendor's own products
// @route   GET /api/vendor/product/all
// @access  Private/Vendor
export const getVendorProducts = async (req, res) => {
  try {
    const products = await Product.find({
      createdBy: req.vendor._id,
      creatorModel: "Vendor",
      isDeleted: { $ne: true }
    })
      .populate("categoryId", "name")
      .populate("subCategoryId", "name")
      .populate("familyId", "name")
      .populate("variants")
      .sort({ createdAt: -1 });

    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a product request by vendor
// @route   POST /api/vendor/product/create
// @access  Private/Vendor
export const createVendorProduct = async (req, res) => {
  try {
    const {
      categoryId,
      subCategoryId,
      familyId,
      name,
      brand,
      description,
      images,
      unitType,
      mrp,
      sellingPrice,
      sku,
      status,
      coupon_allowed,
      couponAllowed,
      max_discount_amount,
      maxDiscountAmount
    } = req.body;

    const finalCouponAllowed = coupon_allowed !== undefined ? Boolean(coupon_allowed) : Boolean(couponAllowed);
    const finalMaxDiscount = max_discount_amount !== undefined ? max_discount_amount : maxDiscountAmount;

    const normalizedUnitType = String(unitType).toLowerCase();
    if (!['weight', 'volume', 'count'].includes(normalizedUnitType)) {
      return res.status(400).json({ success: false, message: "Invalid Unit Type. Must be Weight, Volume, or Count." });
    }

    const cat = await Category.findOne({ _id: categoryId, isDeleted: { $ne: true } });
    if (!cat) return res.status(400).json({ success: false, message: "Invalid Category" });

    const sub = await SubCategory.findOne({ _id: subCategoryId, isDeleted: { $ne: true } });
    if (!sub) return res.status(400).json({ success: false, message: "Invalid Subcategory" });

    const fam = await ProductFamily.findOne({ _id: familyId, isDeleted: { $ne: true } });
    if (!fam) return res.status(400).json({ success: false, message: "Invalid Product Family" });

    const exists = await Product.findOne({ familyId, name: name.trim(), isDeleted: { $ne: true } });
    if (exists) {
      return res.status(400).json({ success: false, message: "Product name already exists in this family" });
    }

    if (mrp && sellingPrice && Number(sellingPrice) > Number(mrp)) {
      return res.status(400).json({ success: false, message: "Selling price cannot exceed MRP" });
    }

    const initialStatus = status === "draft" ? "draft" : "pending";

    const product = await Product.create({
      categoryId,
      subCategoryId,
      familyId,
      name: name.trim(),
      brand,
      description,
      images: Array.isArray(images) ? images : [],
      unitType: normalizedUnitType,
      coupon_allowed: finalCouponAllowed,
      max_discount_amount: finalMaxDiscount !== "" && finalMaxDiscount !== null && finalMaxDiscount !== undefined ? Number(finalMaxDiscount) : null,
      status: initialStatus,
      createdBy: req.vendor._id,
      creatorModel: "Vendor",
      approvalHistory: [
        {
          status: initialStatus,
          updatedBy: req.vendor._id,
          remarks: initialStatus === "draft" ? "Saved as draft by vendor" : "Submitted for approval by vendor",
          updatedAt: new Date()
        }
      ]
    });

    if (mrp && sellingPrice) {
      const label = normalizedUnitType === 'weight' ? '1 kg' : normalizedUnitType === 'volume' ? '1 L' : '1 pcs';
      await ProductVariant.create({
        productId: product._id,
        variantLabel: label,
        packSize: { value: 1, unit: normalizedUnitType === 'weight' ? 'kg' : normalizedUnitType === 'volume' ? 'l' : 'pcs' },
        sku: sku || `SKU-VND-${product.name.substring(0, 3).toUpperCase()}-${Date.now()}`,
        mrp: Number(mrp),
        basePrice: Number(sellingPrice),
        status: 'active',
        createdBy: req.vendor._id
      });
    }

    const populated = await Product.findById(product._id)
      .populate("categoryId", "name")
      .populate("subCategoryId", "name")
      .populate("familyId", "name")
      .populate("variants");

    res.status(201).json({ success: true, message: "Product request created successfully", product: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update vendor's own product
// @route   PUT /api/vendor/product/update/:id
// @access  Private/Vendor
export const updateVendorProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (product.creatorModel !== "Vendor" || product.createdBy.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({ success: false, message: "Access Denied: You cannot edit this product" });
    }

    const {
      name,
      brand,
      categoryId,
      subCategoryId,
      familyId,
      unitType,
      description,
      images,
      status,
      coupon_allowed,
      couponAllowed,
      max_discount_amount,
      maxDiscountAmount
    } = req.body;

    if (name) product.name = name;
    if (brand) product.brand = brand;
    if (categoryId) product.categoryId = categoryId;
    if (subCategoryId) product.subCategoryId = subCategoryId;
    if (familyId) product.familyId = familyId;
    
    if (unitType) {
      const normalizedUnit = String(unitType).toLowerCase();
      if (['weight', 'volume', 'count'].includes(normalizedUnit)) {
        product.unitType = normalizedUnit;
      }
    }
    if (description !== undefined) product.description = description;
    if (images) product.images = images;

    if (coupon_allowed !== undefined || couponAllowed !== undefined) {
      product.coupon_allowed = coupon_allowed !== undefined ? Boolean(coupon_allowed) : Boolean(couponAllowed);
    }
    if (max_discount_amount !== undefined || maxDiscountAmount !== undefined) {
      const val = max_discount_amount !== undefined ? max_discount_amount : maxDiscountAmount;
      product.max_discount_amount = val !== "" && val !== null && val !== undefined ? Number(val) : null;
    }

    // Transition status to draft or pending
    const updatedStatus = status === "draft" ? "draft" : "pending";
    product.status = updatedStatus;
    product.approvalHistory.push({
      status: updatedStatus,
      updatedBy: req.vendor._id,
      remarks: updatedStatus === "draft" ? "Saved as draft by vendor" : "Resubmitted due to vendor modifications",
      updatedAt: new Date()
    });

    await product.save();

    const populated = await Product.findById(product._id)
      .populate("categoryId", "name")
      .populate("subCategoryId", "name")
      .populate("familyId", "name")
      .populate("variants");

    res.json({ success: true, message: "Product request updated successfully", product: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete vendor's own product
// @route   DELETE /api/vendor/product/delete/:id
// @access  Private/Vendor
export const deleteVendorProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (product.creatorModel !== "Vendor" || product.createdBy.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({ success: false, message: "Access Denied: You cannot delete this product" });
    }

    if (product.status === "draft") {
      await ProductVariant.deleteMany({ productId: product._id });
      await Product.deleteOne({ _id: product._id });
      return res.json({ success: true, message: "Draft product permanently deleted successfully" });
    }

    product.isDeleted = true;
    product.status = "inactive";
    await product.save();

    // Mark variants as inactive
    await ProductVariant.updateMany({ productId: product._id }, { status: "inactive" });

    res.json({ success: true, message: "Product request deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk import products by vendor
// @route   POST /api/vendor/product/import
// @access  Private/Vendor
export const bulkImportVendorProducts = async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ success: false, message: "Products array is required" });
    }

    const createdList = [];
    for (const item of products) {
      if (!item.name || !item.categoryId || !item.subCategoryId || !item.familyId) {
        continue;
      }

      const normalizedUnitType = String(item.unitType || "weight").toLowerCase();
      const initialStatus = item.status === "draft" ? "draft" : "pending";

      const product = await Product.create({
        categoryId: item.categoryId,
        subCategoryId: item.subCategoryId,
        familyId: item.familyId,
        name: String(item.name).trim(),
        brand: item.brand,
        description: item.description,
        images: Array.isArray(item.images) ? item.images : [],
        unitType: normalizedUnitType,
        status: initialStatus,
        createdBy: req.vendor._id,
        creatorModel: "Vendor",
        approvalHistory: [
          {
            status: initialStatus,
            updatedBy: req.vendor._id,
            remarks: initialStatus === "draft" ? "Bulk imported as draft" : "Bulk imported (Submitted for approval)",
            updatedAt: new Date()
          }
        ]
      });

      if (item.mrp && item.sellingPrice) {
        const label = normalizedUnitType === 'weight' ? '1 kg' : normalizedUnitType === 'volume' ? '1 L' : '1 pcs';
        await ProductVariant.create({
          productId: product._id,
          variantLabel: label,
          packSize: { value: 1, unit: normalizedUnitType === 'weight' ? 'kg' : normalizedUnitType === 'volume' ? 'l' : 'pcs' },
          sku: item.sku || `SKU-VND-${product.name.substring(0, 3).toUpperCase()}-${Date.now()}`,
          mrp: Number(item.mrp),
          basePrice: Number(item.sellingPrice),
          status: 'active',
          createdBy: req.vendor._id
        });
      }
      createdList.push(product);
    }

    res.status(201).json({
      success: true,
      message: `Successfully imported ${createdList.length} products.`,
      products: createdList
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk update products by vendor
// @route   POST /api/vendor/product/bulk-update
// @access  Private/Vendor
export const bulkUpdateVendorProducts = async (req, res) => {
  try {
    const { productIds, updateData } = req.body;
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ success: false, message: "productIds array is required" });
    }

    const matchCriteria = {
      _id: { $in: productIds },
      createdBy: req.vendor._id,
      creatorModel: "Vendor",
      isDeleted: { $ne: true }
    };

    const allowedUpdates = {};
    if (updateData.brand !== undefined) allowedUpdates.brand = updateData.brand;
    if (updateData.description !== undefined) allowedUpdates.description = updateData.description;
    
    if (updateData.status === "draft" || updateData.status === "pending") {
      allowedUpdates.status = updateData.status;
    } else if (updateData.status) {
      allowedUpdates.status = "pending";
    }

    const result = await Product.updateMany(matchCriteria, { $set: allowedUpdates });

    if (allowedUpdates.status) {
      for (const pid of productIds) {
        const prod = await Product.findOne({ _id: pid, createdBy: req.vendor._id });
        if (prod) {
          prod.approvalHistory.push({
            status: allowedUpdates.status,
            updatedBy: req.vendor._id,
            remarks: `Bulk status update to ${allowedUpdates.status}`,
            updatedAt: new Date()
          });
          await prod.save();
        }
      }
    }

    res.json({ success: true, message: `Successfully updated ${result.modifiedCount} products.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk delete vendor's own products
// @route   POST /api/vendor/product/bulk-delete
// @access  Private/Vendor
export const bulkDeleteVendorProducts = async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ success: false, message: "productIds array is required" });
    }

    const products = await Product.find({
      _id: { $in: productIds },
      createdBy: req.vendor._id,
      creatorModel: "Vendor",
      isDeleted: { $ne: true }
    });

    const draftIds = products.filter(p => p.status === "draft").map(p => p._id);
    const nonDraftIds = products.filter(p => p.status !== "draft").map(p => p._id);

    let deletedCount = 0;

    if (draftIds.length > 0) {
      await ProductVariant.deleteMany({ productId: { $in: draftIds } });
      const delResult = await Product.deleteMany({ _id: { $in: draftIds } });
      deletedCount += delResult.deletedCount;
    }

    if (nonDraftIds.length > 0) {
      const softResult = await Product.updateMany(
        { _id: { $in: nonDraftIds } },
        { $set: { isDeleted: true, status: "inactive" } }
      );
      await ProductVariant.updateMany(
        { productId: { $in: nonDraftIds } },
        { $set: { status: "inactive" } }
      );
      deletedCount += softResult.modifiedCount;
    }

    res.json({ success: true, message: `Successfully deleted ${deletedCount} products.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Export vendor products
// @route   GET /api/vendor/product/export
// @access  Private/Vendor
export const exportVendorProducts = async (req, res) => {
  try {
    const products = await Product.find({
      createdBy: req.vendor._id,
      creatorModel: "Vendor",
      isDeleted: { $ne: true }
    })
    .populate("categoryId", "name")
    .populate("subCategoryId", "name")
    .populate("familyId", "name")
    .populate("variants");

    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get vendor's own product by ID
// @route   GET /api/vendor/products/:id
// @access  Private/Vendor
export const getVendorProductById = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
      $or: [
        { createdBy: req.vendor._id, creatorModel: "Vendor" },
        { creatorModel: "Admin" },
        { status: "approved" }
      ]
    })
      .populate("categoryId", "name")
      .populate("subCategoryId", "name")
      .populate("familyId", "name")
      .populate("variants");

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found or access denied" });
    }

    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get top selling products for the logged-in vendor
// @route   GET /api/vendor/products/top-selling
// @access  Private/Vendor
export const getTopSellingProducts = async (req, res) => {
  try {
    if (!req.vendor?._id) {
      return res.status(400).json({ success: false, message: "Vendor identification required" });
    }
    const vendorId = new mongoose.Types.ObjectId(req.vendor._id);
    const limit = req.query.limit ? parseInt(req.query.limit) : 100;

    const topSelling = await CustomerOrder.aggregate([
      {
        $match: {
          orderStatus: { $nin: ["Cancelled", "Rejected"] },
          $or: [
            { vendorId: vendorId },
            { "vendorSubOrders.vendorId": vendorId }
          ]
        }
      },
      {
        $project: {
          orderId: 1,
          orderStatus: 1,
          vendorId: 1,
          itemsToUse: {
            $cond: {
              if: { $eq: ["$vendorId", vendorId] },
              then: "$items",
              else: {
                $reduce: {
                  input: "$vendorSubOrders",
                  initialValue: [],
                  in: {
                    $cond: {
                      if: {
                        $and: [
                          { $eq: ["$$this.vendorId", vendorId] },
                          { $not: [{ $in: ["$$this.subOrderStatus", ["Cancelled", "Rejected"]] }] }
                        ]
                      },
                      then: { $concatArrays: ["$$value", "$$this.items"] },
                      else: "$$value"
                    }
                  }
                }
              }
            }
          }
        }
      },
      { $unwind: "$itemsToUse" },
      {
        $group: {
          _id: {
            productId: "$itemsToUse.productId",
            variantId: "$itemsToUse.variantId"
          },
          name: { $first: "$itemsToUse.name" },
          img: { $first: "$itemsToUse.img" },
          totalQtySold: { $sum: "$itemsToUse.qty" },
          totalRevenue: { $sum: { $multiply: ["$itemsToUse.price", "$itemsToUse.qty"] } },
          ordersSet: { $addToSet: "$_id" }
        }
      },
      {
        $project: {
          _id: 0,
          productId: "$_id.productId",
          variantId: "$_id.variantId",
          name: 1,
          img: 1,
          totalQtySold: 1,
          totalRevenue: 1,
          distinctOrdersCount: { $size: "$ordersSet" }
        }
      },
      { $sort: { totalQtySold: -1, totalRevenue: -1 } },
      { $limit: limit }
    ]);

    const variantIds = topSelling.map(item => item.variantId).filter(Boolean);
    const productIds = topSelling.map(item => item.productId).filter(Boolean);

    const [variants, products] = await Promise.all([
      ProductVariant.find({ _id: { $in: variantIds } }).lean(),
      Product.find({ _id: { $in: productIds } }).lean()
    ]);

    const variantMap = new Map(variants.map(v => [v._id.toString(), v]));
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    const enriched = topSelling.map(item => {
      const variant = variantMap.get(item.variantId?.toString());
      const product = productMap.get(item.productId?.toString());

      let packSize = "";
      if (variant?.variantLabel) {
        packSize = variant.variantLabel;
      } else if (variant?.packSize?.value) {
        packSize = `${variant.packSize.value} ${variant.packSize.unit || ""}`.trim();
      }

      return {
        productId: item.productId,
        variantId: item.variantId,
        name: item.name || product?.name || "Product",
        packSize,
        img: item.img || variant?.images?.[0] || product?.images?.[0] || "",
        totalQtySold: item.totalQtySold,
        totalRevenue: Number(item.totalRevenue.toFixed(2)),
        distinctOrdersCount: item.distinctOrdersCount
      };
    });

    res.json({
      success: true,
      count: enriched.length,
      topSelling: enriched
    });
  } catch (error) {
    console.error("getTopSellingProducts error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

