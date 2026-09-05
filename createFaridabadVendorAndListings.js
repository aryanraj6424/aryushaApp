import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

import connectDB from "./src/config/db.js";
import {
  Product,
  ProductVariant,
  VendorListing,
  VendorProduct
} from "./src/models/catalog.js";
import Vendor from "./src/vendor/models/Vendor.js";

async function setupVendorAndListings() {
  console.log("⚡ Connecting to MongoDB Atlas via connectDB()...");
  await connectDB();

  // 1. Create or Find Faridabad Master Vendor
  const vendorEmail = "faridabad_vendor@aryusha.in";
  let vendor = await Vendor.findOne({ businessEmail: vendorEmail });

  const faridabadPincodes = [
    "121001", "121002", "121003", "121004", "121005", "121006",
    "121007", "121008", "121009", "121010", "121012"
  ];

  const vendorData = {
    shopName: "Aryusha Central Store Faridabad",
    shopType: "Grocery & Supermarket",
    businessEmail: vendorEmail,
    phone: "9876543210",
    password: "$2a$10$placeholderpasswordhashformigratedvendor",
    status: "approved",
    accountStatus: "active",
    address: {
      village: "Faridabad",
      district: "Faridabad",
      state: "Haryana",
      pincode: "121001",
      country: "India",
      city: "Faridabad",
      addressLine: "Sector 15 Main Market, Faridabad"
    },
    storeDetails: {
      storeName: "Aryusha Central Store Faridabad",
      city: "Faridabad",
      state: "Haryana",
      pincode: "121001",
      serviceAreas: faridabadPincodes,
      storeStatus: "open"
    },
    assignedArea: "121001",
    assignedRadius: 50,
    deliveryRadius: 50,
    radiusKm: 50,
    latitude: 28.4089,
    longitude: 77.3178,
    location: {
      type: "Point",
      coordinates: [77.3178, 28.4089]
    },
    serviceAreas: faridabadPincodes.map((pin) => ({
      pincode: pin,
      areaName: `Faridabad Area (${pin})`,
      city: "Faridabad",
      state: "Haryana"
    }))
  };

  if (!vendor) {
    vendor = await Vendor.create(vendorData);
    console.log(`✓ Created Faridabad Vendor: ${vendor.shopName} (${vendor._id})`);
  } else {
    Object.assign(vendor, vendorData);
    await vendor.save();
    console.log(`✓ Updated Faridabad Vendor: ${vendor.shopName} (${vendor._id})`);
  }

  // Ensure spatial index on Vendor collection
  try {
    await Vendor.collection.createIndex({ location: "2dsphere" });
  } catch (err) {
    // Index might already exist
  }

  // 2. Create VendorProduct links for all 62 products
  const allProducts = await Product.find({ isDeleted: { $ne: true } });
  console.log(`📦 Found ${allProducts.length} products to link with vendor.`);

  const existingVP = await VendorProduct.find({ vendorId: vendor._id }).select("masterProductId").lean();
  const existingVPSet = new Set(existingVP.map(vp => String(vp.masterProductId)));

  const vpDocsToInsert = [];
  for (const prod of allProducts) {
    if (!existingVPSet.has(String(prod._id))) {
      vpDocsToInsert.push({
        vendorId: vendor._id,
        masterProductId: prod._id,
        price: 99,
        mrp: 120,
        stock: 100,
        sku: prod.slug || `SKU-${prod._id}`,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  }

  if (vpDocsToInsert.length > 0) {
    await VendorProduct.collection.insertMany(vpDocsToInsert);
  }

  // 3. Create VendorListing links for all 107 variants
  const allVariants = await ProductVariant.find();
  console.log(`📦 Found ${allVariants.length} product variants to link with vendor.`);

  const existingVL = await VendorListing.find({ vendorId: vendor._id }).select("variantId").lean();
  const existingVLSet = new Set(existingVL.map(vl => String(vl.variantId)));

  const vlDocsToInsert = [];
  for (const variant of allVariants) {
    if (!existingVLSet.has(String(variant._id))) {
      vlDocsToInsert.push({
        vendorId: vendor._id,
        variantId: variant._id,
        sellingPrice: variant.basePrice || variant.mrp || 10,
        mrp: variant.mrp || 10,
        stock: {
          quantity: 100,
          lowStockThreshold: 5
        },
        isAvailable: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  }

  if (vlDocsToInsert.length > 0) {
    await VendorListing.collection.insertMany(vlDocsToInsert);
  }

  console.log("\n==================================================");
  console.log("🎉 VENDOR & PRODUCT LINKAGE SUMMARY");
  console.log("==================================================");
  console.log(`Vendor ID             : ${vendor._id}`);
  console.log(`Vendor Name           : ${vendor.shopName}`);
  console.log(`Serving Pincodes      : ${faridabadPincodes.join(", ")}`);
  console.log(`VendorProducts Linked : ${vpDocsToInsert.length} newly inserted (Total: ${allProducts.length})`);
  console.log(`VendorListings Linked : ${vlDocsToInsert.length} newly inserted (Total: ${allVariants.length})`);
  console.log("==================================================\n");

  await mongoose.disconnect();
  console.log("✓ Disconnected from MongoDB Atlas.");
}

setupVendorAndListings().catch(err => {
  console.error("❌ Failed with error:", err);
  process.exit(1);
});
