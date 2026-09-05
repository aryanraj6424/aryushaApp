export const deg2rad = (deg) => {
  return deg * (Math.PI / 180);
};

/**
 * Calculates the distance between two coordinates in kilometers using the Haversine formula.
 * @param {number} lat1 Latitude of position 1
 * @param {number} lon1 Longitude of position 1
 * @param {number} lat2 Latitude of position 2
 * @param {number} lon2 Longitude of position 2
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in KM
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in KM
};
