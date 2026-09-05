import mongoose from "mongoose";

const mongoUri = "mongodb://localhost:27017/quickkart";

async function checkNotifs() {
  try {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;

    const adminNotifs = await db.collection("adminnotifications").find({}).sort({ createdAt: -1 }).limit(10).toArray();
    console.log("=== ADMIN NOTIFICATIONS in DB ===");
    console.log(JSON.stringify(adminNotifs, null, 2));

    const vendorNotifs = await db.collection("vendornotifications").find({}).sort({ createdAt: -1 }).limit(10).toArray();
    console.log("=== VENDOR NOTIFICATIONS in DB ===");
    console.log(JSON.stringify(vendorNotifs, null, 2));

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

checkNotifs();
