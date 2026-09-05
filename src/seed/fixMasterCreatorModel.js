import mongoose from "mongoose";
import dotenv from "dotenv";
import { Product } from "../models/catalog.js";

dotenv.config();

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/quickkart";

async function run() {
  try {
    console.log("Connecting to MongoDB:", mongoUri);
    await mongoose.connect(mongoUri);
    console.log("✓ Connected to MongoDB.");

    // 1. Get all Admin IDs
    const admins = await mongoose.connection.db.collection("admins").find({}).toArray();
    const adminIds = admins.map(a => a._id.toString());
    console.log(`Found ${adminIds.length} Admins in database.`);

    // 2. Scan and repair Products where creatorModel is incorrectly set to "Vendor"
    // but the createdBy ID belongs to an Admin
    const products = await Product.find({ creatorModel: "Vendor" });
    console.log(`Found ${products.length} products with creatorModel: "Vendor". Scanning for incorrect roles...`);

    let repairedCount = 0;
    for (const prod of products) {
      if (prod.createdBy && adminIds.includes(prod.createdBy.toString())) {
        prod.creatorModel = "Admin";
        prod.status = "approved"; // Master products are automatically approved
        await prod.save();
        console.log(`[REPAIRED] Product "${prod.name}" (ID: ${prod._id}) creatorModel updated to "Admin".`);
        repairedCount++;
      }
    }

    console.log(`\n✓ Database repair complete. Repaired ${repairedCount} product records.`);
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
}

run();
