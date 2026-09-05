import CustomerOrder from "../customer/models/CustomerOrder.js";
import CommissionLedger from "../vendor/models/CommissionLedger.js";
import { calculateVendorOrderCommission } from "./commissionCalculator.js";
import { runReconciliationJob } from "./reconciliationJob.js";
import { buildWaterfall, computeItemSubtotal, extractPlatformFees } from "./ledgerSyncHelper.js";

/**
 * Backfill migration: processes all historical orders, ensures they have
 * commission metadata on the order document, and creates CommissionLedger
 * entries with the full waterfall breakdown.
 *
 * After all CommissionLedger entries are created/updated, runs the reconciliation
 * job to rebuild DailyCommissionSummary (which also fixes the ₹0 bug by writing
 * all new fields unconditionally).
 */
export const runBackfillMigration = async () => {
  console.log("[Backfill] Starting historical order finance backfill...");
  const stats = { totalOrdersScanned: 0, ordersUpdated: 0, ledgersCreated: 0, ledgersUpdated: 0 };

  try {
    const orders = await CustomerOrder.find({});
    stats.totalOrdersScanned = orders.length;

    for (const order of orders) {
      let isModified = false;

      // 1. Ensure order has commission metadata
      const hasCommission = order.vendorCommission && order.vendorCommission.amount !== undefined;
      const hasLineItem   = order.items?.length > 0 && order.items[0].calculatedCommissionAmount !== undefined;

      if (!hasCommission || !hasLineItem) {
        const commDetails = await calculateVendorOrderCommission({ items: order.items }, order.vendorId);

        if (Array.isArray(order.items)) {
          order.items = order.items.map((item, idx) => {
            const resolved =
              commDetails.items.find(
                r => r.productId?.toString() === item.productId?.toString() &&
                     r.variantId?.toString()  === item.variantId?.toString()
              ) || commDetails.items[idx];
            if (resolved) {
              item.calculatedCommissionAmount = resolved.calculatedCommissionAmount;
              item.commissionRateApplied      = resolved.commissionRateApplied;
              item.commissionResolutionLevel  = resolved.commissionResolutionLevel;
            }
            return item;
          });
        }

        order.vendorCommission = {
          rate:           commDetails.rate,
          commissionType: commDetails.type,
          amount:         commDetails.commissionAmount,
          calculatedAt:   order.createdAt,
        };
        isModified = true;
      }

      if (isModified) {
        order.markModified("items");
        await order.save();
        stats.ordersUpdated++;
      }

      // 2. Build the full waterfall breakdown for this order
      const wf = buildWaterfall(order);

      let resolutionLevel = order.items?.[0]?.commissionResolutionLevel || "global";
      if (resolutionLevel === "none") resolutionLevel = "global";

      // 3. Create or UPDATE CommissionLedger entry with all new waterfall fields
      const existing = await CommissionLedger.findOne({ orderId: order._id });

      if (!existing) {
        await CommissionLedger.create({
          orderId:               order._id,
          orderIdStr:            order.orderId,
          vendorId:              order.vendorId,
          orderDate:             order.createdAt,
          grandTotal:            wf.grandTotal,
          orderAmount:           wf.itemSubtotal,     // legacy
          itemSubtotal:          wf.itemSubtotal,
          couponCode:            wf.couponCode,
          couponDiscount:        wf.couponDiscount,
          platformFees:          wf.platformFees,
          commissionType:        wf.commissionType,
          commissionRateApplied: wf.commissionRate,
          commissionAmount:      wf.commissionAmount,
          netPayout:             wf.netPayout,
          adminNetRevenue:       wf.adminNetRevenue,
          resolutionLevel,
          orderStatus:           order.orderStatus,
        });
        stats.ledgersCreated++;
      } else {
        // Update existing entry to populate any new fields that were missing
        await CommissionLedger.findOneAndUpdate(
          { orderId: order._id },
          {
            $set: {
              grandTotal:      wf.grandTotal,
              itemSubtotal:    wf.itemSubtotal,
              orderAmount:     wf.itemSubtotal,
              couponCode:      wf.couponCode,
              couponDiscount:  wf.couponDiscount,
              platformFees:    wf.platformFees,
              commissionAmount: wf.commissionAmount,
              netPayout:       wf.netPayout,
              adminNetRevenue: wf.adminNetRevenue,
              orderStatus:     order.orderStatus,
            },
          }
        );
        stats.ledgersUpdated++;
      }
    }

    // 4. Rebuild DailyCommissionSummary from the updated ledger
    console.log("[Backfill] Ledger entries done. Rebuilding daily summaries...");
    const reconResults = await runReconciliationJob();

    return { ...stats, reconciliation: reconResults };
  } catch (error) {
    console.error("[Backfill] Migration failed:", error);
    throw error;
  }
};
