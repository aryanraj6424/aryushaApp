import Admin from "../models/Admin.js";
import bcrypt from "bcryptjs";

const seedAdmins = async () => {
  try {
    // Check if admin already exists
    const count = await Admin.countDocuments();
    if (count > 0) {
      console.log("✓ Admin accounts already exist in database");
      return;
    }

    // Create default admin account
    const hashedPassword = await bcrypt.hash("admin@123", 10);

    const defaultAdmin = {
      name: "Admin",
      phone: "9999999999",
      password: hashedPassword,
    };

    const admin = await Admin.create(defaultAdmin);
    console.log("✓ Admin account created successfully");
    console.log("  Phone: 9999999999");
    console.log("  Password: admin@123");
  } catch (error) {
    if (error.code === 11000) {
      console.log("✓ Admin account already exists");
    } else {
      console.error("✗ Error seeding admin:", error.message);
    }
  }
};

export default seedAdmins;
