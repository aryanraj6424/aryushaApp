import mongoose from "mongoose";

const mongoUri = "mongodb://localhost:27017/quickkart";

async function run() {
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;

    // Find the default vendor Amrita Collection
    const vendor = await db.collection("vendors").findOne({ shopName: "Amrita Collection" });
    if (!vendor) {
      console.log("Amrita Collection vendor not found.");
      return;
    }

    console.log("Found vendor:", vendor.shopName, "ID:", vendor._id);

    // Update with default coordinates and service area (pincode 848114)
    const updateResult = await db.collection("vendors").updateOne(
      { _id: vendor._id },
      {
        $set: {
          latitude: 25.6126,
          longitude: 85.1376,
          deliveryRadius: 10,
          serviceAreas: [
            {
              pincode: "848114",
              areaName: "Tajpur",
              city: "Samastipur",
              state: "Bihar"
            }
          ]
        }
      }
    );

    console.log("Updated vendor location & service areas:", updateResult.modifiedCount, "document(s) modified.");

    // Retrieve and verify updated vendor
    const updated = await db.collection("vendors").findOne({ _id: vendor._id });
    console.log("Updated vendor details:", JSON.stringify(updated, null, 2));

  } catch (err) {
    console.error("Error seeding vendor:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

run();
