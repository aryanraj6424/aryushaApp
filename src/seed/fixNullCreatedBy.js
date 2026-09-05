import mongoose from "mongoose";
import dotenv from "dotenv";
import { Product } from "../models/catalog.js";

dotenv.config();

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/quickkart";

async function run() {
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB.");

    // Get the first Admin ID from the admins collection
    const admin = await mongoose.connection.db.collection("admins").findOne({});
    if (!admin) {
      console.error("No Admin user found in the database. Cannot run repair.");
      process.exit(1);
    }
    console.log(`Using Admin ID: ${admin._id} for repairs.`);

    // Find products where createdBy is missing/null and creatorModel is "Vendor"
    const query = {
      creatorModel: "Vendor",
      $or: [
        { createdBy: { $exists: false } },
        { createdBy: null }
      ]
    };

    const products = await Product.find(query);
    console.log(`Found ${products.length} products to repair.`);

    for (const p of products) {
      p.creatorModel = "Admin";
      p.createdBy = admin._id;
      p.status = "approved"; // Set status to approved so they are ready to be linked
      await p.save();
      console.log(`[REPAIRED] "${p.name}" updated to Admin creatorModel and status: approved.`);
    }

    console.log("✓ Repair completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
