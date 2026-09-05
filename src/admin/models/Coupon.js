import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    // Unique coupon code, e.g., "FIRST50"
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    // Type of discount: flat amount or percentage rate
    discount_type: {
      type: String,
      enum: ["flat", "percentage"],
      required: true,
      default: "flat",
      alias: "discountType",
    },
    // Discount value (flat amount in ₹ or percentage value 0-100)
    discount_value: {
      type: Number,
      required: true,
      min: 0,
      alias: "discountValue",
    },
    // Minimum cart subtotal required to apply the coupon
    min_order_value: {
      type: Number,
      default: 0,
      min: 0,
      alias: "minCartValue",
    },
    // Maximum discount limit cap (global upper limit on discount amount)
    max_discount_cap: {
      type: Number,
      default: null,
      alias: "maxDiscountCap",
    },
    // Validity start date
    valid_from: {
      type: Date,
      required: true,
      alias: "startDate",
    },
    // Expiry date
    valid_to: {
      type: Date,
      required: true,
      alias: "expiryDate",
    },
    // Maximum uses allowed per unique customer account
    usage_limit_per_user: {
      type: Number,
      default: 1,
      min: 1,
      alias: "perCustomerLimit",
    },
    // Maximum total overall uses allowed across all customers
    total_usage_limit: {
      type: Number,
      default: null,
      alias: "usageLimit",
    },
    // Status of coupon: Active or Inactive
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    // Admin ID who created the coupon
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
      alias: "createdBy",
    },
    // Track how many times this coupon has been used in orders
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    strict: false, // Allow reading older schema documents smoothly
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for querying active, non-expired coupons efficiently
couponSchema.index({ status: 1, valid_to: 1 });

// Virtual check to verify if the coupon is expired
couponSchema.virtual("isExpired").get(function () {
  return new Date() > (this.valid_to || this.expiryDate);
});

const Coupon = mongoose.models.Coupon || mongoose.model("Coupon", couponSchema);

export default Coupon;
