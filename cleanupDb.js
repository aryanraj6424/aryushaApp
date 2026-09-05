import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/quickkart";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const CustomerOrder = mongoose.model("CustomerOrder", new mongoose.Schema({}));
  const Order = mongoose.model("Order", new mongoose.Schema({}));
  const VendorEarnings = mongoose.model("VendorEarnings", new mongoose.Schema({}));
  const DeliveryBoyEarnings = mongoose.model("DeliveryBoyEarnings", new mongoose.Schema({}));
  const Settlement = mongoose.model("Settlement", new mongoose.Schema({}));
  const Commission = mongoose.model("Commission", new mongoose.Schema({}));

  console.log("Purging collections...");

  const res1 = await CustomerOrder.deleteMany({});
  console.log(`Deleted ${res1.deletedCount} CustomerOrders`);

  const res2 = await Order.deleteMany({});
  console.log(`Deleted ${res2.deletedCount} Orders`);

  const res3 = await VendorEarnings.deleteMany({});
  console.log(`Deleted ${res3.deletedCount} VendorEarnings`);

  const res4 = await DeliveryBoyEarnings.deleteMany({});
  console.log(`Deleted ${res4.deletedCount} DeliveryBoyEarnings`);

  const res5 = await Settlement.deleteMany({});
  console.log(`Deleted ${res5.deletedCount} Settlements`);

  const res6 = await Commission.deleteMany({});
  console.log(`Deleted ${res6.deletedCount} Commissions`);

  console.log("Database clean up completed successfully!");
  await mongoose.disconnect();
}

main().catch(console.error);
