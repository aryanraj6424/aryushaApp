import mongoose from "mongoose";

const adminNotificationSchema = new mongoose.Schema(
  {
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
      enum: ["NEW_VENDOR_ONBOARDING", "NEW_ORDER_PLACED", "PAYOUT_REQUESTED", "GENERAL"],
      default: "GENERAL"
    },
    relatedVendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null
    },
    relatedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerOrder",
      default: null
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    isRead: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

adminNotificationSchema.pre("save", function () {
  if (this.isModified("read")) {
    this.isRead = this.read;
  } else if (this.isModified("isRead")) {
    this.read = this.isRead;
  }
});

const AdminNotification = mongoose.models.AdminNotification || mongoose.model("AdminNotification", adminNotificationSchema);
export default AdminNotification;
