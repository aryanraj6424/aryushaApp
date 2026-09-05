import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "../config/db.js";
import { Product } from "../models/catalog.js";
import { generateUniqueSlug } from "../utils/slugify.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const migrateProductSlugs = async () => {
  try {
    await connectDB();
    console.log("🔄 Starting product slug migration...");

    const products = await Product.find({});
    console.log(`📦 Found ${products.length} products to check.`);

    let updatedCount = 0;
    for (const product of products) {
      const originalSlug = product.slug;
      const newSlug = await generateUniqueSlug(
        product.name || "product",
        product._id,
        Product
      );

      if (!originalSlug || originalSlug !== newSlug) {
        product.slug = newSlug;
        await product.save();
        console.log(`✅ Product "${product.name}" (${product._id}) -> slug: "${newSlug}" (was: "${originalSlug || 'none'}")`);
        updatedCount++;
      }
    }

    console.log(`🎉 Migration finished! Updated ${updatedCount} products.`);
  } catch (error) {
    console.error("❌ Slug migration failed:", error);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrateProductSlugs().then(() => process.exit(0));
}
