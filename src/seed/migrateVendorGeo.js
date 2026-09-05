import mongoose from "mongoose";
import dotenv from "dotenv";
import Vendor from "../vendor/models/Vendor.js";

dotenv.config();
dotenv.config({ path: "./backend/.env" });

const migrateVendorGeo = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/quickkart";
    console.log("Connecting to MongoDB:", mongoUri);
    await mongoose.connect(mongoUri);
    console.log("✓ MongoDB connected successfully");

    const vendors = await Vendor.find({});
    console.log(`Found ${vendors.length} vendors to inspect`);

    let updatedCount = 0;
    for (const vendor of vendors) {
      let isModified = false;

      // 1. Sync location from latitude/longitude
      if (
        vendor.latitude !== null &&
        vendor.latitude !== undefined &&
        vendor.longitude !== null &&
        vendor.longitude !== undefined
      ) {
        const lat = Number(vendor.latitude);
        const lng = Number(vendor.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          vendor.location = {
            type: "Point",
            coordinates: [lng, lat],
          };
          isModified = true;
        }
      }

      // 2. Sync radiusKm, deliveryRadius, and assignedRadius
      const targetRadius = vendor.radiusKm ?? vendor.deliveryRadius ?? vendor.assignedRadius;
      if (targetRadius !== null && targetRadius !== undefined) {
        const rad = Number(targetRadius);
        if (!isNaN(rad)) {
          vendor.radiusKm = rad;
          vendor.deliveryRadius = rad;
          vendor.assignedRadius = rad;
          isModified = true;
        }
      }

      if (isModified) {
        await vendor.save();
        console.log(`Updated vendor "${vendor.shopName}" (${vendor._id}) -> Lat: ${vendor.latitude}, Lng: ${vendor.longitude}, Radius: ${vendor.radiusKm} KM`);
        updatedCount++;
      }
    }

    // Force create indexes to make sure 2dsphere index gets registered in the database
    console.log("Building indexes on Vendor model...");
    await Vendor.createIndexes();
    console.log("✓ Indexes built successfully");

    console.log(`✓ Migration completed! Updated ${updatedCount} vendors.`);
    await mongoose.disconnect();
    console.log("MongoDB disconnected");
    process.exit(0);
  } catch (error) {
    console.error("✗ Migration error:", error);
    process.exit(1);
  }
};

migrateVendorGeo();
