import mongoose from "mongoose";

const deliveryBoyEarningsSchema = new mongoose.Schema(
  {
    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
      required: true,
      unique: true,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    incentives: {
      type: Number,
      default: 0,
    },
    commissions: {
      type: Number,
      default: 0,
    },
    walletBalance: {
      type: Number,
      default: 0,
    },
    pendingBalance: {
      type: Number,
      default: 0,
    },
    settledBalance: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const DeliveryBoyEarnings = mongoose.models.DeliveryBoyEarnings || mongoose.model("DeliveryBoyEarnings", deliveryBoyEarningsSchema);
export default DeliveryBoyEarnings;
