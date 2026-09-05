import PlatformFeeSettings from "../models/PlatformFeeSettings.js";

// @desc    Get platform fee settings (CRUD read - single settings doc)
// @route   GET /api/admin/fee-settings
// @access  Private (Admin)
export const getFeeSettings = async (req, res) => {
  try {
    let settings = await PlatformFeeSettings.findOne();
    
    // Auto-create defaults if table is empty
    if (!settings) {
      settings = new PlatformFeeSettings({
        handlingFee: 0,
        smallCartFee: 0,
        smallCartThreshold: 0,
        deliveryPartnerFee: 0,
        gstPercent: 5,
        defaultCommissionType: "percentage",
        defaultCommissionValue: 8
      });
      await settings.save();
    }

    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error("Error fetching fee settings:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching platform fee settings",
      error: error.message
    });
  }
};

// @desc    Update platform fee settings (CRUD update - single settings doc)
// @route   PUT /api/admin/fee-settings
// @access  Private (Admin)
export const updateFeeSettings = async (req, res) => {
  try {
    const {
      handlingFee,
      smallCartFee,
      smallCartThreshold,
      deliveryPartnerFee,
      gstPercent,
      defaultCommissionType,
      defaultCommissionValue
    } = req.body;

    // Validation checks
    if (
      handlingFee < 0 ||
      smallCartFee < 0 ||
      smallCartThreshold < 0 ||
      deliveryPartnerFee < 0 ||
      (defaultCommissionValue !== undefined && defaultCommissionValue < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Fees, thresholds, and commission values cannot be negative values"
      });
    }

    if (gstPercent < 0 || gstPercent > 100) {
      return res.status(400).json({
        success: false,
        message: "GST percentage must be between 0 and 100"
      });
    }

    let settings = await PlatformFeeSettings.findOne();
    if (!settings) {
      settings = new PlatformFeeSettings();
    }

    settings.handlingFee = handlingFee !== undefined ? handlingFee : settings.handlingFee;
    settings.smallCartFee = smallCartFee !== undefined ? smallCartFee : settings.smallCartFee;
    settings.smallCartThreshold = smallCartThreshold !== undefined ? smallCartThreshold : settings.smallCartThreshold;
    settings.deliveryPartnerFee = deliveryPartnerFee !== undefined ? deliveryPartnerFee : settings.deliveryPartnerFee;
    settings.gstPercent = gstPercent !== undefined ? gstPercent : settings.gstPercent;
    
    if (defaultCommissionType !== undefined) settings.defaultCommissionType = defaultCommissionType;
    if (defaultCommissionValue !== undefined) settings.defaultCommissionValue = defaultCommissionValue;

    await settings.save();

    res.status(200).json({
      success: true,
      message: "Platform fee settings updated successfully",
      data: settings
    });
  } catch (error) {
    console.error("Error updating fee settings:", error);
    res.status(500).json({
      success: false,
      message: "Error updating platform fee settings",
      error: error.message
    });
  }
};
