import express from "express";
import axios from "axios";

const router = express.Router();

/**
 * Helper function to parse Google Maps address components into simplified address object.
 */
function parseGoogleAddressComponents(components) {
  let postcode = "";
  let city = "";
  let state = "";
  let road = "";

  if (Array.isArray(components)) {
    let localityCity = "";
    let admin2City = "";
    let sublocalityCity = "";

    for (const comp of components) {
      const types = comp.types || [];
      if (types.includes("postal_code")) {
        postcode = comp.long_name;
      }
      if (types.includes("locality")) {
        localityCity = comp.long_name;
      } else if (types.includes("administrative_area_level_2")) {
        admin2City = comp.long_name;
      } else if (types.includes("sublocality_level_1") || types.includes("sublocality")) {
        sublocalityCity = comp.long_name;
      }
      if (types.includes("administrative_area_level_1")) {
        state = comp.long_name;
      }
      if (types.includes("route") || types.includes("sublocality_level_1") || types.includes("neighborhood")) {
        if (!road) road = comp.long_name;
      }
    }

    // Priority for City: locality (e.g. Dhanbad / Gurugram) > administrative_area_level_2 (District) > sublocality_level_1
    city = localityCity || admin2City || sublocalityCity || "";
  }
  return { postcode, city, state, road };
}

/*
|--------------------------------------------------------------------------
| Search Address (Google Maps Geocoding & Places API)
| Replaced OpenStreetMap Nominatim with Google Maps Geocoding API
|--------------------------------------------------------------------------
*/
router.get("/search", async (req, res) => {
  try {
    const { text } = req.query;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Search text is required",
      });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || "AIzaSyAZiwElX_ByZPzc9MHLLC-E6Jr_Tkk7Kss";

    // Query Google Maps Geocoding API restricted to India
    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: {
          address: text,
          components: "country:in",
          key: apiKey,
        },
      }
    );

    const results = (response.data.results || []).map((item) => {
      const parsed = parseGoogleAddressComponents(item.address_components);
      return {
        place_id: item.place_id,
        display_name: item.formatted_address,
        formatted: item.formatted_address,
        lat: item.geometry.location.lat,
        lon: item.geometry.location.lng,
        lng: item.geometry.location.lng,
        address: parsed,
        ...parsed,
      };
    });

    res.status(200).json({
      success: true,
      results,
    });

  } catch (error) {
    console.error("Google Maps Location Search Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch addresses",
    });
  }
});

/*
|--------------------------------------------------------------------------
| Reverse Geocode Coordinates (Google Maps Geocoding API)
| Replaced OpenStreetMap Nominatim with Google Maps Geocoding API
|--------------------------------------------------------------------------
*/
router.get("/reverse", async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        message: "Latitude and Longitude are required",
      });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || "AIzaSyAZiwElX_ByZPzc9MHLLC-E6Jr_Tkk7Kss";

    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: {
          latlng: `${lat},${lon}`,
          key: apiKey,
        },
      }
    );

    const first = response.data.results?.[0];
    if (first) {
      const parsed = parseGoogleAddressComponents(first.address_components);
      res.status(200).json({
        success: true,
        result: {
          display_name: first.formatted_address,
          formatted: first.formatted_address,
          lat: first.geometry.location.lat,
          lon: first.geometry.location.lng,
          lng: first.geometry.location.lng,
          address: parsed,
          ...parsed,
        },
      });
    } else {
      res.status(200).json({
        success: true,
        result: { formatted: "Unknown location", postcode: "", city: "", state: "", road: "" },
      });
    }

  } catch (error) {
    console.error("Google Maps Reverse Geocoding Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to reverse geocode coordinates",
    });
  }
});

export default router;