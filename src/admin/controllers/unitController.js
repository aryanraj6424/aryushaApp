import Unit from "../models/Unit.js";
import mongoose from "mongoose";

// @desc    Get all active units
// @route   GET /api/admin/units or /api/admin/unit/all
// @access  Private (Admin) / Public
export const getUnits = async (req, res) => {
  try {
    const { categoryType } = req.query;
    const query = { isDeleted: { $ne: true } };

    if (categoryType && ["weight", "volume", "count"].includes(categoryType)) {
      query.categoryType = categoryType;
    }

    const units = await Unit.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      units,
      data: units,
    });
  } catch (error) {
    console.error("Error fetching units:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching units",
      error: error.message,
    });
  }
};

// @desc    Get single unit by ID
// @route   GET /api/admin/units/:id or /api/admin/unit/:id
// @access  Private (Admin)
export const getUnitById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid unit ID format",
      });
    }

    const unit = await Unit.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: "Unit not found",
      });
    }

    res.status(200).json({
      success: true,
      unit,
      data: unit,
    });
  } catch (error) {
    console.error("Error fetching unit:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching unit",
      error: error.message,
    });
  }
};

// @desc    Create new unit
// @route   POST /api/admin/units or /api/admin/unit/create
// @access  Private (Admin)
export const createUnit = async (req, res) => {
  try {
    const { name, shortName, categoryType, description, stepOptions, isActive } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Unit name is required",
      });
    }

    if (!shortName || !shortName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Short name is required",
      });
    }

    const formattedCategoryType = String(categoryType || "weight").toLowerCase();
    if (!["weight", "volume", "count"].includes(formattedCategoryType)) {
      return res.status(400).json({
        success: false,
        message: "Category type must be weight, volume, or count",
      });
    }

    const existing = await Unit.findOne({ name: name.trim(), isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Unit "${name.trim()}" already exists`,
      });
    }

    // Process & validate stepOptions array
    let processedSteps = [];
    if (Array.isArray(stepOptions)) {
      processedSteps = stepOptions
        .map((opt) => {
          if (typeof opt === "object" && opt.value !== undefined) {
            const val = Number(opt.value);
            const unitStr = opt.unit ? String(opt.unit).trim() : shortName.trim();
            const lbl = opt.label ? String(opt.label).trim() : `${val} ${unitStr}`;
            return val > 0 ? { value: val, unit: unitStr, label: lbl } : null;
          } else if (typeof opt === "number" || !isNaN(Number(opt))) {
            const val = Number(opt);
            return val > 0 ? { value: val, unit: shortName.trim(), label: `${val} ${shortName.trim()}` } : null;
          }
          return null;
        })
        .filter(Boolean);
    }

    const unit = new Unit({
      name: name.trim(),
      shortName: shortName.trim(),
      categoryType: formattedCategoryType,
      description: description ? String(description).trim() : "",
      stepOptions: processedSteps,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    await unit.save();

    res.status(201).json({
      success: true,
      message: "Unit created successfully",
      unit,
      data: unit,
    });
  } catch (error) {
    console.error("Error creating unit:", error);
    res.status(500).json({
      success: false,
      message: "Error creating unit",
      error: error.message,
    });
  }
};

// @desc    Update unit
// @route   PUT /api/admin/units/:id or /api/admin/unit/update/:id
// @access  Private (Admin)
export const updateUnit = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid unit ID format",
      });
    }

    const unit = await Unit.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: "Unit not found",
      });
    }

    const { name, shortName, categoryType, description, stepOptions, isActive } = req.body;

    if (name && name.trim() !== unit.name) {
      const existing = await Unit.findOne({ name: name.trim(), _id: { $ne: id }, isDeleted: { $ne: true } });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Unit "${name.trim()}" already exists`,
        });
      }
      unit.name = name.trim();
    }

    if (shortName) unit.shortName = shortName.trim();

    if (categoryType && ["weight", "volume", "count"].includes(String(categoryType).toLowerCase())) {
      unit.categoryType = String(categoryType).toLowerCase();
    }

    if (description !== undefined) unit.description = String(description).trim();
    if (isActive !== undefined) unit.isActive = Boolean(isActive);

    if (Array.isArray(stepOptions)) {
      const currentShort = unit.shortName;
      unit.stepOptions = stepOptions
        .map((opt) => {
          if (typeof opt === "object" && opt.value !== undefined) {
            const val = Number(opt.value);
            const unitStr = opt.unit ? String(opt.unit).trim() : currentShort;
            const lbl = opt.label ? String(opt.label).trim() : `${val} ${unitStr}`;
            return val > 0 ? { value: val, unit: unitStr, label: lbl } : null;
          } else if (typeof opt === "number" || !isNaN(Number(opt))) {
            const val = Number(opt);
            return val > 0 ? { value: val, unit: currentShort, label: `${val} ${currentShort}` } : null;
          }
          return null;
        })
        .filter(Boolean);
    }

    await unit.save();

    res.status(200).json({
      success: true,
      message: "Unit updated successfully",
      unit,
      data: unit,
    });
  } catch (error) {
    console.error("Error updating unit:", error);
    res.status(500).json({
      success: false,
      message: "Error updating unit",
      error: error.message,
    });
  }
};

// @desc    Delete unit (soft delete)
// @route   DELETE /api/admin/units/:id or /api/admin/unit/delete/:id
// @access  Private (Admin)
export const deleteUnit = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid unit ID format",
      });
    }

    const unit = await Unit.findByIdAndUpdate(
      id,
      { isDeleted: true, isActive: false },
      { new: true }
    );

    if (!unit) {
      return res.status(404).json({
        success: false,
        message: "Unit not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Unit deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting unit:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting unit",
      error: error.message,
    });
  }
};
