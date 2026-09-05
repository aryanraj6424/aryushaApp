import mongoose from "mongoose";
import dotenv from "dotenv";
import { Category, SubCategory, ProductFamily } from "../models/catalog.js";

dotenv.config();

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/quickkart";

async function migrate() {
  try {
    console.log("Connecting to MongoDB:", mongoUri);
    await mongoose.connect(mongoUri);
    console.log("✓ Connected to MongoDB.");

    // 1. Migrate Categories
    console.log("\nMigrating Categories...");
    const categories = await Category.find({});
    let catUpdated = 0;
    for (const doc of categories) {
      let modified = false;

      if (doc.icon === undefined) {
        doc.icon = "";
        modified = true;
      }
      if (doc.isFeatured === undefined) {
        doc.isFeatured = false;
        modified = true;
      }
      if (doc.parentId === undefined) {
        doc.parentId = null;
        modified = true;
      }
      if (!doc.metaTitle) {
        doc.metaTitle = doc.name.slice(0, 60);
        modified = true;
      }
      if (!doc.metaDescription) {
        doc.metaDescription = (doc.description || doc.name).slice(0, 160);
        modified = true;
      }
      if (doc.canonicalUrl === undefined) {
        doc.canonicalUrl = "";
        modified = true;
      }
      if (doc.ogImage === undefined) {
        doc.ogImage = "";
        modified = true;
      }
      if (doc.updatedBy === undefined) {
        doc.updatedBy = null;
        modified = true;
      }

      if (modified) {
        await doc.save();
        catUpdated++;
      }
    }
    console.log(`✓ Migrated ${catUpdated}/${categories.length} Categories.`);

    // 2. Migrate Subcategories
    console.log("\nMigrating Subcategories...");
    const subCategories = await SubCategory.find({});
    let subCatUpdated = 0;
    for (const doc of subCategories) {
      let modified = false;

      if (!doc.metaTitle) {
        doc.metaTitle = doc.name.slice(0, 60);
        modified = true;
      }
      if (!doc.metaDescription) {
        doc.metaDescription = (doc.description || doc.name).slice(0, 160);
        modified = true;
      }
      if (doc.canonicalUrl === undefined) {
        doc.canonicalUrl = "";
        modified = true;
      }
      if (doc.ogImage === undefined) {
        doc.ogImage = "";
        modified = true;
      }
      if (doc.updatedBy === undefined) {
        doc.updatedBy = null;
        modified = true;
      }

      if (modified) {
        await doc.save();
        subCatUpdated++;
      }
    }
    console.log(`✓ Migrated ${subCatUpdated}/${subCategories.length} Subcategories.`);

    // 3. Migrate Product Families
    console.log("\nMigrating Product Families...");
    const families = await ProductFamily.find({});
    let familyUpdated = 0;
    for (const doc of families) {
      let modified = false;

      if (doc.brandId === undefined) {
        doc.brandId = null;
        modified = true;
      }
      if (doc.shortDescription === undefined) {
        doc.shortDescription = "";
        modified = true;
      }
      if (doc.images === undefined) {
        doc.images = [];
        modified = true;
      }
      if (doc.tags === undefined) {
        doc.tags = [];
        modified = true;
      }
      if (doc.unitType === undefined) {
        doc.unitType = "";
        modified = true;
      }
      if (doc.shelfLife === undefined) {
        doc.shelfLife = "";
        modified = true;
      }
      if (doc.storageInstructions === undefined) {
        doc.storageInstructions = "";
        modified = true;
      }
      if (doc.countryOfOrigin === undefined) {
        doc.countryOfOrigin = "";
        modified = true;
      }
      if (doc.fssaiLicenseNumber === undefined) {
        doc.fssaiLicenseNumber = "";
        modified = true;
      }
      if (doc.searchKeywords === undefined) {
        doc.searchKeywords = [];
        modified = true;
      }
      if (doc.structuredDataType === undefined) {
        doc.structuredDataType = "";
        modified = true;
      }
      if (!doc.metaTitle) {
        doc.metaTitle = doc.name.slice(0, 60);
        modified = true;
      }
      if (!doc.metaDescription) {
        doc.metaDescription = (doc.description || doc.name).slice(0, 160);
        modified = true;
      }
      if (doc.canonicalUrl === undefined) {
        doc.canonicalUrl = "";
        modified = true;
      }
      if (doc.ogImage === undefined) {
        doc.ogImage = "";
        modified = true;
      }
      if (doc.updatedBy === undefined) {
        doc.updatedBy = null;
        modified = true;
      }

      if (modified) {
        await doc.save();
        familyUpdated++;
      }
    }
    console.log(`✓ Migrated ${familyUpdated}/${families.length} Product Families.`);
    console.log("\nDatabase migration completed successfully! 🎉");

  } catch (error) {
    console.error("✗ Database migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

migrate();
