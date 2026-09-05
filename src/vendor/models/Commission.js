import mongoose from "mongoose";

const commissionSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      unique: true,
    },
    rate: {
      type: Number,
      required: true,
      default: 10, // Default 10% commission
    },
    calculatedCommission: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Commission", commissionSchema);
