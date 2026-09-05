/**
 * Converts a string into a clean, URL-friendly slug.
 * @param {string} text 
 * @returns {string}
 */
export const toSlug = (text) => {
  if (!text) return "";
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric chars with hyphens
    .replace(/^-+|-+$/g, "");     // Trim leading and trailing hyphens
};

/**
 * Generates a unique slug for a product using the provided Product model.
 * If the generated slug exists for another product, appends an incrementing counter (-1, -2, etc.)
 * 
 * @param {string} name - Product name
 * @param {string|null} currentProductId - Current product ID if updating (to exclude itself)
 * @param {object} ProductModel - Mongoose Product model
 * @returns {Promise<string>}
 */
export const generateUniqueSlug = async (name, currentProductId = null, ProductModel) => {
  const baseSlug = toSlug(name) || "product";
  let uniqueSlug = baseSlug;
  let count = 1;

  while (true) {
    const query = { slug: uniqueSlug };
    if (currentProductId) {
      query._id = { $ne: currentProductId };
    }

    const existing = await ProductModel.findOne(query).select("_id").lean();
    if (!existing) {
      break;
    }

    uniqueSlug = `${baseSlug}-${count}`;
    count++;
  }

  return uniqueSlug;
};
