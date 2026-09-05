import mongoose from "mongoose";

const mongoUri = "mongodb://localhost:27017/quickkart";

async function run() {
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;

    const categories = await db.collection("categories").find({}).toArray();
    console.log("--- CATEGORIES ---");
    categories.forEach(c => {
      console.log(`ID: ${c._id}, Name: ${c.name}, Status: ${c.status}`);
    });

    const subCategories = await db.collection("subcategories").find({}).toArray();
    console.log("\n--- SUBCATEGORIES ---");
    subCategories.forEach(s => {
      console.log(`ID: ${s._id}, Name: ${s.name}, CategoryId: ${s.categoryId}`);
    });

    const productFamilies = await db.collection("productfamilies").find({}).toArray();
    console.log("\n--- PRODUCT FAMILIES ---");
    productFamilies.forEach(f => {
      console.log(`ID: ${f._id}, Name: ${f.name}, SubCategoryId: ${f.subCategoryId}`);
    });

  } catch (err) {
    console.error("Error querying db:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
