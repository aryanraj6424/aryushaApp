import mongoose from "mongoose";
import { Product, VendorProduct, ProductVariant } from "./src/models/catalog.js";

async function testQuery() {
  try {
    await mongoose.connect("mongodb://localhost:27017/quickkart");
    console.log("Connected to MongoDB");

    const vendorId = "6a4d1da2ba4548bb445d2533"; // Example vendor ID

    // 1. Get IDs of products already linked to this vendor
    const linkedReferences = await VendorProduct.find({ vendorId })
      .select("masterProductId");
    
    const linkedProductIds = linkedReferences.map(r => r.masterProductId);
    console.log("Linked product IDs:", linkedProductIds);

    // 2. Query products: must be created by Admin or be approved vendor products,
    //    and not yet linked by this vendor
    const searchFilter = {
      _id: { $nin: linkedProductIds },
      isDeleted: { $ne: true },
      $or: [
        { creatorModel: "Admin" },
        { status: "approved" }
      ]
    };

    const query = "Atta"; // Search query
    if (query && query.trim()) {
      const regex = new RegExp(query.trim(), "i");
      searchFilter.$and = [
        {
          $or: [
            { name: regex },
            { brand: regex }
          ]
        }
      ];
    }

    console.log("Using searchFilter:", JSON.stringify(searchFilter, null, 2));

    const products = await Product.find(searchFilter)
      .populate("categoryId", "name")
      .populate("subCategoryId", "name")
      .populate("familyId", "name")
      .populate("variants");

    console.log(`Found ${products.length} matching products.`);
    products.forEach(p => {
      console.log(`- ID: ${p._id}, Name: "${p.name}", Status: "${p.status}", CreatorModel: "${p.creatorModel}"`);
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error("Error:", err);
  }
}

testQuery();
