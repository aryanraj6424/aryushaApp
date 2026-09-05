import mongoose from "mongoose";
import dotenv from "dotenv";
import {
  Category,
  SubCategory,
  ProductFamily,
  Product,
  ProductVariant
} from "../models/catalog.js";

dotenv.config();

const seedFullCatalog = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/gaonkart";
    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");

    // Clear existing data
    await ProductVariant.deleteMany({});
    await Product.deleteMany({});
    await ProductFamily.deleteMany({});
    await SubCategory.deleteMany({});
    await Category.deleteMany({});
    console.log("Cleared existing catalog data");

    // 1. Seed Categories
    const categories = await Category.insertMany([
      {
        name: "Fruits & Vegetables",
        description: "Fresh produce for daily meals and healthy snacking.",
        sortOrder: 1,
        status: "active"
      },
      {
        name: "Grocery & Staples",
        description: "Everyday staples, pantry essentials and household basics.",
        sortOrder: 2,
        status: "active"
      },
      {
        name: "Personal Care",
        description: "Daily care products for skin, hair and personal hygiene.",
        sortOrder: 3,
        status: "active"
      },
      {
        name: "Beverages",
        description: "Cold drinks, juices, tea, coffee and hydration essentials.",
        sortOrder: 4,
        status: "active"
      },
      {
        name: "Home & Cleaning",
        description: "Cleaning, laundry and home care essentials.",
        sortOrder: 5,
        status: "active"
      }
    ]);
    console.log(`✓ Seeded ${categories.length} categories`);

    // 2. Seed SubCategories
    const subCategories = await SubCategory.insertMany([
      // Fruits & Vegetables
      { categoryId: categories[0]._id, name: "Fresh Fruits", sortOrder: 1, status: "active" },
      { categoryId: categories[0]._id, name: "Fresh Vegetables", sortOrder: 2, status: "active" },
      { categoryId: categories[0]._id, name: "Exotic Fruits", sortOrder: 3, status: "active" },
      
      // Grocery & Staples
      { categoryId: categories[1]._id, name: "Rice & Grains", sortOrder: 1, status: "active" },
      { categoryId: categories[1]._id, name: "Dairy & Eggs", sortOrder: 2, status: "active" },
      { categoryId: categories[1]._id, name: "Flours & Atta", sortOrder: 3, status: "active" },
      { categoryId: categories[1]._id, name: "Oils & Ghee", sortOrder: 4, status: "active" },
      
      // Personal Care
      { categoryId: categories[2]._id, name: "Skin Care", sortOrder: 1, status: "active" },
      { categoryId: categories[2]._id, name: "Hair Care", sortOrder: 2, status: "active" },
      { categoryId: categories[2]._id, name: "Oral Care", sortOrder: 3, status: "active" },
      
      // Beverages
      { categoryId: categories[3]._id, name: "Cold Drinks", sortOrder: 1, status: "active" },
      { categoryId: categories[3]._id, name: "Tea & Coffee", sortOrder: 2, status: "active" },
      { categoryId: categories[3]._id, name: "Juices", sortOrder: 3, status: "active" },
      
      // Home & Cleaning
      { categoryId: categories[4]._id, name: "Cleaning Supplies", sortOrder: 1, status: "active" },
      { categoryId: categories[4]._id, name: "Laundry", sortOrder: 2, status: "active" },
      { categoryId: categories[4]._id, name: "Home Care", sortOrder: 3, status: "active" }
    ]);
    console.log(`✓ Seeded ${subCategories.length} subcategories`);

    // 3. Seed Product Families
    const productFamilies = await ProductFamily.insertMany([
      // Fresh Fruits
      { categoryId: categories[0]._id, subCategoryId: subCategories[0]._id, name: "Apples", sortOrder: 1, status: "active" },
      { categoryId: categories[0]._id, subCategoryId: subCategories[0]._id, name: "Bananas", sortOrder: 2, status: "active" },
      { categoryId: categories[0]._id, subCategoryId: subCategories[0]._id, name: "Citrus Fruits", sortOrder: 3, status: "active" },
      
      // Fresh Vegetables
      { categoryId: categories[0]._id, subCategoryId: subCategories[1]._id, name: "Leafy Greens", sortOrder: 1, status: "active" },
      { categoryId: categories[0]._id, subCategoryId: subCategories[1]._id, name: "Root Vegetables", sortOrder: 2, status: "active" },
      
      // Rice & Grains
      { categoryId: categories[1]._id, subCategoryId: subCategories[3]._id, name: "Basmati Rice", sortOrder: 1, status: "active" },
      { categoryId: categories[1]._id, subCategoryId: subCategories[3]._id, name: "Other Rice Varieties", sortOrder: 2, status: "active" },
      
      // Dairy & Eggs
      { categoryId: categories[1]._id, subCategoryId: subCategories[4]._id, name: "Milk", sortOrder: 1, status: "active" },
      { categoryId: categories[1]._id, subCategoryId: subCategories[4]._id, name: "Eggs", sortOrder: 2, status: "active" },
      
      // Flours & Atta
      { categoryId: categories[1]._id, subCategoryId: subCategories[5]._id, name: "Wheat Flour", sortOrder: 1, status: "active" },
      { categoryId: categories[1]._id, subCategoryId: subCategories[5]._id, name: "Other Flours", sortOrder: 2, status: "active" },
      
      // Cold Drinks
      { categoryId: categories[3]._id, subCategoryId: subCategories[12]._id, name: "Cola Drinks", sortOrder: 1, status: "active" },
      { categoryId: categories[3]._id, subCategoryId: subCategories[12]._id, name: "Soda Drinks", sortOrder: 2, status: "active" }
    ]);
    console.log(`✓ Seeded ${productFamilies.length} product families`);

    // 4. Seed Products
    const products = await Product.insertMany([
      // Apples
      {
        familyId: productFamilies[0]._id,
        subCategoryId: subCategories[0]._id,
        categoryId: categories[0]._id,
        name: "Fresh Red Apples",
        brand: "Fresh Farm",
        description: "Crisp and sweet red apples, perfect for snacking or cooking.",
        unitType: "weight",
        status: "active"
      },
      // Bananas
      {
        familyId: productFamilies[1]._id,
        subCategoryId: subCategories[0]._id,
        categoryId: categories[0]._id,
        name: "Cavendish Bananas",
        brand: "Tropical Fresh",
        description: "Ripe and ready-to-eat bananas, rich in potassium.",
        unitType: "weight",
        status: "active"
      },
      // Basmati Rice
      {
        familyId: productFamilies[5]._id,
        subCategoryId: subCategories[3]._id,
        categoryId: categories[1]._id,
        name: "Premium Basmati Rice",
        brand: "India Gate",
        description: "Extra long grain basmati rice, aged for 2 years.",
        unitType: "weight",
        status: "active"
      },
      // Milk
      {
        familyId: productFamilies[7]._id,
        subCategoryId: subCategories[4]._id,
        categoryId: categories[1]._id,
        name: "Full Cream Milk",
        brand: "Amul",
        description: "Fresh full cream milk, rich and creamy.",
        unitType: "volume",
        status: "active"
      },
      // Wheat Flour
      {
        familyId: productFamilies[9]._id,
        subCategoryId: subCategories[5]._id,
        categoryId: categories[1]._id,
        name: "Whole Wheat Atta",
        brand: "Aashirvaad",
        description: "100% whole wheat flour for soft rotis.",
        unitType: "weight",
        status: "active"
      },
      // Cola Drinks
      {
        familyId: productFamilies[12]._id,
        subCategoryId: subCategories[12]._id,
        categoryId: categories[3]._id,
        name: "Cola Soft Drink",
        brand: "Coca-Cola",
        description: "Classic cola flavored carbonated soft drink.",
        unitType: "volume",
        status: "active"
      }
    ]);
    console.log(`✓ Seeded ${products.length} products`);

    // 5. Seed Product Variants
    const productVariants = await ProductVariant.insertMany([
      // Apples variants
      {
        productId: products[0]._id,
        variantLabel: "500g",
        packSize: { value: 500, unit: "g" },
        sku: "APPLE-500G",
        mrp: 80,
        basePrice: 70,
        status: "active"
      },
      {
        productId: products[0]._id,
        variantLabel: "1kg",
        packSize: { value: 1, unit: "kg" },
        sku: "APPLE-1KG",
        mrp: 150,
        basePrice: 130,
        status: "active"
      },
      // Bananas variants
      {
        productId: products[1]._id,
        variantLabel: "500g",
        packSize: { value: 500, unit: "g" },
        sku: "BANANA-500G",
        mrp: 30,
        basePrice: 25,
        status: "active"
      },
      {
        productId: products[1]._id,
        variantLabel: "1kg",
        packSize: { value: 1, unit: "kg" },
        sku: "BANANA-1KG",
        mrp: 55,
        basePrice: 48,
        status: "active"
      },
      // Basmati Rice variants
      {
        productId: products[2]._id,
        variantLabel: "1kg",
        packSize: { value: 1, unit: "kg" },
        sku: "BASMATI-1KG",
        mrp: 120,
        basePrice: 105,
        status: "active"
      },
      {
        productId: products[2]._id,
        variantLabel: "5kg",
        packSize: { value: 5, unit: "kg" },
        sku: "BASMATI-5KG",
        mrp: 550,
        basePrice: 490,
        status: "active"
      },
      // Milk variants
      {
        productId: products[3]._id,
        variantLabel: "500ml",
        packSize: { value: 500, unit: "ml" },
        sku: "MILK-500ML",
        mrp: 32,
        basePrice: 28,
        status: "active"
      },
      {
        productId: products[3]._id,
        variantLabel: "1L",
        packSize: { value: 1, unit: "l" },
        sku: "MILK-1L",
        mrp: 60,
        basePrice: 52,
        status: "active"
      },
      // Wheat Flour variants
      {
        productId: products[4]._id,
        variantLabel: "1kg",
        packSize: { value: 1, unit: "kg" },
        sku: "ATTA-1KG",
        mrp: 45,
        basePrice: 40,
        status: "active"
      },
      {
        productId: products[4]._id,
        variantLabel: "5kg",
        packSize: { value: 5, unit: "kg" },
        sku: "ATTA-5KG",
        mrp: 210,
        basePrice: 185,
        status: "active"
      },
      // Cola variants
      {
        productId: products[5]._id,
        variantLabel: "500ml",
        packSize: { value: 500, unit: "ml" },
        sku: "COLA-500ML",
        mrp: 40,
        basePrice: 35,
        status: "active"
      },
      {
        productId: products[5]._id,
        variantLabel: "2L",
        packSize: { value: 2, unit: "l" },
        sku: "COLA-2L",
        mrp: 80,
        basePrice: 70,
        status: "active"
      }
    ]);
    console.log(`✓ Seeded ${productVariants.length} product variants`);

    console.log("\n🎉 Full catalog seeded successfully!");
    console.log(`Summary:`);
    console.log(`- Categories: ${categories.length}`);
    console.log(`- SubCategories: ${subCategories.length}`);
    console.log(`- Product Families: ${productFamilies.length}`);
    console.log(`- Products: ${products.length}`);
    console.log(`- Product Variants: ${productVariants.length}`);

    await mongoose.disconnect();
    console.log("MongoDB disconnected");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding catalog:", error);
    process.exit(1);
  }
};

seedFullCatalog();
