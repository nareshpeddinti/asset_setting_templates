import { WIND_FARM_SITE_CENTER } from "@/lib/turbine-site-coordinates"

/**
 * Approximate map centers per project (demo) so satellite view matches geography.
 * Assets are scattered near their project center via {@link getAssetMapPosition}.
 */
export const PROJECT_MAP_CENTERS: Record<string, { lat: number; lng: number; label?: string }> = {
  // Residential — US metro spread
  "res-1": { lat: 32.85, lng: -96.75 },
  "res-2": { lat: 44.95, lng: -93.25 },
  "res-3": { lat: 33.45, lng: -112.07 },
  "res-4": { lat: 47.61, lng: -122.33 },
  "res-5": { lat: 40.44, lng: -79.99 },
  // Commercial
  "com-1": { lat: 40.71, lng: -74.01 },
  "com-2": { lat: 34.05, lng: -118.25 },
  "com-3": { lat: 41.88, lng: -87.63 },
  "com-4": { lat: 39.95, lng: -75.17 },
  "com-5": { lat: 33.75, lng: -84.39 },
  // Healthcare
  "hc-1": { lat: 29.76, lng: -95.37 },
  "hc-2": { lat: 42.36, lng: -71.06 },
  "hc-3": { lat: 36.16, lng: -115.14 },
  "hc-4": { lat: 35.23, lng: -80.84 },
  // Industrial
  "ind-1": { lat: 42.33, lng: -83.05 },
  "ind-2": { lat: 33.75, lng: -118.28 },
  "ind-3": { lat: 37.39, lng: -121.96 },
  "ind-4": { lat: 41.5, lng: -87.5 },
  // Data centers
  "dc-1": { lat: 39.04, lng: -77.49 },
  "dc-2": { lat: 37.34, lng: -121.92 },
  "dc-3": { lat: 33.45, lng: -112.07 },
  // Wind — shared centroid of canonical 30 turbine sites (see turbine-site-coordinates)
  "wf-1": { lat: WIND_FARM_SITE_CENTER.lat, lng: WIND_FARM_SITE_CENTER.lng },
  "wf-2": { lat: WIND_FARM_SITE_CENTER.lat, lng: WIND_FARM_SITE_CENTER.lng },
  "wf-3": { lat: WIND_FARM_SITE_CENTER.lat, lng: WIND_FARM_SITE_CENTER.lng },
}

export function getProjectMapCenter(projectId: string): { lat: number; lng: number } {
  return PROJECT_MAP_CENTERS[projectId] ?? { lat: 39.8283, lng: -98.5795 }
}
