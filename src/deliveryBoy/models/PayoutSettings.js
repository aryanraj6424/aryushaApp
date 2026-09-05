import mongoose from "mongoose";

const payoutSettingsSchema = new mongoose.Schema(
  {
    payoutType: {
      type: String,
      enum: ["monthly", "daily", "per_order"],
      default: "per_order"
    },
    payoutAmount: {
      type: Number,
      default: 35
    },
    incentiveAmount: {
      type: Number,
      default: 5
    },
    commissionAmount: {
      type: Number,
      default: 2
    },
    onTimeThresholdMinutes: {
      type: Number,
      default: 45
    }
  },
  {
    timestamps: true
  }
);

const PayoutSettings = mongoose.models.PayoutSettings || mongoose.model("PayoutSettings", payoutSettingsSchema);
export default PayoutSettings;
