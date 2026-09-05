import { v2 as cloudinary } from "cloudinary";

/**
 * Ensure Cloudinary is configured with env vars before every upload.
 * This guards against the ES module import-hoisting issue where cloudinary
 * might be used before dotenv has populated process.env.
 */
const ensureConfigured = () => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
};

/**
 * Reusable utility to stream a file buffer to Cloudinary.
 * Accepts buffer and options like folder (e.g. products, categories, vendors).
 */
export const uploadToCloudinary = (fileBuffer, folder = "general") => {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `quickkart/${folder}`,
        resource_type: "auto",
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload stream error:", error);
          return reject(new Error("Cloudinary upload failed: " + error.message));
        }
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );
    stream.end(fileBuffer);
  });
};

/**
 * Reusable utility to delete an asset from Cloudinary using its public_id.
 */
export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return null;
  ensureConfigured();
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        console.error("Cloudinary delete error:", error);
        return reject(new Error("Cloudinary deletion failed: " + error.message));
      }
      resolve(result);
    });
  });
};
