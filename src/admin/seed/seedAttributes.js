import Attribute from "../models/Attribute.js";
import mongoose from "mongoose";

const seedAttributes = async () => {
  try {
    // Check if attributes already exist
    const count = await Attribute.countDocuments();
    if (count > 0) {
      console.log("✓ Attributes already exist in database");
      return;
    }

    const defaultAttributes = [
      {
        name: "Color",
        description: "Product color",
        type: "color",
        values: ["Red", "Blue", "Green", "Black", "White", "Yellow"],
      },
      {
        name: "Size",
        description: "Product size",
        type: "size",
        values: ["XS", "S", "M", "L", "XL", "XXL"],
      },
      {
        name: "Material",
        description: "Product material",
        type: "dropdown",
        values: ["Cotton", "Polyester", "Wool", "Silk", "Linen"],
      },
      {
        name: "Brand",
        description: "Product brand",
        type: "text",
        values: [],
      },
      {
        name: "Weight",
        description: "Product weight",
        type: "text",
        values: [],
      },
      {
        name: "Warranty",
        description: "Product warranty period",
        type: "text",
        values: ["6 Months", "1 Year", "2 Years", "Lifetime"],
      },
    ];

    const created = await Attribute.insertMany(defaultAttributes);
    console.log(`✓ Seeded ${created.length} default attributes`);
  } catch (error) {
    console.error("✗ Error seeding attributes:", error.message);
  }
};

export default seedAttributes;
