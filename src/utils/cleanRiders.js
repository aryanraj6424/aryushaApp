import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../../.env") });

import DeliveryBoy from "../deliveryBoy/models/DeliveryBoy.js";
import DeliveryBoyEarnings from "../deliveryBoy/models/DeliveryBoyEarnings.js";
import RiderNotification from "../deliveryBoy/models/RiderNotification.js";
import PayoutSettings from "../deliveryBoy/models/PayoutSettings.js";

const cleanDatabase = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/quickkart";
    console.log(`Connecting to database: ${mongoUri}...`);
    await mongoose.connect(mongoUri);
    console.log("Connected successfully.");

    // Delete records
    console.log("Deletes in progress...");
    const riderDel = await DeliveryBoy.deleteMany({});
    console.log(`Deleted ${riderDel.deletedCount} Delivery Boy records.`);

    const earningsDel = await DeliveryBoyEarnings.deleteMany({});
    console.log(`Deleted ${earningsDel.deletedCount} Earnings records.`);

    const notifyDel = await RiderNotification.deleteMany({});
    console.log(`Deleted ${notifyDel.deletedCount} Rider Notification records.`);

    const payoutDel = await PayoutSettings.deleteMany({});
    console.log(`Deleted ${payoutDel.deletedCount} Payout Settings records.`);

    // Optional: seed default payout settings record
    await PayoutSettings.create({
      payoutType: "per_order",
      payoutAmount: 35,
      incentiveAmount: 5,
      commissionAmount: 2,
      onTimeThresholdMinutes: 45
    });
    console.log("Default Payout settings seeded successfully.");

    console.log("Database clean-up finished successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Database clean-up error:", error);
    process.exit(1);
  }
};

cleanDatabase();
