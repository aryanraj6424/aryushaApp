import mongoose from "mongoose";

const { Schema } = mongoose;

const commissionLedgerSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "CustomerOrder",
      required: true,
      index: true,
    },
    orderIdStr: {
      type: String,
      required: true,
      index: true,
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    orderDate: {
      type: Date,
      required: true,
      index: true,
    },

    // ──────────────────────────────────────────────────
    // WATERFALL BREAKDOWN FIELDS
    // ──────────────────────────────────────────────────

    // Grand total paid by the customer
    grandTotal: { type: Number, default: 0 },

    // Item-only subtotal — the ONLY valid base for commission
    // Legacy alias: orderAmount (kept for backwards compat, always = itemSubtotal)
    orderAmount:   { type: Number, required: true, min: 0 },
    itemSubtotal:  { type: Number, required: true, min: 0 },

    // Coupon discount applied on this order (absorbed by admin, not vendor)
    couponCode:     { type: String,  default: null },
    couponDiscount: { type: Number,  default: 0 },

    // Platform-only fees: go entirely to admin, NOT part of vendor commission math
    platformFees: {
      handlingFee:    { type: Number, default: 0 },
      smallCartFee:   { type: Number, default: 0 },
      deliveryCharge: { type: Number, default: 0 },
    },

    // Commission fields
    commissionType:         { type: String, enum: ["percentage", "flat", "mixed"], required: true },
    commissionRateApplied:  { type: Number, required: true, min: 0 },
    commissionAmount:       { type: Number, required: true, min: 0 },

    // Vendor net earning = itemSubtotal − commissionAmount
    // (coupon discount does NOT reduce vendor earning — admin absorbs it)
    netPayout: { type: Number, default: 0 },

    // Admin net revenue = commissionAmount + platformFeesTotal − couponDiscount
    adminNetRevenue: { type: Number, default: 0 },

    resolutionLevel: {
      type: String,
      enum: ["vendorProduct", "product", "vendor", "global"],
      required: true,
    },
    orderStatus: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

// Compound index for vendor-filtered date-sorted financial queries
commissionLedgerSchema.index({ vendorId: 1, orderDate: -1, orderStatus: 1 });
commissionLedgerSchema.index({ orderDate: -1, orderStatus: 1 });

export default mongoose.model("CommissionLedger", commissionLedgerSchema);
