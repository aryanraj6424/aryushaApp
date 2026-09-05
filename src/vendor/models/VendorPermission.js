import mongoose from "mongoose";

const vendorPermissionSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      unique: true,
    },
    permissions: {
      category: {
        view: { type: Boolean, default: true },
        add: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
        delete: { type: Boolean, default: true },
      },
      subCategory: {
        view: { type: Boolean, default: true },
        add: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
        delete: { type: Boolean, default: true },
      },
      productFamily: {
        view: { type: Boolean, default: true },
        add: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
        delete: { type: Boolean, default: true },
      },
      areaAccess: {
        view: { type: Boolean, default: true },
      },
      couponAccess: {
        view: { type: Boolean, default: true },
        create: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
        delete: { type: Boolean, default: true },
      },
      product: {
        view: { type: Boolean, default: true },
        add: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
        delete: { type: Boolean, default: true },
      },
      commissionEditAccess: {
        edit: { type: Boolean, default: false },
      },
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster lookups
vendorPermissionSchema.index({ vendor: 1 });

export default mongoose.model("VendorPermission", vendorPermissionSchema);
