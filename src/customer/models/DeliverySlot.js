import mongoose from "mongoose";

const deliverySlotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    startTime: {
      type: String,
      required: true
    },
    endTime: {
      type: String,
      required: true
    },
    // Cutoff time represented in 24h format e.g. "06:00", "10:00", "14:00", "18:00"
    cutoffTime: {
      type: String,
      required: true
    },
    isGlobal: {
      type: Boolean,
      default: true
    },
    vendorIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vendor"
      }
    ],
    city: {
      type: String,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("DeliverySlot", deliverySlotSchema);
