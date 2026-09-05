import FeeConfig from "../models/FeeConfig.js";
import { emitToRoom } from "../../socket/socketManager.js";
import { calculateOrderFees } from "../../utils/feeCalculator.js";

// @desc    Get all fee configurations (Admin table view)
// @route   GET /api/admin/fees
// @access  Private (Admin)
export const getFees = async (req, res) => {
  try {
    const fees = await FeeConfig.find().sort({ feeType: 1, scope: 1 });

    // Seed defaults if empty
    if (fees.length === 0) {
      const defaultFees = [
        { feeType: "handling", label: "Handling Fee", valueType: "flat", value: 10, scope: "global", isActive: true },
        { feeType: "delivery_partner", label: "Delivery Partner Fee", valueType: "flat", value: 30, scope: "global", isActive: true },
        { feeType: "gst", label: "GST & Charges", valueType: "percentage", value: 5, scope: "global", isActive: true },
        { feeType: "small_cart", label: "Small Cart Fee", valueType: "flat", value: 30, scope: "global", isActive: true, condition: { appliesBelowCartValue: 149 } },
        { feeType: "rain", label: "Rain Fee", valueType: "flat", value: 20, scope: "global", isActive: false },
      ];
      const seeded = await FeeConfig.insertMany(defaultFees);
      return res.status(200).json({ success: true, data: seeded });
    }

    res.status(200).json({ success: true, data: fees });
  } catch (error) {
    console.error("Error listing fees:", error);
    res.status(500).json({ success: false, message: "Error listing fee configurations" });
  }
};

// @desc    Create a new fee config (e.g. adding a zone override)
// @route   POST /api/admin/fees
// @access  Private (Admin)
export const createFee = async (req, res) => {
  try {
    const { feeType, label, valueType, value, scope, zoneId, isActive, condition } = req.body;

    if (!feeType || !label || !valueType || value === undefined) {
      return res.status(400).json({ success: false, message: "Required fields are missing." });
    }

    // Check duplicate override for same zone
    if (scope === "zone") {
      if (!zoneId) {
        return res.status(400).json({ success: false, message: "Zone name is required for zone-scoped overrides." });
      }
      const existing = await FeeConfig.findOne({ feeType, scope: "zone", zoneId: zoneId.trim() });
      if (existing) {
        return res.status(400).json({ success: false, message: `An override already exists for zone "${zoneId}" under fee type "${feeType}".` });
      }
    }

    const fee = await FeeConfig.create({
      feeType,
      label,
      valueType,
      value,
      scope: scope || "global",
      zoneId: scope === "zone" ? zoneId.trim() : null,
      isActive: isActive !== undefined ? isActive : true,
      condition: condition || null,
      updatedBy: req.user?._id || null,
    });

    // Socket Emit Update
    if (fee.scope === "global") {
      emitToRoom("fees:global", "fees:updated", { type: "global", feeType });
    } else if (fee.scope === "zone") {
      emitToRoom(`zone:${fee.zoneId}`, "fees:updated", { type: "zone", zoneId: fee.zoneId, feeType });
    }

    res.status(201).json({ success: true, message: "Fee configuration created successfully", data: fee });
  } catch (error) {
    console.error("Error creating fee config:", error);
    res.status(500).json({ success: false, message: "Error creating fee configuration" });
  }
};

// @desc    Update a fee config
// @route   PUT /api/admin/fees/:id
// @access  Private (Admin)
export const updateFee = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, valueType, value, isActive, condition, zoneId } = req.body;

    const fee = await FeeConfig.findById(id);
    if (!fee) {
      return res.status(404).json({ success: false, message: "Fee configuration not found" });
    }

    if (label !== undefined) fee.label = label;
    if (valueType !== undefined) fee.valueType = valueType;
    if (value !== undefined) fee.value = value;
    if (isActive !== undefined) fee.isActive = isActive;
    if (condition !== undefined) fee.condition = condition;
    if (fee.scope === "zone" && zoneId !== undefined) fee.zoneId = zoneId.trim();
    fee.updatedBy = req.user?._id || null;

    await fee.save();

    // Socket Emit Update
    if (fee.scope === "global") {
      emitToRoom("fees:global", "fees:updated", { type: "global", feeType: fee.feeType });
      // Also broadcast to any zone room since global values changed
      emitToRoom("fees:global", "fees:updated", { type: "global" });
    } else if (fee.scope === "zone") {
      emitToRoom(`zone:${fee.zoneId}`, "fees:updated", { type: "zone", zoneId: fee.zoneId, feeType: fee.feeType });
    }

    res.status(200).json({ success: true, message: "Fee configuration updated successfully", data: fee });
  } catch (error) {
    console.error("Error updating fee config:", error);
    res.status(500).json({ success: false, message: "Error updating fee configuration" });
  }
};

// @desc    Remove a fee config (e.g. deleting a zone override)
// @route   DELETE /api/admin/fees/:id
// @access  Private (Admin)
export const deleteFee = async (req, res) => {
  try {
    const { id } = req.params;
    const fee = await FeeConfig.findById(id);
    if (!fee) {
      return res.status(404).json({ success: false, message: "Fee configuration not found" });
    }

    await FeeConfig.findByIdAndDelete(id);

    // Socket Emit Update
    if (fee.scope === "global") {
      emitToRoom("fees:global", "fees:updated", { type: "global", feeType: fee.feeType });
    } else if (fee.scope === "zone") {
      emitToRoom(`zone:${fee.zoneId}`, "fees:updated", { type: "zone", zoneId: fee.zoneId, feeType: fee.feeType });
    }

    res.status(200).json({ success: true, message: "Fee configuration deleted successfully" });
  } catch (error) {
    console.error("Error deleting fee config:", error);
    res.status(500).json({ success: false, message: "Error deleting fee configuration" });
  }
};

// @desc    Get resolved active fees for a given zone (Customer checkout view)
// @route   GET /api/fees
// @access  Public
export const getCustomerFees = async (req, res) => {
  try {
    const { zoneId, cartTotal } = req.query;
    const total = parseFloat(cartTotal || 0);

    const { breakdown, totalFees } = await calculateOrderFees(total, zoneId || "");

    res.status(200).json({
      success: true,
      data: {
        zoneId: zoneId || null,
        cartTotal: total,
        breakdown,
        totalFees,
      }
    });
  } catch (error) {
    console.error("Error fetching resolved customer fees:", error);
    res.status(500).json({ success: false, message: "Error resolving active fees" });
  }
};
