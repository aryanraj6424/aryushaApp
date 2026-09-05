import mongoose from "mongoose";

const mongoUri = "mongodb://localhost:27017/quickkart";

async function run() {
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;

    // Find all reviews missing vendorId
    const orphanedReviews = await db.collection("productreviews").find({ vendorId: { $exists: false } }).toArray();
    console.log(`Found ${orphanedReviews.length} reviews without vendorId`);

    for (const review of orphanedReviews) {
      // Look up a delivered order for this customer+product to find the vendor
      const order = await db.collection("customerorders").findOne({
        customerId: review.customerId,
        "items.productId": review.productId,
        orderStatus: "Delivered"
      });

      if (order) {
        await db.collection("productreviews").updateOne(
          { _id: review._id },
          {
            $set: {
              vendorId: order.vendorId,
              orderId: order._id,
              isVerifiedPurchase: true
            }
          }
        );
        console.log(`✓ Migrated review ${review._id} → vendor ${order.vendorId}, order ${order._id}`);
      } else {
        // No matching delivered order — mark as unverified but still assign vendor from any order
        const anyOrder = await db.collection("customerorders").findOne({
          "items.productId": review.productId
        });
        if (anyOrder) {
          await db.collection("productreviews").updateOne(
            { _id: review._id },
            {
              $set: {
                vendorId: anyOrder.vendorId,
                orderId: anyOrder._id,
                isVerifiedPurchase: false
              }
            }
          );
          console.log(`⚠ Migrated review ${review._id} (unverified) → vendor ${anyOrder.vendorId}`);
        } else {
          console.log(`✗ Could not migrate review ${review._id} — no matching orders found, deleting it.`);
          await db.collection("productreviews").deleteOne({ _id: review._id });
        }
      }
    }

    // Now recalculate aggregates for affected products
    const allReviews = await db.collection("productreviews").find({}).toArray();
    const grouped = {};
    for (const r of allReviews) {
      const key = `${r.productId}_${r.vendorId}`;
      if (!grouped[key]) grouped[key] = { productId: r.productId, vendorId: r.vendorId, ratings: [] };
      grouped[key].ratings.push(r.rating);
    }

    for (const key of Object.keys(grouped)) {
      const { productId, vendorId, ratings } = grouped[key];
      const avg = parseFloat((ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(2));
      const count = ratings.length;

      // Update Product document
      await db.collection("products").updateOne(
        { _id: typeof productId === "string" ? new mongoose.Types.ObjectId(productId) : productId },
        { $set: { averageRating: avg, totalReviews: count } }
      );
      console.log(`Updated product ${productId}: avg=${avg}, count=${count}`);
    }

    console.log("\nMigration complete!");

  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

run();
