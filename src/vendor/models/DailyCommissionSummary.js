import mongoose from "mongoose";

const { Schema } = mongoose;

const dailyCommissionSummarySchema = new Schema(
  {
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "Vendor",
      default: null, // null = platform-wide summary
      index: true,
    },
    date: { type: Date, required: true, index: true },

    totalOrders: { type: Number, default: 0, min: 0 },

    // Legacy field — kept equal to totalItemSubtotal for backwards compat
    totalSalesAmount:      { type: Number, default: 0, min: 0 },

    // ──────────────────────────────────────────────────
    // WATERFALL AGGREGATION FIELDS
    // ──────────────────────────────────────────────────

    // Sum of item subtotals (vendor commission base)
    totalItemSubtotal:     { type: Number, default: 0, min: 0 },

    // Sum of coupon discounts (absorbed by admin)
    totalCouponDiscount:   { type: Number, default: 0, min: 0 },

    // Sum of platform fees (handling + smallCart + delivery)
    totalPlatformFees:     { type: Number, default: 0, min: 0 },

    // Sum of commission amounts (admin's cut from vendors)
    totalCommissionAmount: { type: Number, default: 0, min: 0 },

    // Sum of vendor net payouts (itemSubtotal − commission)
    totalNetPayout:        { type: Number, default: 0, min: 0 },

    // Sum of admin net revenue (commission + platformFees − couponDiscount)
    totalAdminNetRevenue:  { type: Number, default: 0, min: 0 },

    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One row per vendor (or platform null) per day
dailyCommissionSummarySchema.index({ vendorId: 1, date: 1 }, { unique: true });
dailyCommissionSummarySchema.index({ date: 1, vendorId: 1 });

export default mongoose.model("DailyCommissionSummary", dailyCommissionSummarySchema);
