import mongoose from "mongoose";

const feeConfigSchema = new mongoose.Schema(
  {
    feeType: {
      type: String,
      required: true,
      enum: ["handling", "delivery_partner", "gst", "small_cart", "rain", "custom"],
    },
    label: {
      type: String,
      required: true,
    },
    valueType: {
      type: String,
      required: true,
      enum: ["flat", "percentage"],
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    scope: {
      type: String,
      required: true,
      enum: ["global", "zone"],
      default: "global",
    },
    zoneId: {
      type: String,
      default: null, // Stores name of city/zone (e.g. "Noida", "Delhi")
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    condition: {
      type: mongoose.Schema.Types.Mixed, // e.g. { appliesBelowCartValue: 199 }
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster resolution checks
feeConfigSchema.index({ feeType: 1, scope: 1, zoneId: 1 });

export default mongoose.model("FeeConfig", feeConfigSchema);
