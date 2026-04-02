import { getProjectMapCenter } from "@/lib/project-map-centers"
import { TURBINE_SITE_COORDINATES } from "@/lib/turbine-site-coordinates"

/** Pin fill colors by register status color (matches table badges). */
export const STATUS_PIN_HEX: Record<string, string> = {
  blue: "#2563eb",
  green: "#16a34a",
  gray: "#64748b",
  orange: "#ea580c",
  teal: "#0d9488",
  yellow: "#ca8a04",
  red: "#dc2626",
}

export type MapPositionAsset = {
  id: string
  name: string
  /** When `allAssets` spans multiple projects, filter assemblies by project. */
  project?: string
  isAssembly?: boolean
  parentAssemblyAssetId?: string
  latitude?: number
  longitude?: number
}

function hasStoredGeo(a: MapPositionAsset): boolean {
  return (
    typeof a.latitude === "number" &&
    typeof a.longitude === "number" &&
    Number.isFinite(a.latitude) &&
    Number.isFinite(a.longitude)
  )
}

function hashUnit(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  return (Math.abs(h) % 10000) / 10000
}

function scatterPosition(assetId: string, center: { lat: number; lng: number }) {
  const uLat = hashUnit(`${assetId}:lat`)
  const uLng = hashUnit(`${assetId}:lng`)
  const spread = 0.055
  return {
    lat: center.lat + (uLat - 0.5) * spread * 2,
    lng: center.lng + (uLng - 0.5) * spread * 2,
  }
}

/**
 * Fallback image overlay bounds (only if live tiles fail) — around Google Maps reference point.
 */
export const TEHACHAPI_SATELLITE_BOUNDS: [[number, number], [number, number]] = [
  [34.94, -118.42],
  [35.08, -118.14],
]

/**
 * Compute all marker positions in one pass so wind turbines form row-like strings
 * (similar to aerial wind-farm reference) and components cluster near parent WTG.
 */
export function getAssetMapPositionsForView(
  allAssets: MapPositionAsset[],
  projectId: string
): Map<string, { lat: number; lng: number }> {
  const center = getProjectMapCenter(projectId)
  const out = new Map<string, { lat: number; lng: number }>()

  if (!projectId.startsWith("wf-")) {
    for (const a of allAssets) {
      if (hasStoredGeo(a)) {
        out.set(a.id, { lat: a.latitude!, lng: a.longitude! })
      } else {
        out.set(a.id, scatterPosition(a.id, center))
      }
    }
    return out
  }

  /** All assembly rows share the canonical 30-site list (index cycles if more than 30). */
  const assemblies = [...allAssets]
    .filter((a) => a.isAssembly)
    .sort((a, b) => a.name.localeCompare(b.name))

  const n = TURBINE_SITE_COORDINATES.length
  assemblies.forEach((a, i) => {
    const site = TURBINE_SITE_COORDINATES[i % n]!
    out.set(a.id, { lat: site.lat, lng: site.lng })
  })

  for (const a of allAssets) {
    if (a.isAssembly) continue
    const parentId = a.parentAssemblyAssetId
    const parentPos = parentId ? out.get(parentId) : undefined
    if (parentPos) {
      out.set(a.id, {
        lat: parentPos.lat + (hashUnit(`${a.id}c`) - 0.5) * 0.0028,
        lng: parentPos.lng + (hashUnit(`${a.id}d`) - 0.5) * 0.0028,
      })
    } else {
      out.set(a.id, scatterPosition(a.id, center))
    }
  }

  return out
}

/** @deprecated use getAssetMapPositionsForView for wind projects */
export function getAssetMapPosition(asset: { id: string }, projectId: string) {
  return scatterPosition(asset.id, getProjectMapCenter(projectId))
}

export function getPinHexForStatus(statusColor: string): string {
  return STATUS_PIN_HEX[statusColor] ?? "#64748b"
}

/**
 * Resolved site from {@link TURBINE_SITE_COORDINATES} — same ordering as map pins.
 * Pass `projectNameFilter` (asset.project) when `allAssets` includes multiple projects.
 */
export function getWindAssemblySiteFromCanonicalList(
  assetId: string,
  allAssets: MapPositionAsset[],
  projectNameFilter?: string
): { lat: number; lng: number; label: string } | undefined {
  const assemblies = [...allAssets]
    .filter(
      (a) =>
        a.isAssembly &&
        (!projectNameFilter || a.project === projectNameFilter)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  const idx = assemblies.findIndex((a) => a.id === assetId)
  if (idx < 0) return undefined
  const site = TURBINE_SITE_COORDINATES[idx % TURBINE_SITE_COORDINATES.length]!
  return { lat: site.lat, lng: site.lng, label: site.label }
}
