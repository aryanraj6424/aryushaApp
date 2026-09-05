import FeeConfig from "../admin/models/FeeConfig.js";

/**
 * Calculates order-level fees based on FeeConfig rules.
 * Resolves zone overrides over global configurations, checks conditions,
 * and handles flat or percentage values.
 * 
 * @param {number} cartTotal 
 * @param {string} zoneId 
 * @returns {Promise<{ breakdown: Array, totalFees: number }>}
 */
export async function calculateOrderFees(cartTotal, zoneId) {
  try {
    // 1. Fetch active configurations for global scope and matching zone scope
    const query = {
      isActive: true,
      $or: [
        { scope: "global" },
        { scope: "zone", zoneId: zoneId }
      ]
    };
    
    const activeConfigs = await FeeConfig.find(query);

    // If no configs found in DB, seed defaults dynamically to prevent calculation breaks
    let configsToProcess = activeConfigs;
    if (configsToProcess.length === 0) {
      configsToProcess = [
        new FeeConfig({ feeType: "handling", label: "Handling Fee", valueType: "flat", value: 10, scope: "global" }),
        new FeeConfig({ feeType: "delivery_partner", label: "Delivery Partner Fee", valueType: "flat", value: 30, scope: "global" }),
        new FeeConfig({ feeType: "gst", label: "GST & Charges", valueType: "percentage", value: 5, scope: "global" }),
        new FeeConfig({ feeType: "small_cart", label: "Small Cart Fee", valueType: "flat", value: 30, scope: "global", condition: { appliesBelowCartValue: 149 } }),
      ];
    }

    // 2. Resolve overrides (zone override takes precedence over global per feeType)
    const resolvedMap = new Map();
    for (const config of configsToProcess) {
      const existing = resolvedMap.get(config.feeType);
      if (!existing) {
        resolvedMap.set(config.feeType, config);
      } else {
        // Zone scope takes precedence over Global scope
        if (config.scope === "zone" && existing.scope === "global") {
          resolvedMap.set(config.feeType, config);
        }
      }
    }

    const resolvedConfigs = Array.from(resolvedMap.values());
    const breakdown = [];
    let totalFees = 0;

    // 3. Compute each resolved fee amount
    for (const config of resolvedConfigs) {
      let amount = 0;
      let conditionApplies = true;

      if (config.condition) {
        let cond = config.condition;
        if (typeof cond === "string") {
          try {
            cond = JSON.parse(cond);
          } catch (e) {
            cond = null;
          }
        }
        
        if (cond && cond.appliesBelowCartValue !== undefined) {
          if (cartTotal >= cond.appliesBelowCartValue) {
            conditionApplies = false;
          }
        }
      }

      if (conditionApplies) {
        if (config.valueType === "flat") {
          amount = config.value;
        } else if (config.valueType === "percentage") {
          amount = Math.round((cartTotal * config.value) / 100);
        }
      }

      breakdown.push({
        feeType: config.feeType,
        label: config.label,
        valueType: config.valueType,
        value: config.value,
        amount: amount,
        condition: config.condition,
      });

      totalFees += amount;
    }

    return {
      breakdown,
      totalFees,
    };
  } catch (error) {
    console.error("Error in calculateOrderFees utility:", error);
    // Safe fallback values
    return {
      breakdown: [
        { feeType: "handling", label: "Handling Fee", valueType: "flat", value: 10, amount: 10 },
        { feeType: "delivery_partner", label: "Delivery Partner Fee", valueType: "flat", value: 30, amount: 30 },
        { feeType: "gst", label: "GST & Charges", valueType: "percentage", value: 5, amount: Math.round(cartTotal * 0.05) },
      ],
      totalFees: 10 + 30 + Math.round(cartTotal * 0.05),
    };
  }
}
