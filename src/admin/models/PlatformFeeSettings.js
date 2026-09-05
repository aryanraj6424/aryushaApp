import mongoose from "mongoose";

const platformFeeSettingsSchema = new mongoose.Schema(
  {
    // Fixed handling fee applied to every order
    handlingFee: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    // Fee applied if cart subtotal is below the smallCartThreshold
    smallCartFee: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    // Order subtotal threshold below which smallCartFee is applied
    smallCartThreshold: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    // Fixed fee applied to every order for delivery partner services
    deliveryPartnerFee: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    // GST / tax percentage applied to the order subtotal
    gstPercent: {
      type: Number,
      required: true,
      default: 5,
      min: 0,
      max: 100
    },
    // Global marketplace commission defaults
    defaultCommissionType: {
      type: String,
      enum: ["percentage", "flat"],
      default: "percentage"
    },
    defaultCommissionValue: {
      type: Number,
      required: true,
      default: 8,
      min: 0
    }
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" }
  }
);

export default mongoose.model("PlatformFeeSettings", platformFeeSettingsSchema);
