"use client"

import { useEffect, useMemo, useRef } from "react"
import L from "leaflet"
import {
  MapContainer,
  ImageOverlay,
  TileLayer,
  Marker,
  Tooltip,
  Popup,
  useMap,
  ZoomControl,
  ScaleControl,
} from "react-leaflet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertTriangle, Crosshair, MapPin, Search, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getAssetMapPositionsForView,
  getPinHexForStatus,
  getWindAssemblySiteFromCanonicalList,
} from "@/lib/asset-map-geo"
import { getProjectMapCenter } from "@/lib/project-map-centers"
import { ESRI_REFERENCE_LABELS, ESRI_WORLD_IMAGERY } from "@/lib/map-tiles"
import type { Asset } from "@/components/assets-list"
import type { Marker as LeafletMarkerInstance } from "leaflet"
import type { AssetType } from "@/app/page"
import { TEMPLATE_ASSET_TYPES } from "@/lib/template-asset-types"
import {
  getLinkableLeafTypesUnderAssembly,
  resolveAssemblyTypeForAsset,
} from "@/lib/assembly-asset-types"

function makePinIcon(hex: string, selected: boolean) {
  const inner = `<div class="asset-map-pin${selected ? " asset-map-pin--selected" : ""}" style="--pin-color:${hex};position:relative;z-index:1"></div>`
  const html = selected
    ? `<div class="asset-map-pin-selected-wrap"><span class="asset-map-pin-selected-ring" aria-hidden="true"></span>${inner}</div>`
    : inner
  return L.divIcon({
    className: "asset-map-pin-wrapper",
    html,
    iconSize: selected ? [32, 32] : [24, 24],
    iconAnchor: selected ? [16, 16] : [12, 12],
    popupAnchor: [0, selected ? -14 : -10],
  })
}

/** Turbine assembly — solid fill = status (matches register palette). */
function makeTurbineIcon(statusHex: string, selected: boolean) {
  const inner = `<div class="asset-map-turbine${selected ? " asset-map-turbine--selected" : ""}" style="--status:${statusHex};position:relative;z-index:1"></div>`
  const html = selected
    ? `<div class="asset-map-turbine-selected-wrap"><span class="asset-map-turbine-selected-ring" aria-hidden="true"></span>${inner}</div>`
    : inner
  return L.divIcon({
    className: "asset-map-turbine-pin-wrapper",
    html,
    iconSize: selected ? [32, 32] : [22, 22],
    iconAnchor: selected ? [16, 16] : [11, 11],
    popupAnchor: [0, selected ? -14 : -10],
  })
}

/**
 * Fit all pins once when the visible asset set changes — not on every render,
 * so panning to a selected pin isn’t overwritten.
 */
function MapFitBounds({
  points,
  fitKey,
}: {
  points: [number, number][]
  fitKey: string
}) {
  const map = useMap()
  const lastFitKey = useRef<string | null>(null)
  useEffect(() => {
    if (points.length === 0) {
      lastFitKey.current = null
      return
    }
    if (lastFitKey.current === fitKey) return
    lastFitKey.current = fitKey
    if (points.length === 1) {
      map.setView(points[0], 14)
      return
    }
    const b = L.latLngBounds(points)
    map.fitBounds(b, { padding: [56, 56], maxZoom: 15 })
  }, [map, points, fitKey])
  return null
}

