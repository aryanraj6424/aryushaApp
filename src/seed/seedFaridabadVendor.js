import {
  Product,
  ProductVariant,
  VendorListing,
  VendorProduct
} from "../models/catalog.js";
import Vendor from "../vendor/models/Vendor.js";

export async function seedFaridabadVendorInternal() {
  try {
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
    } else {
      Object.assign(vendor, vendorData);
      await vendor.save();
    }

    // Link Products
    const allProducts = await Product.find({ isDeleted: { $ne: true } });
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
          status: "active"
        });
      }
    }
    if (vpDocsToInsert.length > 0) {
      await VendorProduct.collection.insertMany(vpDocsToInsert);
    }

    // Link Variants
    const allVariants = await ProductVariant.find();
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
          stock: { quantity: 100, lowStockThreshold: 5 },
          isAvailable: true
        });
      }
    }
    if (vlDocsToInsert.length > 0) {
      await VendorListing.collection.insertMany(vlDocsToInsert);
    }

    console.log(`✓ Faridabad Vendor (${vendor.shopName}) initialized: Linked ${vpDocsToInsert.length + existingVPSet.size} products & ${vlDocsToInsert.length + existingVLSet.size} variants.`);
  } catch (error) {
    console.error("❌ Failed to seed Faridabad Vendor linkage:", error.message);
  }
}
