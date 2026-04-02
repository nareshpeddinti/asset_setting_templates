"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Pencil,
  ImageIcon,
  Link2,
  Search,
  SlidersHorizontal,
  Unlink,
  AlertTriangle,
} from "lucide-react"
import type { Asset } from "@/components/assets-list"
import type { AssetType } from "@/app/page"
import { cn } from "@/lib/utils"
import { TEMPLATE_ASSET_TYPES } from "@/lib/template-asset-types"
import {
  getLinkableLeafTypesUnderAssembly,
  nearestAssemblyAncestor,
  parentAssemblyFieldLabel,
  resolveAssemblyTypeForAsset,
  typeRequiresParentAssemblyField,
} from "@/lib/assembly-asset-types"
import { buildAssetRegisterHref } from "@/lib/asset-register-link"
import { getWindAssemblySiteFromCanonicalList } from "@/lib/asset-map-geo"

const STATUS_COLORS: Record<Asset["statusColor"], string> = {
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  green: "bg-green-100 text-green-700 border-green-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  teal: "bg-teal-100 text-teal-700 border-teal-200",
  yellow: "bg-yellow-100 text-yellow-700 border-yellow-200",
  red: "bg-red-100 text-red-700 border-red-200",
}

interface DetailField {
  label: string
  value: string
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Deterministic demo data for the detail panel. */
export function buildAssetDetailView(asset: Asset, templateAssets?: Asset[]): {
  trade: string
  description: string
  specification: DetailField[]
  maintenance: DetailField[]
  parentAssembly?: string
} {
  const h = hashString(asset.id)
  const trades = ["Mechanical", "Electrical", "Concrete", "HVAC", "Controls", "General"]
  const vendors = ["Automation Vendor", "Acme Services", "Northwind Supply", "GridTech Partners"]
  const manufacturers = ["Schneider", "Vestas", "GE Renewable", "Trane", "Carrier", "ABB"]
  const models = ["Model3", "V174-9.5MW", "Cypress 6.0", "CRAC-400", "Series 7"]

  const trade = trades[h % trades.length]
  const manufacturer = manufacturers[h % manufacturers.length]
  const model = models[h % models.length]
  const serial = `SN-${String(h % 10000).padStart(3, "0")}`
  const barcode = String(1000000000 + (h % 899999999))

  const year = 2024 + (h % 2)
  const install = `${String((h % 12) + 1).padStart(2, "0")}-${String((h % 27) + 1).padStart(2, "0")}-${year}`
  const warrantyStart = `${String((h % 12) + 1).padStart(2, "0")}-${String(((h + 1) % 27) + 1).padStart(2, "0")}-${year}`
  const warrantyEnd = `${String((h % 12) + 1).padStart(2, "0")}-${String((h % 27) + 1).padStart(2, "0")}-${year + 5}`

  const schedules = ["Monthly", "Quarterly", "Semi-Annual", "Annual"]

  let parentAssembly: string | undefined
  if (asset.parentAssemblyAssetId && templateAssets?.length) {
    const p = templateAssets.find((a) => a.id === asset.parentAssemblyAssetId)
    if (p) parentAssembly = `${p.name} (${p.code})`
  }
  if (!parentAssembly && (asset.type === "Blade Sets" || asset.name.toLowerCase().includes("blade"))) {
    const m = asset.name.match(/WTG-(\d+)/i)
    if (m && templateAssets?.length) {
      const turbine = templateAssets.find(
        (a) => a.type === "Wind Turbine Systems" && a.name.includes(`WTG-${m[1]}`)
      )
      parentAssembly = turbine
        ? `${turbine.name} (${turbine.code})`
        : `WTG-${m[1]} — linked assembly (turbine instance)`
    } else if (m) {
      parentAssembly = `WTG-${m[1]} — linked assembly (turbine instance)`
    }
  }

  const description = `Asset record for ${asset.name} in ${asset.project}. Type: ${asset.type}. Status: ${asset.status}. Last updated ${asset.lastModified}.`

  return {
    trade,
    description,
    parentAssembly,
    specification: [
      { label: "Manufacturer", value: manufacturer },
      { label: "Model", value: model },
      { label: "Serial Number", value: serial },
      { label: "Barcode", value: barcode },
    ],
    maintenance: [
      { label: "Installation Date", value: install },
      { label: "Warranty Start Date", value: warrantyStart },
      { label: "Warranty Expiry Date", value: warrantyEnd },
      { label: "Maintenance Schedule", value: schedules[h % schedules.length] },
      { label: "Vendor", value: vendors[h % vendors.length] },
    ],
  }
}

function getRelatedAssets(asset: Asset, allInTemplate: Asset[]): Asset[] {
  if (asset.type === "Wind Turbine Systems") {
    const wtg = asset.name.match(/WTG-(\d+)/)?.[1]
    if (!wtg) return []
    return allInTemplate.filter(
      (a) =>
        a.id !== asset.id &&
        a.name.includes(`WTG-${wtg}`) &&
        a.type !== "Wind Turbine Systems"
    )
  }
  return []
}

function typeHierarchyLabel(all: AssetType[], typeId: string): string {
  const byId = new Map(all.map((t) => [t.id, t]))
  const parts: string[] = []
  let cur: string | undefined = typeId
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const node = byId.get(cur)
    if (!node) break
    parts.unshift(node.name)
    cur = node.parentId
  }
  return parts.join(" → ")
}

