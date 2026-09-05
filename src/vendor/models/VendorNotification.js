import mongoose from "mongoose";

const vendorNotificationSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true
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
      enum: ["NEW_ORDER", "LOW_STOCK", "ORDER_DELIVERED", "ORDER_REJECTED", "GENERAL"],
      default: "GENERAL"
    },
    relatedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerOrder",
      default: null
    },
    relatedProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
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

vendorNotificationSchema.pre("save", function () {
  if (this.isModified("read")) {
    this.isRead = this.read;
  } else if (this.isModified("isRead")) {
    this.read = this.isRead;
  }
});

const VendorNotification = mongoose.models.VendorNotification || mongoose.model("VendorNotification", vendorNotificationSchema);
export default VendorNotification;
