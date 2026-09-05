import StaticPage from "../models/StaticPage.js";
import Vendor from "../../vendor/models/Vendor.js";
import ServiceArea from "../../vendor/models/ServiceArea.js";

const VALID_PAGES = {
  "privacy-policy": "Privacy Policy",
  "terms-conditions": "Terms & Conditions",
  "about-us": "About Us",
  "customer-support": "Customer Support",
  "faq": "FAQ",
  "delivery-area": "Delivery Area"
};

// Get or initialize a static page
export const getStaticPageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    if (!VALID_PAGES[slug]) {
      return res.status(400).json({ success: false, message: "Invalid page slug" });
    }

    let page = await StaticPage.findOne({ slug });
    if (!page) {
      page = await StaticPage.create({
        slug,
        title: VALID_PAGES[slug],
        content: `<h1>${VALID_PAGES[slug]}</h1><p>Content coming soon...</p>`
      });
    }

    res.status(200).json({ success: true, page });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update a static page (Admin)
export const updateStaticPage = async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, content } = req.body;

    if (!VALID_PAGES[slug]) {
      return res.status(400).json({ success: false, message: "Invalid page slug" });
    }

    let page = await StaticPage.findOneAndUpdate(
      { slug },
      { title, content },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, page });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get list of all static CMS pages (Admin)
export const getStaticPagesList = async (req, res) => {
  try {
    const pages = [];
    for (const slug of Object.keys(VALID_PAGES)) {
      let page = await StaticPage.findOne({ slug });
      if (!page) {
        page = await StaticPage.create({
          slug,
          title: VALID_PAGES[slug],
          content: `<h1>${VALID_PAGES[slug]}</h1><p>Content coming soon...</p>`
        });
      }
      pages.push(page);
    }
    res.status(200).json({ success: true, pages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get dynamic cities served list
export const getCitiesServed = async (req, res) => {
  try {
    const vendors = await Vendor.find({
      $or: [{ status: "approved" }, { status: { $exists: false } }]
    }).select("storeDetails address serviceAreas assignedArea");

    const serviceAreas = await ServiceArea.find({ isActive: true }).select("city");
    const citiesSet = new Set();

    vendors.forEach((vendor) => {
      if (vendor.storeDetails?.city) {
        citiesSet.add(vendor.storeDetails.city.trim());
      }
      if (vendor.address?.city) {
        citiesSet.add(vendor.address.city.trim());
      }
      if (vendor.assignedArea) {
        citiesSet.add(vendor.assignedArea.trim());
      }
      if (Array.isArray(vendor.serviceAreas)) {
        vendor.serviceAreas.forEach((sa) => {
          if (typeof sa === "string" && sa) {
            citiesSet.add(sa.trim());
          } else if (sa?.city) {
            citiesSet.add(sa.city.trim());
          }
        });
      }
    });

    serviceAreas.forEach((sa) => {
      if (sa.city) {
        citiesSet.add(sa.city.trim());
      }
    });

    const cities = [...citiesSet].filter(Boolean);
    res.status(200).json({ success: true, cities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
