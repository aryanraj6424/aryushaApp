import CommissionLedger from "../vendor/models/CommissionLedger.js";
import DailyCommissionSummary from "../vendor/models/DailyCommissionSummary.js";
import { getStartOfDayUTC } from "./ledgerSyncHelper.js";

/**
 * Runs a full audit reconciliation of DailyCommissionSummary against
 * the source of truth (CommissionLedger).
 *
 * KEY FIX FOR ₹0 BUG:
 * Previously, this only wrote new fields when a discrepancy was found.
 * But for existing rows where totalSalesAmount == computedItemSubtotal,
 * no discrepancy was detected so totalItemSubtotal was never written → showed ₹0.
 *
 * Now we ALWAYS write all fields (upsert), and separately track mismatches for logging.
 *
 * Waterfall fields: itemSubtotal, couponDiscount, platformFees, commission, netPayout, adminNetRevenue
 */
export const runReconciliationJob = async () => {
  console.log("[Reconciliation] Starting financial reconciliation job...");
  const results = { processedDates: 0, mismatchesFound: 0, correctionsApplied: 0, logs: [] };

  try {
    const dates      = await CommissionLedger.distinct("orderDate");
    const uniqueDays = Array.from(new Set(dates.map(d => getStartOfDayUTC(d).toISOString())));
    const vendorIds  = await CommissionLedger.distinct("vendorId");
    const targets    = [...vendorIds, null]; // null = platform-wide

    for (const dayStr of uniqueDays) {
      const dateStart = new Date(dayStr);
      const dateEnd   = new Date(dateStart);
      dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);
      results.processedDates++;

      for (const vendorId of targets) {
        const query = {
          orderDate:   { $gte: dateStart, $lt: dateEnd },
          orderStatus: { $nin: ["Cancelled", "Rejected", "Returned"] },
        };
        if (vendorId !== null) query.vendorId = vendorId;

        const entries = await CommissionLedger.find(query);
        const n = entries.length;

        // ── Compute waterfall totals from ledger (source of truth) ──────────
        const computedOrders        = n;
        const computedItemSubtotal  = round(entries.reduce((s, e) => s + (e.itemSubtotal ?? e.orderAmount), 0));
        const computedCoupon        = round(entries.reduce((s, e) => s + (e.couponDiscount || 0), 0));
        const computedPlatformFees  = round(entries.reduce((s, e) => s + platTotal(e), 0));
        const computedCommission    = round(entries.reduce((s, e) => s + e.commissionAmount, 0));
        const computedNetPayout     = round(entries.reduce((s, e) => s + (e.netPayout ?? Math.max(0, (e.itemSubtotal ?? e.orderAmount) - e.commissionAmount)), 0));
        const computedAdminRevenue  = round(entries.reduce((s, e) => s + (e.adminNetRevenue ?? (e.commissionAmount + platTotal(e) - (e.couponDiscount || 0))), 0));

        // ── Check existing row for mismatch (log only) ──────────────────────
        const existing = await DailyCommissionSummary.findOne({ vendorId, date: dateStart });
        const hasMismatch =
          !existing ||
          existing.totalOrders           !== computedOrders        ||
          diff(existing.totalItemSubtotal ?? existing.totalSalesAmount, computedItemSubtotal) ||
          diff(existing.totalCommissionAmount, computedCommission)  ||
          diff(existing.totalNetPayout,    computedNetPayout)       ||
          diff(existing.totalPlatformFees, computedPlatformFees)   ||
          diff(existing.totalCouponDiscount, computedCoupon)       ||
          diff(existing.totalAdminNetRevenue, computedAdminRevenue);

        if (hasMismatch && existing) {
          results.mismatchesFound++;
          const scope = vendorId ? `Vendor ${vendorId}` : "Platform-wide";
          const logMsg = `Mismatch ${scope} on ${dayStr.split("T")[0]}: computed itemSubtotal=${computedItemSubtotal}, commission=${computedCommission}, netPayout=${computedNetPayout}, platformFees=${computedPlatformFees}, coupon=${computedCoupon}, adminRevenue=${computedAdminRevenue}`;
          console.warn(`[Reconciliation] ${logMsg}`);
          results.logs.push(logMsg);
        }

        // ── ALWAYS write all fields (this is the ₹0 bug fix) ───────────────
        await DailyCommissionSummary.findOneAndUpdate(
          { vendorId, date: dateStart },
          {
            $set: {
              totalOrders:           computedOrders,
              totalSalesAmount:      computedItemSubtotal,   // legacy alias
              totalItemSubtotal:     computedItemSubtotal,
              totalCouponDiscount:   computedCoupon,
              totalPlatformFees:     computedPlatformFees,
              totalCommissionAmount: computedCommission,
              totalNetPayout:        computedNetPayout,
              totalAdminNetRevenue:  computedAdminRevenue,
              lastUpdatedAt:         new Date(),
            },
          },
          { upsert: true }
        );
        results.correctionsApplied++;
      }
    }

    console.log(
      `[Reconciliation] Done. Processed ${results.processedDates} day-vendor pairs. ` +
      `Mismatches: ${results.mismatchesFound}. Rows written: ${results.correctionsApplied}.`
    );
    return results;
  } catch (error) {
    console.error("[Reconciliation] Job failed:", error);
    throw error;
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const round = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const diff  = (a, b) => Math.abs((a || 0) - (b || 0)) > 0.01;
const platTotal = (e) =>
  (e.platformFees?.handlingFee    || 0) +
  (e.platformFees?.smallCartFee   || 0) +
  (e.platformFees?.deliveryCharge || 0);
