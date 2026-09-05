import mongoose from "mongoose";

const riderNotificationSchema = new mongoose.Schema(
  {
    deliveryBoyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
      required: true
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    type: {
      type: String,
      default: "general"
    },
    read: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

const RiderNotification = mongoose.models.RiderNotification || mongoose.model("RiderNotification", riderNotificationSchema);
export default RiderNotification;
