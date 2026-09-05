import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

import connectDB from "./src/config/db.js";
import Admin from "./src/admin/models/Admin.js";

async function createAdmin() {
  console.log("⚡ Connecting to MongoDB Atlas...");
  await connectDB();

  const targetPhone = "6207724519";
  const tempPassword = "Temp@1234";

  console.log(`🔍 Checking if Admin with phone ${targetPhone} exists...`);
  let admin = await Admin.findOne({ phone: targetPhone });

  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  if (admin) {
    admin.name = admin.name || "Super Admin";
    admin.password = hashedPassword;
    await admin.save();
    console.log(`✓ Existing Admin account updated for phone: ${targetPhone}`);
  } else {
    admin = await Admin.create({
      name: "Super Admin",
      phone: targetPhone,
      password: hashedPassword
    });
    console.log(`✓ Created new Admin account for phone: ${targetPhone}`);
  }

  // Display sanitized document output with masked password
  const adminObj = admin.toObject();
  const maskedAdminDoc = {
    ...adminObj,
    password: "[HASHED_BCRYPT_PASSWORD_HIDDEN]"
  };

  console.log("\n==================================================");
  console.log("🎉 ADMIN ACCOUNT SUMMARY");
  console.log("==================================================");
  console.log(JSON.stringify(maskedAdminDoc, null, 2));
  console.log("==================================================");
  console.log(`\nTemporary Login Credentials:`);
  console.log(`Phone   : ${targetPhone}`);
  console.log(`Password: ${tempPassword}`);
  console.log("==================================================\n");

  await mongoose.disconnect();
  console.log("✓ Disconnected from MongoDB Atlas.");
}

createAdmin().catch(err => {
  console.error("❌ Failed to create Admin account:", err);
  process.exit(1);
});
