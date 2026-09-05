import mongoose from "mongoose";
import dotenv from "dotenv";
import { Product } from "../models/catalog.js";

dotenv.config();

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/quickkart";

async function run() {
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB.");

    // Find products where createdBy is missing or null
    const query = {
      $or: [
        { createdBy: { $exists: false } },
        { createdBy: null }
      ]
    };

    const products = await Product.find(query);
    console.log(`Found ${products.length} products with missing/null createdBy.`);

    for (const p of products) {
      console.log(`- Product: "${p.name}", creatorModel: "${p.creatorModel}", status: "${p.status}"`);
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
