import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI environment variable is not defined in .env");
    }
    console.log("Connecting to MongoDB:", mongoUri.replace(/\/\/.*:.*@/, "//***:***@"));
    
    const conn = await mongoose.connect(mongoUri);

    console.log(`✓ MongoDB Connected: ${conn.connection.host}`);

    // Drop the old non-sparse unique index for phoneNumber so Mongoose can recreate it as sparse
    try {
      await conn.connection.db.collection("users").dropIndex("phoneNumber_1");
      console.log("✓ Dropped old non-sparse phoneNumber_1 index");
    } catch (err) {
      // The index might not exist or already be dropped/re-created, which is fine
    }
    
    // Set JWT_SECRET if not already set
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = "your_super_secret_jwt_key_change_this_in_production";
      console.log("⚠ Using default JWT_SECRET - change this in production!");
    }
    
    return conn;
  } catch (error) {
    console.error("✗ MongoDB Connection Error:", error.message);
    process.exit(1);
  }
};

export default connectDB;