import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

import {
  Category,
  SubCategory,
  ProductFamily,
  Product,
  ProductVariant
} from "./src/models/catalog.js";
import Admin from "./src/admin/models/Admin.js";
import Vendor from "./src/vendor/models/Vendor.js";

async function runMigration() {
  const jsonPath = process.env.CATALOG_EXPORT_PATH || "C:\\Users\\prash\\Downloads\\catalog_export_1788320757094.json";

  console.log(`📁 Reading catalog export JSON from: ${jsonPath}`);
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ File not found at path: ${jsonPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(jsonPath, "utf-8");
  const products = JSON.parse(rawData);

  console.log(`📦 Found ${products.length} products in JSON export file.`);

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("❌ MONGO_URI missing in .env");
    process.exit(1);
  }

  console.log("⚡ Connecting to MongoDB Atlas...");
  await mongoose.connect(mongoUri);
  console.log("✓ Connected to MongoDB Atlas successfully.");

  // Map tracking unique items
  const categoriesMap = new Map();
  const subCategoriesMap = new Map();
  const familiesMap = new Map();
  const createdByMap = new Map();

  for (const item of products) {
    if (item.categoryId && item.categoryId._id) {
      categoriesMap.set(String(item.categoryId._id), item.categoryId);
    }
    if (item.subCategoryId && item.subCategoryId._id) {
      subCategoriesMap.set(String(item.subCategoryId._id), {
        ...item.subCategoryId,
        categoryId: item.categoryId ? (item.categoryId._id || item.categoryId) : null
      });
    }
    if (item.familyId && item.familyId._id) {
      familiesMap.set(String(item.familyId._id), {
        ...item.familyId,
        subCategoryId: item.subCategoryId ? (item.subCategoryId._id || item.subCategoryId) : null,
        categoryId: item.categoryId ? (item.categoryId._id || item.categoryId) : null
      });
    }
    if (item.createdBy) {
      const model = item.creatorModel || "Admin";
      createdByMap.set(String(item.createdBy), model);
    }
  }

  console.log(`\n--- [Step 1] Upserting Categories (${categoriesMap.size}) ---`);
  let categoriesCreated = 0;
  let categoriesExisting = 0;

  for (const [id, cat] of categoriesMap.entries()) {
    const existing = await Category.findById(id);
    if (!existing) {
      const catSlug = cat.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      await Category.collection.insertOne({
        _id: new mongoose.Types.ObjectId(id),
        name: cat.name,
        slug: cat.slug || catSlug,
        status: "active",
        sortOrder: 0,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      categoriesCreated++;
      console.log(`  + Created Category: ${cat.name} (${id})`);
    } else {
      categoriesExisting++;
    }
  }

  console.log(`\n--- [Step 2] Upserting SubCategories (${subCategoriesMap.size}) ---`);
  let subCategoriesCreated = 0;
  let subCategoriesExisting = 0;

  for (const [id, sub] of subCategoriesMap.entries()) {
    const existing = await SubCategory.findById(id);
    if (!existing) {
      const subSlug = sub.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      await SubCategory.collection.insertOne({
        _id: new mongoose.Types.ObjectId(id),
        categoryId: new mongoose.Types.ObjectId(sub.categoryId),
        name: sub.name,
        slug: sub.slug || subSlug,
        status: "active",
        sortOrder: 0,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      subCategoriesCreated++;
      console.log(`  + Created SubCategory: ${sub.name} (${id})`);
    } else {
      subCategoriesExisting++;
    }
  }

  console.log(`\n--- [Step 3] Upserting Product Families (${familiesMap.size}) ---`);
  let familiesCreated = 0;
  let familiesExisting = 0;

  for (const [id, fam] of familiesMap.entries()) {
    const existing = await ProductFamily.findById(id);
    if (!existing) {
      const famSlug = fam.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      await ProductFamily.collection.insertOne({
        _id: new mongoose.Types.ObjectId(id),
        subCategoryId: new mongoose.Types.ObjectId(fam.subCategoryId),
        categoryId: new mongoose.Types.ObjectId(fam.categoryId),
        name: fam.name,
        slug: fam.slug || famSlug,
        status: "active",
        approvalStatus: "approved",
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      familiesCreated++;
      console.log(`  + Created ProductFamily: ${fam.name} (${id})`);
    } else {
      familiesExisting++;
    }
  }

  console.log(`\n--- [Step 4] Checking CreatedBy / Creator References (${createdByMap.size}) ---`);
  let adminPlaceholdersCreated = 0;
  let vendorPlaceholdersCreated = 0;

  for (const [id, model] of createdByMap.entries()) {
    const objId = new mongoose.Types.ObjectId(id);
    if (model === "Vendor") {
      const existingVendor = await Vendor.findById(objId);
      if (!existingVendor) {
        await Vendor.collection.insertOne({
          _id: objId,
          storeName: "Migrated Vendor Store",
          phoneNumber: "0000000000",
          email: `vendor_${id}@migrated.com`,
          password: "$2a$10$placeholderpasswordhashformigratedvendor",
          status: "approved",
          createdAt: new Date(),
          updatedAt: new Date()
        });
        vendorPlaceholdersCreated++;
        console.log(`  + Created Placeholder Vendor: ${id}`);
      }
    } else {
      const existingAdmin = await Admin.findById(objId);
      if (!existingAdmin) {
        await Admin.collection.insertOne({
          _id: objId,
          name: "System Admin (Migrated)",
          phone: `000000_${id.slice(-4)}`,
          password: "$2a$10$placeholderpasswordhashformigratedadmin",
          createdAt: new Date(),
          updatedAt: new Date()
        });
        adminPlaceholdersCreated++;
        console.log(`  + Created Placeholder Admin: ${id}`);
      }
    }
  }

  console.log(`\n--- [Step 5 & 6] Bulk Migrating Products & Variants ---`);

  // Extract all Product IDs and Variant IDs for batch querying
  const allProductObjectIds = products.map(p => new mongoose.Types.ObjectId(p._id));
  const existingProductDocs = await Product.find({ _id: { $in: allProductObjectIds } }).select('_id').lean();
  const existingProductSet = new Set(existingProductDocs.map(p => String(p._id)));

  const allVariantObjectIds = [];
  for (const item of products) {
    if (Array.isArray(item.variants)) {
      for (const v of item.variants) {
        if (v._id) allVariantObjectIds.push(new mongoose.Types.ObjectId(v._id));
      }
    }
  }
  const existingVariantDocs = await ProductVariant.find({ _id: { $in: allVariantObjectIds } }).select('_id').lean();
  const existingVariantSet = new Set(existingVariantDocs.map(v => String(v._id)));

  const productsToInsert = [];
  const variantsToInsert = [];
  let productsSkipped = 0;
  let variantsSkipped = 0;

  for (const item of products) {
    const pIdStr = String(item._id);
    const productId = new mongoose.Types.ObjectId(item._id);

    if (existingProductSet.has(pIdStr)) {
      productsSkipped++;
    } else {
      productsToInsert.push({
        _id: productId,
        familyId: item.familyId?._id ? new mongoose.Types.ObjectId(item.familyId._id) : null,
        subCategoryId: item.subCategoryId?._id ? new mongoose.Types.ObjectId(item.subCategoryId._id) : null,
        categoryId: item.categoryId?._id ? new mongoose.Types.ObjectId(item.categoryId._id) : null,
        name: item.name,
        brand: item.brand || "",
        description: item.description || "",
        images: Array.isArray(item.images) ? item.images : [],
        unitType: item.unitType || "volume",
        isReturnable: item.isReturnable ?? false,
        status: item.status || "active",
        isDeleted: item.isDeleted ?? false,
        commissionType: item.commissionType || "inherit",
        commissionValue: item.commissionValue ?? null,
        createdBy: item.createdBy ? new mongoose.Types.ObjectId(item.createdBy) : null,
        creatorModel: item.creatorModel || "Admin",
        approvalHistory: Array.isArray(item.approvalHistory) ? item.approvalHistory.map(h => ({
          ...h,
          _id: h._id ? new mongoose.Types.ObjectId(h._id) : new mongoose.Types.ObjectId(),
          updatedBy: h.updatedBy ? new mongoose.Types.ObjectId(h.updatedBy) : null,
          updatedAt: h.updatedAt ? new Date(h.updatedAt) : new Date()
        })) : [],
        averageRating: item.averageRating || 0,
        totalReviews: item.totalReviews || 0,
        coupon_allowed: item.coupon_allowed ?? false,
        max_discount_amount: item.max_discount_amount ?? null,
        metaTitle: item.metaTitle || "",
        metaDescription: item.metaDescription || "",
        canonicalUrl: item.canonicalUrl || "",
        ogImage: item.ogImage || "",
        slug: item.slug,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date()
      });
    }

    if (Array.isArray(item.variants)) {
      for (const v of item.variants) {
        const vIdStr = String(v._id);
        const variantId = new mongoose.Types.ObjectId(v._id);

        if (existingVariantSet.has(vIdStr)) {
          variantsSkipped++;
        } else {
          variantsToInsert.push({
            _id: variantId,
            productId: productId,
            variantLabel: v.variantLabel || `${v.packSize?.value || ''} ${v.packSize?.unit || ''}`.trim(),
            packSize: {
              value: v.packSize?.value || 1,
              unit: v.packSize?.unit || "pcs"
            },
            sku: v.sku,
            barcode: v.barcode || "",
            images: Array.isArray(v.images) ? v.images : [],
            mrp: v.mrp,
            basePrice: v.basePrice,
            status: v.status || "active",
            createdBy: v.createdBy ? new mongoose.Types.ObjectId(v.createdBy) : null,
            createdAt: v.createdAt ? new Date(v.createdAt) : new Date(),
            updatedAt: v.updatedAt ? new Date(v.updatedAt) : new Date()
          });
        }
      }
    }
  }

  if (productsToInsert.length > 0) {
    await Product.collection.insertMany(productsToInsert);
  }
  if (variantsToInsert.length > 0) {
    await ProductVariant.collection.insertMany(variantsToInsert);
  }

  console.log("\n==================================================");
  console.log("🎉 MIGRATION SUMMARY");
  console.log("==================================================");
  console.log(`Categories Created      : ${categoriesCreated} (Existing: ${categoriesExisting})`);
  console.log(`SubCategories Created   : ${subCategoriesCreated} (Existing: ${subCategoriesExisting})`);
  console.log(`Product Families Created: ${familiesCreated} (Existing: ${familiesExisting})`);
  console.log(`Admins Created          : ${adminPlaceholdersCreated}`);
  console.log(`Vendors Created         : ${vendorPlaceholdersCreated}`);
  console.log(`Products Inserted       : ${productsToInsert.length} (Skipped: ${productsSkipped})`);
  console.log(`Variants Inserted       : ${variantsToInsert.length} (Skipped: ${variantsSkipped})`);
  console.log("==================================================\n");

  await mongoose.disconnect();
  console.log("✓ Disconnected from MongoDB Atlas.");
}

runMigration().catch(err => {
  console.error("❌ Migration failed with error:", err);
  process.exit(1);
});
