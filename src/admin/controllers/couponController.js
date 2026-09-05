import mongoose from "mongoose";
import Coupon from "../models/Coupon.js";
import CouponApplicability from "../models/CouponApplicability.js";

// @desc    Get all coupons with applicability details (CRUD read - list)
// @route   GET /api/admin/coupons/all
// @access  Private (Admin)
export const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ created_at: -1, createdAt: -1 }).lean();

    const couponIds = coupons.map((c) => c._id);
    const applicabilityList = await CouponApplicability.find({
      coupon_id: { $in: couponIds }
    }).lean();

    const applicabilityMap = {};
    applicabilityList.forEach((row) => {
      const cId = row.coupon_id.toString();
      if (!applicabilityMap[cId]) applicabilityMap[cId] = [];
      applicabilityMap[cId].push({
        _id: row._id,
        scope_type: row.scope_type,
        scope_id: row.scope_id
      });
    });

    const enrichedCoupons = coupons.map((coupon) => {
      const discountType = coupon.discount_type || coupon.discountType || "flat";
      const discountValue = coupon.discount_value !== undefined ? coupon.discount_value : (coupon.discountValue || 0);
      const minCartValue = coupon.min_order_value !== undefined ? coupon.min_order_value : (coupon.minCartValue || 0);
      const maxDiscountCap = coupon.max_discount_cap !== undefined && coupon.max_discount_cap !== null ? coupon.max_discount_cap : (coupon.maxDiscountCap || null);
      const startDate = coupon.valid_from || coupon.startDate || new Date();
      const expiryDate = coupon.valid_to || coupon.expiryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const perCustomerLimit = coupon.usage_limit_per_user !== undefined ? coupon.usage_limit_per_user : (coupon.perCustomerLimit || 1);
      const usageLimit = coupon.total_usage_limit !== undefined && coupon.total_usage_limit !== null ? coupon.total_usage_limit : (coupon.usageLimit || null);

      return {
        ...coupon,
        discountType,
        discount_type: discountType,
        discountValue,
        discount_value: discountValue,
        minCartValue,
        min_order_value: minCartValue,
        maxDiscountCap,
        max_discount_cap: maxDiscountCap,
        startDate,
        valid_from: startDate,
        expiryDate,
        valid_to: expiryDate,
        perCustomerLimit,
        usage_limit_per_user: perCustomerLimit,
        usageLimit,
        total_usage_limit: usageLimit,
        applicability: applicabilityMap[coupon._id.toString()] || [
          { scope_type: "All", scope_id: null }
        ]
      };
    });

    res.status(200).json({
      success: true,
      data: enrichedCoupons
    });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching coupons",
      error: error.message
    });
  }
};

// @desc    Get single coupon details (CRUD read - detail)
// @route   GET /api/admin/coupons/:id
// @access  Private (Admin)
export const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon ID format"
      });
    }

    const coupon = await Coupon.findById(id).lean();
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found"
      });
    }

    const applicability = await CouponApplicability.find({
      coupon_id: coupon._id
    }).lean();

    const discountType = coupon.discount_type || coupon.discountType || "flat";
    const discountValue = coupon.discount_value !== undefined ? coupon.discount_value : (coupon.discountValue || 0);
    const minCartValue = coupon.min_order_value !== undefined ? coupon.min_order_value : (coupon.minCartValue || 0);
    const maxDiscountCap = coupon.max_discount_cap !== undefined && coupon.max_discount_cap !== null ? coupon.max_discount_cap : (coupon.maxDiscountCap || null);
    const startDate = coupon.valid_from || coupon.startDate || new Date();
    const expiryDate = coupon.valid_to || coupon.expiryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const perCustomerLimit = coupon.usage_limit_per_user !== undefined ? coupon.usage_limit_per_user : (coupon.perCustomerLimit || 1);
    const usageLimit = coupon.total_usage_limit !== undefined && coupon.total_usage_limit !== null ? coupon.total_usage_limit : (coupon.usageLimit || null);

    res.status(200).json({
      success: true,
      data: {
        ...coupon,
        discountType,
        discount_type: discountType,
        discountValue,
        discount_value: discountValue,
        minCartValue,
        min_order_value: minCartValue,
        maxDiscountCap,
        max_discount_cap: maxDiscountCap,
        startDate,
        valid_from: startDate,
        expiryDate,
        valid_to: expiryDate,
        perCustomerLimit,
        usage_limit_per_user: perCustomerLimit,
        usageLimit,
        total_usage_limit: usageLimit,
        applicability:
          applicability.length > 0
            ? applicability
            : [{ scope_type: "All", scope_id: null }]
      }
    });
  } catch (error) {
    console.error("Error fetching coupon:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching coupon",
      error: error.message
    });
  }
};

