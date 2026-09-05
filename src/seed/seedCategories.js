import mongoose from "mongoose";
import dotenv from "dotenv";
import { Category } from "../models/catalog.js";

dotenv.config();

const seedCategories = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/gaonkart";
    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");

    // Clear existing categories
    await Category.deleteMany({});
    console.log("Cleared existing categories");

    // Seed categories
    const categories = [
      {
        name: "Fruits & Vegetables",
        description: "Fresh produce for daily meals and healthy snacking.",
        sortOrder: 1,
        status: "active"
      },
      {
        name: "Grocery & Staples",
        description: "Everyday staples, pantry essentials and household basics.",
        sortOrder: 2,
        status: "active"
      },
      {
        name: "Personal Care",
        description: "Daily care products for skin, hair and personal hygiene.",
        sortOrder: 3,
        status: "active"
      },
      {
        name: "Beverages",
        description: "Cold drinks, juices, tea, coffee and hydration essentials.",
        sortOrder: 4,
        status: "active"
      },
      {
        name: "Snacks & Branded Foods",
        description: "Packaged snacks, biscuits, namkeen and branded food items.",
        sortOrder: 5,
        status: "inactive"
      },
      {
        name: "Home & Cleaning",
        description: "Cleaning, laundry and home care essentials.",
        sortOrder: 6,
        status: "active"
      },
      {
        name: "Baby Care",
        description: "Baby food, diapers, wipes and baby care products.",
        sortOrder: 7,
        status: "inactive"
      }
    ];

    const insertedCategories = await Category.insertMany(categories);
    console.log(`${insertedCategories.length} categories seeded successfully`);

    // Display seeded categories
    console.log("\nSeeded Categories:");
    insertedCategories.forEach(cat => {
      console.log(`- ${cat.name} (${cat.slug}) - ${cat.status}`);
    });

    await mongoose.disconnect();
    console.log("MongoDB disconnected");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding categories:", error);
    process.exit(1);
  }
};

seedCategories();
