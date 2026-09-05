import Attribute from "../models/Attribute.js";

// Get all attributes
export const getAttributes = async (req, res) => {
  try {
    const attributes = await Attribute.find({ isActive: true }).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: attributes,
      attributes: attributes,
    });
  } catch (error) {
    console.error("Error fetching attributes:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching attributes",
      error: error.message,
    });
  }
};

// Get single attribute
export const getAttribute = async (req, res) => {
  try {
    const attribute = await Attribute.findById(req.params.id);
    
    if (!attribute) {
      return res.status(404).json({
        success: false,
        message: "Attribute not found",
      });
    }
    
    res.status(200).json({
      success: true,
      data: attribute,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching attribute",
      error: error.message,
    });
  }
};

// Create attribute
export const createAttribute = async (req, res) => {
  try {
    const { name, description, type, values } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Attribute name is required",
      });
    }

    const existingAttribute = await Attribute.findOne({ name });
    if (existingAttribute) {
      return res.status(400).json({
        success: false,
        message: "Attribute already exists",
      });
    }

    const attribute = new Attribute({
      name,
      description,
      type: type || "text",
      values: values || [],
    });

    await attribute.save();

    res.status(201).json({
      success: true,
      message: "Attribute created successfully",
      data: attribute,
    });
  } catch (error) {
    console.error("Error creating attribute:", error);
    res.status(500).json({
      success: false,
      message: "Error creating attribute",
      error: error.message,
    });
  }
};

// Update attribute
export const updateAttribute = async (req, res) => {
  try {
    const { name, description, type, values, isActive } = req.body;

    let attribute = await Attribute.findById(req.params.id);

    if (!attribute) {
      return res.status(404).json({
        success: false,
        message: "Attribute not found",
      });
    }

    if (name) attribute.name = name;
    if (description) attribute.description = description;
    if (type) attribute.type = type;
    if (values) attribute.values = values;
    if (isActive !== undefined) attribute.isActive = isActive;

    await attribute.save();

    res.status(200).json({
      success: true,
      message: "Attribute updated successfully",
      data: attribute,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating attribute",
      error: error.message,
    });
  }
};

// Delete attribute
export const deleteAttribute = async (req, res) => {
  try {
    const attribute = await Attribute.findByIdAndDelete(req.params.id);

    if (!attribute) {
      return res.status(404).json({
        success: false,
        message: "Attribute not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Attribute deleted successfully",
      data: attribute,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting attribute",
      error: error.message,
    });
  }
};
