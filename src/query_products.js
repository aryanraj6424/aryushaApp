import mongoose from "mongoose";

const mongoUri = "mongodb://localhost:27017/quickkart";

async function run() {
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;

    const products = await db.collection("products").find({}).toArray();
    console.log("--- PRODUCTS ---");
    products.forEach(p => {
      console.log(`ID: ${p._id}, Name: ${p.name}`);
      console.log(`Description: ${p.description}`);
      console.log(`Attributes: ${JSON.stringify(p.attributes)}`);
      console.log("------------------------");
    });

  } catch (err) {
    console.error("Error querying db:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
