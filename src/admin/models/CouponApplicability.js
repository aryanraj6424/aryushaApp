import mongoose from "mongoose";

const couponApplicabilitySchema = new mongoose.Schema(
  {
    coupon_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
      index: true,
    },
    scope_type: {
      type: String,
      enum: ["All", "Category", "Subcategory", "ProductFamily", "Product"],
      required: true,
    },
    scope_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

couponApplicabilitySchema.index({ coupon_id: 1, scope_type: 1, scope_id: 1 });

const CouponApplicability =
  mongoose.models.CouponApplicability ||
  mongoose.model("CouponApplicability", couponApplicabilitySchema);

export default CouponApplicability;
