/**
 * Canonical WGS84 sites for wind turbine assemblies (demo).
 * Map and detail views use only this list — assemblies are assigned by sorted order (index % length).
 */
export const TURBINE_SITE_COORDINATES = [
  { lat: 35.01358, lng: -118.24278, label: "North of Oak Creek Rd" },
  { lat: 35.01235, lng: -118.24355, label: "Near Oak Creek Rd intersection" },
  { lat: 35.01186, lng: -118.24354, label: "North string, near upper edge" },
  { lat: 35.01085, lng: -118.24345, label: "North string" },
  { lat: 35.00935, lng: -118.24422, label: "Central-North string" },
  { lat: 35.00842, lng: -118.24528, label: "Upper General Petroleum Rd" },
  { lat: 35.00745, lng: -118.24625, label: "North of the road bend" },
  { lat: 35.00645, lng: -118.24719, label: "Main bend on General Petroleum Rd" },
  { lat: 35.00531, lng: -118.24835, label: "South of main road bend" },
  { lat: 35.00418, lng: -118.24948, label: "Southwest string" },
  { lat: 35.00298, lng: -118.2507, label: "Lower Southwest string" },
  { lat: 35.00164, lng: -118.25208, label: "Near southern view edge" },
  { lat: 35.01124, lng: -118.23965, label: "Northeast cluster" },
  { lat: 35.01045, lng: -118.23998, label: "Northeast cluster" },
  { lat: 35.00955, lng: -118.24035, label: "North of Substation" },
  { lat: 35.00865, lng: -118.24075, label: "Near Alta Wind V Substation" },
  { lat: 35.00778, lng: -118.24125, label: "South of Substation" },
  { lat: 35.00585, lng: -118.2385, label: "East of General Petroleum Rd" },
  { lat: 35.00495, lng: -118.23925, label: "Southeast string" },
  { lat: 35.00395, lng: -118.2401, label: "Southeast string" },
  { lat: 35.00295, lng: -118.24105, label: "Southeast string" },
  { lat: 35.00195, lng: -118.24195, label: "Bottom-East string" },
  { lat: 35.00825, lng: -118.25525, label: "West of main road" },
  { lat: 35.00735, lng: -118.25615, label: "West of main road" },
  { lat: 35.00645, lng: -118.25705, label: "West of main road" },
  { lat: 35.00555, lng: -118.25805, label: "West of main road" },
  { lat: 35.00465, lng: -118.25905, label: "Far West string" },
  { lat: 35.00375, lng: -118.26005, label: "Far West string" },
  { lat: 35.01425, lng: -118.2495, label: "Far North edge" },
  { lat: 35.01515, lng: -118.2488, label: "Northwest corner" },
] as const

export const WIND_FARM_SITE_CENTER = {
  lat:
    TURBINE_SITE_COORDINATES.reduce((s, p) => s + p.lat, 0) /
    TURBINE_SITE_COORDINATES.length,
  lng:
    TURBINE_SITE_COORDINATES.reduce((s, p) => s + p.lng, 0) /
    TURBINE_SITE_COORDINATES.length,
} as const