// @desc    Create a new coupon with applicability rules (CRUD create)
// @route   POST /api/admin/coupons/create
// @access  Private (Admin)
export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      discount_type,
      discountType,
      discount_value,
      discountValue,
      min_order_value,
      minCartValue,
      max_discount_cap,
      maxDiscountCap,
      valid_from,
      startDate,
      valid_to,
      expiryDate,
      usage_limit_per_user,
      perCustomerLimit,
      total_usage_limit,
      usageLimit,
      status,
      applicability
    } = req.body;

    const finalCode = code?.trim().toUpperCase();
    const finalType = discount_type || discountType || "flat";
    const finalValue = Number(discount_value !== undefined ? discount_value : discountValue);
    const finalMinOrder = Number(min_order_value !== undefined ? min_order_value : (minCartValue || 0));
    const finalMaxCap = max_discount_cap !== undefined ? max_discount_cap : maxDiscountCap;
    const finalValidFrom = valid_from || startDate;
    const finalValidTo = valid_to || expiryDate;
    const finalPerUserLimit = usage_limit_per_user !== undefined ? usage_limit_per_user : (perCustomerLimit || 1);
    const finalTotalLimit = total_usage_limit !== undefined ? total_usage_limit : usageLimit;

    if (!finalCode || !finalType || isNaN(finalValue) || !finalValidFrom || !finalValidTo) {
      return res.status(400).json({
        success: false,
        message: "Required coupon fields are missing (code, discount_type, discount_value, valid_from, valid_to)"
      });
    }

    const existing = await Coupon.findOne({ code: finalCode });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Coupon code "${finalCode}" already exists`
      });
    }

    if (finalValue < 0) {
      return res.status(400).json({
        success: false,
        message: "Discount value cannot be negative"
      });
    }

    if (finalType === "percentage" && finalValue > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount rate cannot exceed 100%"
      });
    }

    const start = new Date(finalValidFrom);
    const expiry = new Date(finalValidTo);
    if (start >= expiry) {
      return res.status(400).json({
        success: false,
        message: "Expiry date must be after the start date"
      });
    }

    const coupon = new Coupon({
      code: finalCode,
      discount_type: finalType,
      discount_value: finalValue,
      min_order_value: finalMinOrder >= 0 ? finalMinOrder : 0,
      max_discount_cap: finalMaxCap !== "" && finalMaxCap !== null && finalMaxCap !== undefined ? Number(finalMaxCap) : null,
      valid_from: start,
      valid_to: expiry,
      usage_limit_per_user: Number(finalPerUserLimit) || 1,
      total_usage_limit: finalTotalLimit !== "" && finalTotalLimit !== null && finalTotalLimit !== undefined ? Number(finalTotalLimit) : null,
      status: status || "active",
      created_by: req.admin?._id || req.user?._id || null
    });

    await coupon.save();

    // Save Applicability rules
    let applicabilityDocs = [];
    if (Array.isArray(applicability) && applicability.length > 0) {
      applicabilityDocs = applicability.map((item) => ({
        coupon_id: coupon._id,
        scope_type: item.scope_type || item.scopeType || "All",
        scope_id: item.scope_id || item.scopeId || null
      }));
    } else {
      applicabilityDocs = [{ coupon_id: coupon._id, scope_type: "All", scope_id: null }];
    }

    await CouponApplicability.insertMany(applicabilityDocs);

    res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      data: {
        ...coupon.toObject(),
        applicability: applicabilityDocs
      }
    });
  } catch (error) {
    console.error("Error creating coupon:", error);
    res.status(500).json({
      success: false,
      message: "Error creating coupon",
      error: error.message
    });
  }
};

// @desc    Update coupon details & applicability rules (CRUD update)
// @route   PUT /api/admin/coupons/update/:id
// @access  Private (Admin)
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon ID format"
      });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found"
      });
    }

    const {
      code,
      discount_type,
      discountType,
      discount_value,
      discountValue,
      min_order_value,
      minCartValue,
      max_discount_cap,
      maxDiscountCap,
      valid_from,
      startDate,
      valid_to,
      expiryDate,
      usage_limit_per_user,
      perCustomerLimit,
      total_usage_limit,
      usageLimit,
      status,
      applicability
    } = req.body;

    if (code) {
      const formattedCode = code.trim().toUpperCase();
      if (formattedCode !== coupon.code) {
        const existing = await Coupon.findOne({ code: formattedCode, _id: { $ne: id } });
        if (existing) {
          return res.status(400).json({
            success: false,
            message: `Coupon code "${formattedCode}" already exists`
          });
        }
        coupon.code = formattedCode;
      }
    }

    const type = discount_type || discountType || coupon.discount_type || coupon.discountType || "flat";
    const rawVal = discount_value !== undefined ? discount_value : (discountValue !== undefined ? discountValue : (coupon.discount_value ?? coupon.discountValue));
    const value = Number(rawVal || 0);

    if (value < 0) {
      return res.status(400).json({
        success: false,
        message: "Discount value cannot be negative"
      });
    }

    if (type === "percentage" && value > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount rate cannot exceed 100%"
      });
    }

    coupon.discount_type = type;
    coupon.discount_value = value;

    const minVal = min_order_value !== undefined ? min_order_value : (minCartValue !== undefined ? minCartValue : (coupon.min_order_value ?? coupon.minCartValue));
    coupon.min_order_value = Number(minVal || 0);

    const maxCap = max_discount_cap !== undefined ? max_discount_cap : (maxDiscountCap !== undefined ? maxDiscountCap : (coupon.max_discount_cap ?? coupon.maxDiscountCap));
    coupon.max_discount_cap = maxCap !== "" && maxCap !== null && maxCap !== undefined ? Number(maxCap) : null;

    const startInput = valid_from || startDate;
    const expiryInput = valid_to || expiryDate;
    const start = startInput ? new Date(startInput) : new Date(coupon.valid_from || coupon.startDate || Date.now());
    const expiry = expiryInput ? new Date(expiryInput) : new Date(coupon.valid_to || coupon.expiryDate || Date.now() + 86400000);

    if (start >= expiry) {
      return res.status(400).json({
        success: false,
        message: "Expiry date must be after the start date"
      });
    }

    coupon.valid_from = start;
    coupon.valid_to = expiry;

    const perUser = usage_limit_per_user !== undefined ? usage_limit_per_user : (perCustomerLimit !== undefined ? perCustomerLimit : (coupon.usage_limit_per_user ?? coupon.perCustomerLimit));
    coupon.usage_limit_per_user = Number(perUser) || 1;

    const totLimit = total_usage_limit !== undefined ? total_usage_limit : (usageLimit !== undefined ? usageLimit : (coupon.total_usage_limit ?? coupon.usageLimit));
    coupon.total_usage_limit = totLimit !== "" && totLimit !== null && totLimit !== undefined ? Number(totLimit) : null;

    if (status !== undefined) coupon.status = status;

    await coupon.save();

    // Update Applicability if provided
    let updatedApplicability = [];
    if (Array.isArray(applicability)) {
      await CouponApplicability.deleteMany({ coupon_id: coupon._id });
      const docs = applicability.length > 0
        ? applicability.map((item) => ({
            coupon_id: coupon._id,
            scope_type: item.scope_type || item.scopeType || "All",
            scope_id: item.scope_id || item.scopeId || null
          }))
        : [{ coupon_id: coupon._id, scope_type: "All", scope_id: null }];

      updatedApplicability = await CouponApplicability.insertMany(docs);
    } else {
      updatedApplicability = await CouponApplicability.find({ coupon_id: coupon._id }).lean();
    }

    res.status(200).json({
      success: true,
      message: "Coupon updated successfully",
      data: {
        ...coupon.toObject(),
        applicability: updatedApplicability
      }
    });
  } catch (error) {
    console.error("Error updating coupon:", error);
    res.status(500).json({
      success: false,
      message: "Error updating coupon",
      error: error.message
    });
  }
};

// @desc    Delete a coupon permanently (CRUD delete)
// @route   DELETE /api/admin/coupons/delete/:id
// @access  Private (Admin)
export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon ID format"
      });
    }

    const deleted = await Coupon.findByIdAndDelete(id);
    await CouponApplicability.deleteMany({ coupon_id: id });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Coupon deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting coupon",
      error: error.message
    });
  }
};