/** Center the map on a pin when list crosshair / marker click requests it — keeps the pin in view. */
function CenterOnFlyToRequest({
  at,
  onConsumed,
}: {
  at: [number, number] | null
  onConsumed: () => void
}) {
  const map = useMap()
  useEffect(() => {
    if (!at) return
    let cancelled = false
    const raf = requestAnimationFrame(() => {
      if (cancelled) return
      map.invalidateSize()
      const targetZoom = Math.max(16, map.getZoom())
      map.setView(at, targetZoom, { animate: true, duration: 0.38 })
    })
    const t = setTimeout(onConsumed, 480)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [at, map, onConsumed])
  return null
}

/**
 * Same rules as {@link AssemblyComponentsTab}: leaf types under the assembly in settings
 * minus types already covered by a linked child asset.
 */
function getAssemblyComponentSummary(
  assembly: Asset,
  templateId: string,
  registerAssets: Asset[]
):
  | {
      linkedCount: number
      linkableLeafTypes: AssetType[]
      missingComponentTypes: AssetType[]
    }
  | null {
  if (!assembly.isAssembly) return null
  const assetTypes = TEMPLATE_ASSET_TYPES[templateId] ?? []
  const assemblyType = resolveAssemblyTypeForAsset(assetTypes, assembly.type)
  if (!assemblyType) return null
  const linkableLeafTypes = getLinkableLeafTypesUnderAssembly(assetTypes, assemblyType.id)
  const linked = registerAssets.filter((a) => a.parentAssemblyAssetId === assembly.id)
  const covered = new Set(linked.map((a) => a.type))
  const missingComponentTypes = linkableLeafTypes.filter((t) => !covered.has(t.name))
  return {
    linkedCount: linked.length,
    linkableLeafTypes,
    missingComponentTypes,
  }
}

const STATUS_BADGE: Record<
  Asset["statusColor"],
  string
> = {
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  green: "bg-green-100 text-green-800 border-green-200",
  gray: "bg-gray-100 text-gray-800 border-gray-200",
  orange: "bg-orange-100 text-orange-800 border-orange-200",
  teal: "bg-teal-100 text-teal-800 border-teal-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  red: "bg-red-100 text-red-800 border-red-200",
}

/** Compact hover card — click opens the asset detail sheet (right pane). */
function AssetTooltipContent({
  asset,
  assets,
  isWindProject,
}: {
  asset: Asset
  assets: Asset[]
  isWindProject: boolean
}) {
  const windSite =
    isWindProject && asset.isAssembly
      ? getWindAssemblySiteFromCanonicalList(asset.id, assets, asset.project)
      : undefined
  return (
    <div className="text-xs min-w-[10rem] max-w-[14rem] space-y-1 leading-snug">
      <p className="font-semibold text-foreground">{asset.name}</p>
      <p className="font-mono text-[10px] text-muted-foreground">{asset.code}</p>
      {windSite ? (
        <>
          <p className="text-muted-foreground">{windSite.label}</p>
          <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {windSite.lat.toFixed(5)}, {windSite.lng.toFixed(5)}
          </p>
        </>
      ) : (
        <>
          {asset.mapPositionLabel ? (
            <p className="text-muted-foreground">{asset.mapPositionLabel}</p>
          ) : null}
          {typeof asset.latitude === "number" && typeof asset.longitude === "number" ? (
            <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {asset.latitude.toFixed(5)}, {asset.longitude.toFixed(5)}
            </p>
          ) : null}
        </>
      )}
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 border-t border-border/60 pt-1.5 mt-1">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: getPinHexForStatus(asset.statusColor) }}
        />
        <span className="text-muted-foreground">{asset.status}</span>
        <span className="text-muted-foreground/80">·</span>
        <span className="text-muted-foreground line-clamp-2">{asset.type}</span>
      </p>
    </div>
  )
}

/** Larger popup on pin click (hover still uses {@link AssetTooltipContent}). */
function AssetPopupContent({
  asset,
  assets,
  isWindProject,
  templateId,
  registerAssets,
}: {
  asset: Asset
  assets: Asset[]
  isWindProject: boolean
  templateId: string
  registerAssets: Asset[]
}) {
  const assemblySummary = useMemo(
    () => getAssemblyComponentSummary(asset, templateId, registerAssets),
    [asset, templateId, registerAssets]
  )

  return (
    <div className="min-w-[12rem] max-w-[20rem]">
      <AssetTooltipContent asset={asset} assets={assets} isWindProject={isWindProject} />

      {assemblySummary && assemblySummary.linkableLeafTypes.length > 0 ? (
        <div className="mt-2 pt-2 border-t border-border/70 space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Assembly components
          </p>
          <p className="text-xs text-foreground">
            <span className="font-semibold tabular-nums">{assemblySummary.linkedCount}</span> linked
            <span className="text-muted-foreground">
              {" "}
              · {assemblySummary.linkableLeafTypes.length} expected type
              {assemblySummary.linkableLeafTypes.length === 1 ? "" : "s"} in template
            </span>
          </p>
          {assemblySummary.missingComponentTypes.length > 0 ? (
            <div className="rounded-md border border-amber-500/45 bg-amber-500/10 px-2.5 py-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-950 dark:text-amber-50">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                Missing component types
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {assemblySummary.missingComponentTypes.map((t) => (
                  <li key={t.id}>
                    <Badge
                      variant="outline"
                      className="font-normal text-[10px] h-5 px-1.5 border-amber-500/50 bg-amber-500/15 text-amber-950 dark:text-amber-50"
                    >
                      {t.name}
                      {t.code ? (
                        <span className="ml-1 font-mono text-[9px] text-muted-foreground">{t.code}</span>
                      ) : null}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
              All expected component types are linked.
            </p>
          )}
        </div>
      ) : null}

      <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/70 leading-snug">
        Full details and linking are in the panel on the right. The selected pin is highlighted on the
        map.
      </p>
    </div>
  )
}

function MapClosePopupWhenNoSelection({ selectedId }: { selectedId: string | null }) {
  const map = useMap()
  useEffect(() => {
    if (selectedId === null) {
      map.closePopup()
    }
  }, [map, selectedId])
  return null
}

export interface AssetsMapViewProps {
  assets: Asset[]
  projectId: string
  projectName: string
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  hasActiveFilters: boolean
  onOpenFilters: () => void
  selectedAssetId: string | null
  onSelectAsset: (asset: Asset) => void
  flyToAssetId: string | null
  onFlyToConsumed: () => void
  /** Crosshair on list row — center map without duplicating selection logic */
  onRequestFlyTo: (assetId: string) => void
  /** Template id + full register — used to show missing assembly component types on popups. */
  templateId: string
  registerAssets: Asset[]
}

export function AssetsMapView({
  assets,
  projectId,
  projectName,
  searchQuery,
  onSearchQueryChange,
  hasActiveFilters,
  onOpenFilters,
  selectedAssetId,
  onSelectAsset,
  flyToAssetId,
  onFlyToConsumed,
  onRequestFlyTo,
  templateId,
  registerAssets,
}: AssetsMapViewProps) {
  const center = useMemo(() => getProjectMapCenter(projectId), [projectId])
  const isWindProject = projectId.startsWith("wf-")

  const positionsById = useMemo(
    () => getAssetMapPositionsForView(assets, projectId),
    [assets, projectId]
  )

  const points = useMemo(
    () =>
      assets.map((a) => {
        const p = positionsById.get(a.id)!
        return [p.lat, p.lng] as [number, number]
      }),
    [assets, positionsById]
  )

  /** Only when this changes should we re-fit all bounds (filter / project), not when selecting a pin. */
  const mapFitKey = useMemo(() => assets.map((a) => a.id).join("\0"), [assets])

  /** Bundled image bounds (non–wind projects only). */
  const satelliteImageBounds = useMemo(() => {
    if (points.length === 0) {
      return L.latLngBounds(
        [center.lat - 0.085, center.lng - 0.11],
        [center.lat + 0.085, center.lng + 0.11]
      )
    }
    const b = L.latLngBounds(points)
    return b.pad(0.45)
  }, [points, center])

  const flyToPos = useMemo(() => {
    if (!flyToAssetId) return null
    const p = positionsById.get(flyToAssetId)
    if (!p) return null
    return [p.lat, p.lng] as [number, number]
  }, [flyToAssetId, positionsById])

  useEffect(() => {
    if (!flyToPos) return
    const t = setTimeout(() => onFlyToConsumed(), 650)
    return () => clearTimeout(t)
  }, [flyToPos, onFlyToConsumed])

  const markerRefs = useRef<Map<string, LeafletMarkerInstance>>(new Map())

  /** Open the map popup when the selection comes from the list (marker click opens via Leaflet). */
  useEffect(() => {
    if (!selectedAssetId) return
    const t = window.setTimeout(() => {
      markerRefs.current.get(selectedAssetId)?.openPopup()
    }, 560)
    return () => window.clearTimeout(t)
  }, [selectedAssetId])

  const iconsByAssetId = useMemo(() => {
    const m = new Map<string, L.DivIcon>()
    const hex = (a: Asset) => getPinHexForStatus(a.statusColor)
    for (const a of assets) {
      const selected = selectedAssetId === a.id
      if (isWindProject && a.isAssembly) {
        m.set(a.id, makeTurbineIcon(hex(a), selected))
      } else {
        m.set(a.id, makePinIcon(hex(a), selected))
      }
    }
    return m
  }, [assets, isWindProject, selectedAssetId])

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden overscroll-none rounded-lg border bg-card shadow-sm">
      <div className="flex min-h-0 w-full max-w-[340px] shrink-0 flex-col border-r bg-muted/20">
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search assets…"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="pl-8 h-9 bg-background"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={hasActiveFilters ? "secondary" : "outline"}
              size="sm"
              className="h-8 gap-1.5 flex-1"
              onClick={onOpenFilters}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {hasActiveFilters ? (
                <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                  •
                </span>
              ) : null}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {projectName} · {assets.length} asset{assets.length === 1 ? "" : "s"} on map
          </p>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="p-2 space-y-2">
            {assets.length === 0 ? (
              <li className="text-sm text-muted-foreground px-2 py-8 text-center">
                No assets match your search or filters.
              </li>
            ) : (
              assets.map((a) => {
                const active = selectedAssetId === a.id
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAsset(a)
                        onRequestFlyTo(a.id)
                      }}
                      className={cn(
                        "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
                        active
                          ? "border-orange-500 bg-orange-500/10 ring-1 ring-orange-500/30"
                          : "border-border bg-background hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex items-start gap-2">
                          <span
                            className={cn(
                              "mt-0.5 shrink-0 border-2 border-white shadow flex items-center justify-center rounded-full",
                              isWindProject && a.isAssembly ? "h-7 w-7" : "h-8 w-8"
                            )}
                            style={{
                              backgroundColor: getPinHexForStatus(a.statusColor),
                            }}
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight truncate">{a.name}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate">{a.code}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Center map on asset"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectAsset(a)
                            onRequestFlyTo(a.id)
                          }}
                        >
                          <Crosshair className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] font-medium", STATUS_BADGE[a.statusColor])}
                        >
                          {a.status}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] font-normal truncate max-w-full">
                          {a.type}
                        </Badge>
                      </div>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </ScrollArea>
        <div className="shrink-0 space-y-1 border-t bg-muted/30 p-3 text-[10px] text-muted-foreground">
          {isWindProject ? (
            <p className="text-[11px] text-foreground/90 mb-1">
              Solid dots = turbine assemblies (WTG). Fill color = status.
            </p>
          ) : null}
          <p className="font-medium text-foreground text-xs">Solid pin color = status</p>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {(
              [
                ["Installed / In progress", "blue"],
                ["Approved / Active", "green"],
                ["Review / Hold", "yellow"],
                ["Design / Draft", "gray"],
                ["Commissioned", "teal"],
                ["Archived", "orange"],
                ["Critical", "red"],
              ] as const
            ).map(([label, key]) => (
              <span key={key} className="inline-flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-sm border border-white/80 shadow shrink-0"
                  style={{ backgroundColor: getPinHexForStatus(key) }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="relative min-h-0 min-w-0 flex-1 overscroll-none">
        <MapContainer
          key={`${projectId}-${isWindProject ? "wind" : "gen"}`}
          center={[center.lat, center.lng]}
          zoom={isWindProject ? 14 : 12}
          minZoom={3}
          maxZoom={19}
          className="absolute inset-0 z-0 h-full w-full min-h-0"
          scrollWheelZoom
        >
          {isWindProject ? (
            <>
              {/*
                Live satellite tiles (Esri World Imagery) — real aerial at this GPS location.
                Google Maps tiles cannot be embedded in Leaflet without a Maps JavaScript API key.
              */}
              <TileLayer
                attribution='&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
                url={ESRI_WORLD_IMAGERY}
                maxNativeZoom={19}
                maxZoom={22}
              />
              <TileLayer
                attribution='&copy; Esri'
                url={ESRI_REFERENCE_LABELS}
                opacity={0.72}
                maxZoom={22}
              />
            </>
          ) : (
            <ImageOverlay
              url="/images/asset-map-satellite.jpg"
              bounds={satelliteImageBounds}
              opacity={1}
            />
          )}
          <ZoomControl position="bottomleft" />
          <ScaleControl position="bottomleft" imperial />
          <MapFitBounds points={points} fitKey={mapFitKey} />
          <CenterOnFlyToRequest at={flyToPos} onConsumed={onFlyToConsumed} />
          <MapClosePopupWhenNoSelection selectedId={selectedAssetId} />

          {assets.map((a) => {
            const p = positionsById.get(a.id)!
            return (
              <Marker
                key={a.id}
                ref={(inst) => {
                  if (inst) {
                    markerRefs.current.set(a.id, inst)
                  } else {
                    markerRefs.current.delete(a.id)
                  }
                }}
                position={[p.lat, p.lng]}
                icon={iconsByAssetId.get(a.id)!}
                zIndexOffset={selectedAssetId === a.id ? 1200 : 0}
                eventHandlers={{
                  click: () => {
                    onSelectAsset(a)
                    onRequestFlyTo(a.id)
                  },
                }}
              >
                <Tooltip
                  direction="top"
                  offset={[0, -10]}
                  opacity={1}
                  sticky
                  autoPan={false}
                  className="!rounded-md !border !border-border !bg-popover !px-2.5 !py-2 !text-popover-foreground !shadow-md [&_.leaflet-tooltip-tip]:!bg-popover [&_.leaflet-tooltip-tip]:!border-border"
                >
                  <AssetTooltipContent
                    asset={a}
                    assets={assets}
                    isWindProject={isWindProject}
                  />
                </Tooltip>
                <Popup
                  autoPan
                  autoPanPadding={[52, 52]}
                  minWidth={240}
                  className="[&_.leaflet-popup-content-wrapper]:!rounded-lg [&_.leaflet-popup-content]:!m-3 [&_.leaflet-popup-content-wrapper]:!border [&_.leaflet-popup-content-wrapper]:!border-border [&_.leaflet-popup-content-wrapper]:!bg-popover [&_.leaflet-popup-content-wrapper]:!shadow-lg [&_.leaflet-popup-tip]:!border-border [&_.leaflet-popup-tip]:!bg-popover"
                >
                  <AssetPopupContent
                    asset={a}
                    assets={assets}
                    isWindProject={isWindProject}
                    templateId={templateId}
                    registerAssets={registerAssets}
                  />
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>

        <div className="pointer-events-none absolute top-3 left-3 right-3 flex justify-between items-start gap-2">
          <div className="pointer-events-auto max-w-[min(100%,20rem)] rounded-md border bg-background/95 backdrop-blur px-2 py-1.5 shadow-sm text-xs text-muted-foreground space-y-0.5">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate font-medium text-foreground">
                {isWindProject ? "Live satellite (Esri)" : "Satellite-style map"} · {projectName}
              </span>
            </div>
            <p className="text-[10px] leading-snug pl-5 opacity-90">
              {isWindProject
                ? "Hover for a quick preview. Click a pin for a popup, highlighted pin, details panel, and map center."
                : "Hover for a preview. Click a pin for a popup, highlight, and the asset panel."}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
