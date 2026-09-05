import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

import { configureCloudinary } from "./src/config/cloudinary.js";
configureCloudinary();

import connectDB from "./src/config/db.js";
import app from "./src/app.js";
import seedAttributes from "./src/admin/seed/seedAttributes.js";
import { seedFaridabadVendorInternal } from "./src/seed/seedFaridabadVendor.js";
import { createServer } from "http";
import { Server } from "socket.io";
import { initSocket } from "./src/socket/socketManager.js";

connectDB().then(() => {
  seedAttributes();
  seedFaridabadVendorInternal();
});

const PORT = process.env.PORT || 5000;

// Create HTTP server and attach Socket.IO
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow any localhost/127.0.0.1 (http/https) or local network IP origins
      if (
        !origin ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("https://localhost") ||
        origin.startsWith("http://127.0.0.1") ||
        origin.startsWith("https://127.0.0.1") ||
        /^https?:\/\/(10|192\.168|172\.(1[6-9]|2[0-9]|3[01]))\.\d+\.\d+(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Initialize the socket manager so controllers can emit events
initSocket(io);

httpServer.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `\n❌ Port ${PORT} is already in use. Another instance of this server may already be running.\nPlease stop it or set a different PORT in your .env file.\n`
    );
    process.exit(1);
  } else {
    console.error("Server error:", error);
    process.exit(1);
  }
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} (Socket.IO enabled)`);
});