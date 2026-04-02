import { WIND_FARM_SITE_CENTER } from "@/lib/turbine-site-coordinates"

/**
 * Live satellite basemap tiles (no API key) — real imagery at GPS coordinates.
 * Esri World Imagery is commonly used with Leaflet; aligns with commercial map apps’ satellite layers.
 */
export const WIND_MAP_REFERENCE = {
  lat: WIND_FARM_SITE_CENTER.lat,
  lng: WIND_FARM_SITE_CENTER.lng,
} as const

/** Esri World Imagery — worldwide satellite / aerial. */
export const ESRI_WORLD_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

/** Light labels / roads overlay (optional). */
export const ESRI_REFERENCE_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