function AssemblyComponentsTab({
  assembly,
  templateId,
  templateAssets,
  onUpdateAsset,
}: {
  assembly: Asset
  templateId: string
  templateAssets: Asset[]
  onUpdateAsset: (id: string, patch: Partial<Asset>) => void
}) {
  const pathname = usePathname()
  const [linkOpen, setLinkOpen] = useState(false)
  const [selectedTypeId, setSelectedTypeId] = useState<string>("")
  const [typeSearch, setTypeSearch] = useState("")
  const [assetSearch, setAssetSearch] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])

  const assetTypes = TEMPLATE_ASSET_TYPES[templateId] ?? []
  const assemblyType = resolveAssemblyTypeForAsset(assetTypes, assembly.type)

  const linkableLeafTypes = useMemo(() => {
    if (!assemblyType) return []
    return getLinkableLeafTypesUnderAssembly(assetTypes, assemblyType.id).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }, [assetTypes, assemblyType])

  const linked = useMemo(
    () => templateAssets.filter((a) => a.parentAssemblyAssetId === assembly.id),
    [templateAssets, assembly.id]
  )

  /** Leaf types under this assembly in settings that have no linked component yet (by register `type` name). */
  const missingComponentTypes = useMemo(() => {
    if (!assemblyType || linkableLeafTypes.length === 0) return []
    const covered = new Set(linked.map((a) => a.type))
    return linkableLeafTypes.filter((t) => !covered.has(t.name))
  }, [assemblyType, linkableLeafTypes, linked])

  const filteredLinkableTypes = useMemo(() => {
    const q = typeSearch.trim().toLowerCase()
    if (!q) return linkableLeafTypes
    return linkableLeafTypes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        typeHierarchyLabel(assetTypes, t.id).toLowerCase().includes(q)
    )
  }, [linkableLeafTypes, typeSearch, assetTypes])

  const candidatesForType = useMemo(() => {
    if (!selectedTypeId) return []
    const t = linkableLeafTypes.find((x) => x.id === selectedTypeId)
    if (!t) return []
    return templateAssets.filter(
      (a) =>
        !a.isAssembly &&
        a.type === t.name &&
        a.id !== assembly.id &&
        a.parentAssemblyAssetId !== assembly.id
    )
  }, [selectedTypeId, linkableLeafTypes, templateAssets, assembly.id])

  const filteredTableAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase()
    if (!q) return candidatesForType
    return candidatesForType.filter(
      (a) =>
        `${a.name} ${a.code} ${a.status} ${a.type} ${a.lastModified}`.toLowerCase().includes(q)
    )
  }, [candidatesForType, assetSearch])

  useEffect(() => {
    if (!linkOpen || filteredLinkableTypes.length === 0) return
    if (!filteredLinkableTypes.some((t) => t.id === selectedTypeId)) {
      setSelectedTypeId(filteredLinkableTypes[0].id)
    }
  }, [linkOpen, filteredLinkableTypes, selectedTypeId])

  const toggleAsset = (id: string, checked: boolean) => {
    setSelectedAssetIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)
    )
  }

  const toggleSelectAllVisible = (checked: boolean) => {
    if (checked) {
      const ids = filteredTableAssets.map((a) => a.id)
      setSelectedAssetIds((prev) => [...new Set([...prev, ...ids])])
    } else {
      const visible = new Set(filteredTableAssets.map((a) => a.id))
      setSelectedAssetIds((prev) => prev.filter((id) => !visible.has(id)))
    }
  }

  const allVisibleSelected =
    filteredTableAssets.length > 0 &&
    filteredTableAssets.every((a) => selectedAssetIds.includes(a.id))

  const handleOpenLink = () => {
    setSelectedTypeId(linkableLeafTypes[0]?.id ?? "")
    setTypeSearch("")
    setAssetSearch("")
    setSelectedAssetIds([])
    setFiltersOpen(false)
    setLinkOpen(true)
  }

  const handleLinkNext = () => {
    if (selectedAssetIds.length === 0) return
    for (const id of selectedAssetIds) {
      onUpdateAsset(id, { parentAssemblyAssetId: assembly.id })
    }
    setLinkOpen(false)
    setSelectedAssetIds([])
  }

  const onDialogOpenChange = (open: boolean) => {
    setLinkOpen(open)
    if (!open) {
      setSelectedAssetIds([])
      setAssetSearch("")
      setTypeSearch("")
    }
  }

  return (
    <div className="px-6 py-6 bg-muted/30 min-h-[50vh] space-y-4">
      <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Assembly components</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Components are asset records whose type appears under{" "}
              <span className="font-medium text-foreground">
                {assemblyType?.name ?? assembly.type}
              </span>{" "}
              in Asset Settings. Link existing register assets to this assembly instance.
            </p>
          </div>
          <Button
            type="button"
            className="shrink-0 gap-2 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={handleOpenLink}
            disabled={!assemblyType || linkableLeafTypes.length === 0}
          >
            <Link2 className="h-4 w-4" />
            Link Items
          </Button>
        </div>

        {!assemblyType && (
          <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
            No matching assembly type was found in this template&apos;s settings for “{assembly.type}”.
          </p>
        )}

        {assemblyType && linkableLeafTypes.length > 0 && missingComponentTypes.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              Missing component types
            </div>
            <ul className="flex flex-wrap gap-2">
              {missingComponentTypes.map((t) => (
                <li key={t.id}>
                  <Badge
                    variant="outline"
                    className="font-normal border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-50"
                  >
                    <span>{t.name}</span>
                    {t.code ? (
                      <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{t.code}</span>
                    ) : null}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {linked.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border rounded-md border-dashed">
            No linked components yet. Use <span className="font-medium">Link Items</span> to attach
            assets allowed by the hierarchy.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {linked.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3"
              >
                <div className="min-w-0">
                  <a
                    href={buildAssetRegisterHref(pathname, templateId, c.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:underline truncate block"
                  >
                    {c.name}
                  </a>
                  <p className="text-xs text-muted-foreground font-mono">{c.code}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
                  <span
                    className={cn(
                      "inline-flex px-2 py-0.5 rounded text-xs font-medium border",
                      STATUS_COLORS[c.statusColor]
                    )}
                  >
                    {c.status}
                  </span>
                  <Badge variant="secondary">{c.type}</Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-muted-foreground"
                    onClick={() => onUpdateAsset(c.id, { parentAssemblyAssetId: undefined })}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    Unlink
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={linkOpen} onOpenChange={onDialogOpenChange}>
        <DialogContent
          showCloseButton
          className="flex max-h-[min(90vh,880px)] w-[min(100vw-2rem,960px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        >
          <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
            <DialogTitle className="text-lg font-semibold">Link Items</DialogTitle>
          </div>

          <div className="flex min-h-0 flex-1 divide-x">
            {/* Left: only linkable types from assembly settings */}
            <div className="flex w-[min(100%,240px)] shrink-0 flex-col bg-muted/30">
              <div className="p-3 pb-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search Type"
                    value={typeSearch}
                    onChange={(e) => setTypeSearch(e.target.value)}
                    className="h-9 pl-8 text-sm"
                  />
                </div>
              </div>
              <ScrollArea className="h-[min(52vh,420px)] px-2 pb-3">
                <div className="space-y-0.5 pr-3">
                  {filteredLinkableTypes.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                      No types match your search.
                    </p>
                  ) : (
                    filteredLinkableTypes.map((t) => {
                      const active = selectedTypeId === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTypeId(t.id)
                            setAssetSearch("")
                          }}
                          className={cn(
                            "flex w-full items-center rounded-md border border-transparent py-2.5 pl-3 pr-2 text-left text-sm transition-colors",
                            active
                              ? "border-l-[3px] border-l-sky-600 bg-sky-100/90 font-medium text-foreground dark:bg-sky-950/50"
                              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                          )}
                        >
                          <span className="line-clamp-2">{t.name}</span>
                        </button>
                      )
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right: Assets table — only assets whose type is allowed for this assembly */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                <div className="relative min-w-[140px] flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search"
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                <Button
                  type="button"
                  variant={filtersOpen ? "secondary" : "outline"}
                  size="sm"
                  className="h-9 gap-1.5 shrink-0"
                  onClick={() => setFiltersOpen((o) => !o)}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                </Button>
              </div>
              {filtersOpen && (
                <div className="border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                  Showing assets of type{" "}
                  <span className="font-medium text-foreground">
                    {linkableLeafTypes.find((x) => x.id === selectedTypeId)?.name ?? "—"}
                  </span>{" "}
                  (allowed under this assembly in settings).
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-auto">
                {!selectedTypeId ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Select a component type on the left.
                  </p>
                ) : filteredTableAssets.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    {candidatesForType.length === 0
                      ? "No assets of this type are available to link. Create assets in the register or unlink from another assembly."
                      : "No rows match your search."}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allVisibleSelected}
                            onCheckedChange={(c) => toggleSelectAllVisible(!!c)}
                            aria-label="Select all visible"
                          />
                        </TableHead>
                        <TableHead className="min-w-[160px]">Asset Name</TableHead>
                        <TableHead className="min-w-[120px]">Asset Code</TableHead>
                        <TableHead className="min-w-[100px]">Status</TableHead>
                        <TableHead className="min-w-[140px]">Type</TableHead>
                        <TableHead className="min-w-[90px]">Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTableAssets.map((a) => {
                        const checked = selectedAssetIds.includes(a.id)
                        const reassign =
                          a.parentAssemblyAssetId && a.parentAssemblyAssetId !== assembly.id
                        return (
                          <TableRow
                            key={a.id}
                            className={cn(
                              "cursor-pointer",
                              reassign && "bg-amber-500/5"
                            )}
                            onClick={() => toggleAsset(a.id, !checked)}
                          >
                            <TableCell
                              className="w-10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) => toggleAsset(a.id, !!c)}
                                aria-label={`Select ${a.name}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {a.name}
                              {reassign ? (
                                <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">
                                  (reassign)
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {a.code}
                            </TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "inline-flex max-w-[10rem] truncate px-2 py-0.5 text-xs font-medium",
                                  STATUS_COLORS[a.statusColor]
                                )}
                              >
                                {a.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[12rem] truncate">
                              {a.type}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {a.lastModified}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 border-t bg-muted/20 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">
                {selectedAssetIds.length}
              </span>{" "}
              {selectedAssetIds.length === 1 ? "item" : "items"} selected
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-orange-500 hover:bg-orange-600"
                disabled={selectedAssetIds.length === 0}
                onClick={handleLinkNext}
              >
                Next
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FieldGrid({ fields }: { fields: DetailField[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
      {fields.map((f) => (
        <div key={f.label} className="space-y-1">
          <p className="text-xs text-muted-foreground">{f.label}</p>
          <p className="text-sm text-foreground font-medium leading-snug">{f.value}</p>
        </div>
      ))}
    </div>
  )
}

interface AssetDetailPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: Asset | null
  templateName: string
  /** Current template id — used to load the asset type hierarchy from settings. */
  templateId: string
  templateAssets: Asset[]
  onUpdateAsset: (id: string, patch: Partial<Asset>) => void
}

export function AssetDetailPanel({
  open,
  onOpenChange,
  asset,
  templateName,
  templateId,
  templateAssets,
  onUpdateAsset,
}: AssetDetailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "w-full sm:max-w-[min(960px,55vw)] p-0 gap-0 flex flex-col h-full border-l shadow-xl overflow-hidden"
        )}
      >
        {asset && (
          <AssetDetailBody
            asset={asset}
            templateName={templateName}
            templateId={templateId}
            templateAssets={templateAssets}
            onUpdateAsset={onUpdateAsset}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function AssetDetailBody({
  asset,
  templateName,
  templateId,
  templateAssets,
  onUpdateAsset,
}: {
  asset: Asset
  templateName: string
  templateId: string
  templateAssets: Asset[]
  onUpdateAsset: (id: string, patch: Partial<Asset>) => void
}) {
  const detail = buildAssetDetailView(asset, templateAssets)
  const related = getRelatedAssets(asset, templateAssets)

  const assetTypes = TEMPLATE_ASSET_TYPES[templateId] ?? []
  const catalogTypeForAsset = useMemo(
    () => assetTypes.find((t) => t.name === asset.type),
    [assetTypes, asset.type]
  )
  const assemblyAncestor = useMemo(() => {
    if (!catalogTypeForAsset) return null
    return nearestAssemblyAncestor(assetTypes, catalogTypeForAsset.id)
  }, [assetTypes, catalogTypeForAsset])

  const requiresParentAssemblyLink =
    !asset.isAssembly &&
    !!catalogTypeForAsset &&
    typeRequiresParentAssemblyField(assetTypes, catalogTypeForAsset.id)

  const linkedParentAsset = useMemo(
    () =>
      asset.parentAssemblyAssetId
        ? templateAssets.find((a) => a.id === asset.parentAssemblyAssetId)
        : undefined,
    [asset.parentAssemblyAssetId, templateAssets]
  )

  const parentAssemblyCandidates = useMemo(() => {
    if (!assemblyAncestor) return []
    const all = templateAssets.filter(
      (a) =>
        a.id !== asset.id &&
        a.isAssembly === true &&
        a.type === assemblyAncestor.name
    )
    const sameProject = all.filter((a) => a.project === asset.project)
    const base = sameProject.length > 0 ? sameProject : all
    if (asset.parentAssemblyAssetId) {
      const current = templateAssets.find((a) => a.id === asset.parentAssemblyAssetId)
      if (current && !base.some((b) => b.id === current.id)) {
        return [current, ...base]
      }
    }
    return base
  }, [assemblyAncestor, templateAssets, asset.id, asset.project, asset.parentAssemblyAssetId])

  const showParentAssemblySection =
    !asset.isAssembly && (requiresParentAssemblyLink || !!linkedParentAsset)

  const windAssemblySite =
    templateId === "template-windfarm" && asset.isAssembly
      ? getWindAssemblySiteFromCanonicalList(asset.id, templateAssets, asset.project)
      : undefined

  const tabDefs: [string, string][] = [
    ["information", "Information"],
    ...(asset.isAssembly ? [["components", "Components"]] as [string, string][] : []),
    ["related", "Related Items"],
    ["attachments", "Attachments"],
    ["history", "Change History"],
  ]

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="shrink-0 border-b px-6 pt-4 pb-0 pr-14">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 space-y-2">
            <h2 className="text-lg font-semibold text-foreground leading-tight">{asset.name}</h2>
            <span
              className={cn(
                "inline-flex px-2.5 py-0.5 rounded text-xs font-medium border",
                STATUS_COLORS[asset.statusColor]
              )}
            >
              {asset.status}
            </span>
          </div>
          <Button
            type="button"
            className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white gap-2"
            onClick={() => {}}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>

        <Tabs key={asset.id} defaultValue="information" className="w-full flex flex-col flex-1 min-h-0">
          <TabsList className="bg-transparent border-b rounded-none w-full justify-start h-auto p-0 gap-0 mb-0 flex-wrap">
            {tabDefs.map(([id, label]) => (
              <TabsTrigger
                key={id}
                value={id}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:shadow-none bg-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent
            value="information"
            className="mt-0 flex-1 overflow-y-auto outline-none"
          >
            <div className="px-6 py-6 space-y-6 bg-muted/30 min-h-[50vh]">
              <div className="rounded-lg border bg-card p-5 shadow-sm">
                <h3 className="text-base font-semibold mb-4">General Information</h3>
                <div className="flex flex-col sm:flex-row gap-6">
                  <div className="shrink-0">
                    <div className="w-32 h-32 rounded-md border-2 border-dashed border-muted-foreground/25 bg-muted/50 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <ImageIcon className="h-10 w-10 opacity-50" />
                      <span className="text-[10px] px-2 text-center">Photo</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Project</p>
                        <p className="text-sm font-medium">{asset.project}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Type</p>
                        <p className="text-sm font-medium">{asset.type}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Trade</p>
                        <p className="text-sm font-medium">{detail.trade}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="text-sm font-medium">{asset.name}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Code</p>
                        <p className="text-sm font-medium font-mono">{asset.code}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Status</p>
                        <p className="text-sm font-medium">{asset.status}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Template</p>
                        <p className="text-sm font-medium">{templateName}</p>
                      </div>
                    </div>
                    {windAssemblySite ||
                    (typeof asset.latitude === "number" &&
                      typeof asset.longitude === "number") ? (
                      <div className="rounded-md border bg-muted/40 p-4 space-y-2 mt-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Site location (map)
                        </p>
                        {windAssemblySite ? (
                          <>
                            <p className="text-sm font-medium text-foreground">
                              {windAssemblySite.label}
                            </p>
                            <p className="text-sm font-mono tabular-nums">
                              {windAssemblySite.lat.toFixed(5)}, {windAssemblySite.lng.toFixed(5)}
                              <span className="text-muted-foreground font-sans text-xs ml-2">
                                WGS84
                              </span>
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Canonical turbine site — same 30 WGS84 positions as map pins (sorted
                              assembly order).
                            </p>
                          </>
                        ) : (
                          <>
                            {asset.mapPositionLabel ? (
                              <p className="text-sm font-medium text-foreground">
                                {asset.mapPositionLabel}
                              </p>
                            ) : null}
                            <p className="text-sm font-mono tabular-nums">
                              {asset.latitude!.toFixed(5)}, {asset.longitude!.toFixed(5)}
                              <span className="text-muted-foreground font-sans text-xs ml-2">
                                WGS84
                              </span>
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Stored coordinates — satellite map pins use this position.
                            </p>
                          </>
                        )}
                      </div>
                    ) : null}
                    {showParentAssemblySection && (
                      <div className="pt-4 border-t space-y-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">
                            {assemblyAncestor
                              ? parentAssemblyFieldLabel(assemblyAncestor)
                              : "Parent assembly asset"}
                          </Label>
                          {assemblyAncestor ? (
                            <p className="text-[11px] text-muted-foreground leading-snug">
                              Link this component to a{" "}
                              <span className="font-medium text-foreground">
                                {assemblyAncestor.name}
                              </span>{" "}
                              instance from the register (same template hierarchy as Asset Settings).
                            </p>
                          ) : null}
                        </div>
                        {assemblyAncestor ? (
                          <>
                            <Select
                              value={asset.parentAssemblyAssetId ?? "__none__"}
                              onValueChange={(v) =>
                                onUpdateAsset(asset.id, {
                                  parentAssemblyAssetId: v === "__none__" ? undefined : v,
                                })
                              }
                            >
                              <SelectTrigger className="w-full max-w-lg h-10">
                                <SelectValue placeholder="Select parent assembly…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None (unlinked)</SelectItem>
                                {parentAssemblyCandidates.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    <span className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                                      <span>{p.name}</span>
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {p.code}
                                      </span>
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {parentAssemblyCandidates.length === 0 ? (
                              <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-md px-3 py-2">
                                No {assemblyAncestor.name} assembly exists in this register. Create a
                                turbine (assembly) asset first, then link it here.
                              </p>
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled={!asset.parentAssemblyAssetId}
                              onClick={() =>
                                onUpdateAsset(asset.id, { parentAssemblyAssetId: undefined })
                              }
                            >
                              <Unlink className="h-3.5 w-3.5" />
                              Remove link
                            </Button>
                          </>
                        ) : linkedParentAsset ? (
                          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                            <p className="text-sm font-medium">{linkedParentAsset.name}</p>
                            <p className="text-xs font-mono text-muted-foreground">
                              {linkedParentAsset.code}
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() =>
                                onUpdateAsset(asset.id, { parentAssemblyAssetId: undefined })
                              }
                            >
                              <Unlink className="h-3.5 w-3.5" />
                              Remove link
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                    <div className="space-y-1 pt-2">
                      <p className="text-xs text-muted-foreground">Description</p>
                      <p className="text-sm text-foreground leading-relaxed">{detail.description}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5 shadow-sm">
                <h3 className="text-base font-semibold mb-4">Specification Details</h3>
                <FieldGrid fields={detail.specification} />
              </div>

              <div className="rounded-lg border bg-card p-5 shadow-sm">
                <h3 className="text-base font-semibold mb-4">Maintenance Details</h3>
                <FieldGrid fields={detail.maintenance} />
              </div>
            </div>
          </TabsContent>

          {asset.isAssembly && (
            <TabsContent
              value="components"
              className="mt-0 flex-1 overflow-y-auto outline-none"
            >
              <AssemblyComponentsTab
                assembly={asset}
                templateId={templateId}
                templateAssets={templateAssets}
                onUpdateAsset={onUpdateAsset}
              />
            </TabsContent>
          )}

          <TabsContent
            value="related"
            className="mt-0 flex-1 overflow-y-auto outline-none"
          >
            <div className="px-6 py-6 bg-muted/30 min-h-[50vh]">
              <div className="rounded-lg border bg-card p-5 shadow-sm">
                <h3 className="text-base font-semibold mb-3">Related Items</h3>
                {related.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No related items found for this asset. Related components (e.g. blades under a
                    turbine) appear here when applicable.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {related.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-4 py-2 border-b last:border-0"
                      >
                        <div>
                          <p className="text-sm font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{r.code}</p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {r.type}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="attachments"
            className="mt-0 flex-1 overflow-y-auto outline-none"
          >
            <div className="px-6 py-12 text-center text-sm text-muted-foreground bg-muted/30 min-h-[40vh]">
              No attachments yet. Upload manuals, photos, and certificates here.
            </div>
          </TabsContent>

          <TabsContent
            value="history"
            className="mt-0 flex-1 overflow-y-auto outline-none"
          >
            <div className="px-6 py-12 text-center text-sm text-muted-foreground bg-muted/30 min-h-[40vh]">
              Change history will list edits, status changes, and field updates.
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
