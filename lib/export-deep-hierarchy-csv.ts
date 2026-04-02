/**
 * Export asset hierarchy + fieldsets to **Asset_Classification_Deep_Hierarchy**-style CSV:
 * dynamic Division / Subdivision Number+Title pairs (depth = max ancestor levels in export),
 * then Asset Type, Asset Type Code, Section Name, Custom Field Name, Custom Field Type.
 */

import type { AssetType, FieldsetData } from "@/app/page"

export interface CustomFieldMappingLike {
  importedName: string
  fieldType: string
}

const NA = "NA"

const TAIL_COLUMNS = [
  "Asset Type",
  "Asset Type Code",
  "Section Name",
  "Custom Field Name",
  "Custom Field Type",
] as const

/** Labels for one hierarchy level: index 0 = Division, 1 = Subdivision, 2+ = Subdivision 2… */
export function hierarchyPairColumnHeaders(pairCount: number): string[] {
  if (pairCount < 1) pairCount = 1
  const cols: string[] = []
  for (let i = 0; i < pairCount; i++) {
    if (i === 0) {
      cols.push("Division Number", "Division Title")
    } else if (i === 1) {
      cols.push("Subdivision Number", "Subdivision Title")
    } else {
      cols.push(`Subdivision ${i} Number`, `Subdivision ${i} Title`)
    }
  }
  return cols
}

/** RFC 4180-style CSV cell (quote if needed). */
export function escapeCsvCell(value: string): string {
  const s = value ?? ""
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function getPathToRoot(all: AssetType[], asset: AssetType): AssetType[] {
  const byId = new Map(all.map((a) => [a.id, a]))
  const path: AssetType[] = []
  let cur: AssetType | undefined = asset
  while (cur) {
    path.unshift(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return path
}

/**
 * Map app Custom Field Mapping types to typical deep-hierarchy CSV tokens
 * (aligned with common Procore / dictionary exports).
 */
export function appFieldTypeToDeepHierarchyCsvType(appType: string): string {
  const t = appType.trim().toLowerCase()
  if (t === "plain text (short)" || t === "plain text (long)") return "string"
  if (t === "number") return "number"
  if (t === "date") return "date"
  if (t === "single select (dropdown)") return "pull down"
  if (t === "multi select") return "pull down"
  if (t === "checkbox") return "string"
  if (t === "company") return "string"
  if (t === "url") return "string"
  return "string"
}

function resolveFieldTypeForExport(
  fieldName: string,
  mappings: CustomFieldMappingLike[] | undefined
): string {
  const norm = fieldName.trim().toLowerCase()
  const m = mappings?.find(
    (x) =>
      x.importedName === fieldName ||
      x.importedName.trim().toLowerCase() === norm
  )
  if (m?.fieldType) {
    return appFieldTypeToDeepHierarchyCsvType(m.fieldType)
  }
  return "string"
}

/**
 * Build `pairCount` × 2 cells: hierarchy Number/Title pairs; pad with NA when shallower.
 */
function buildHierarchyPairs(
  leaf: AssetType,
  ancestors: AssetType[],
  pairCount: number
): string[] {
  const segs = leaf.code.split("-").filter((s) => s.length > 0)
  const out: string[] = []

  for (let i = 0; i < pairCount; i++) {
    if (ancestors.length === 0) {
      if (i === 0) {
        out.push(escapeCsvCell(segs[0] ?? leaf.code))
        out.push(escapeCsvCell(leaf.name))
      } else {
        out.push(NA, NA)
      }
      continue
    }
    if (i < ancestors.length) {
      const a = ancestors[i]!
      const num = segs[i] ?? a.code.split("-").filter(Boolean).pop() ?? NA
      out.push(escapeCsvCell(num || NA))
      out.push(escapeCsvCell(a.name || NA))
    } else {
      out.push(NA, NA)
    }
  }

  return out
}

/** Max hierarchy levels (pairs) needed among assets that have exportable fieldset rows. */
export function computeMaxHierarchyPairCount(
  assetTypes: AssetType[],
  fieldsets: Record<string, FieldsetData>
): number {
  let max = 1
  for (const asset of assetTypes) {
    const fs = fieldsets[asset.fieldset]
    if (!fs?.sections?.length) continue
    const path = getPathToRoot(assetTypes, asset)
    const ancestors = path.length > 1 ? path.slice(0, -1) : []
    const depth = ancestors.length === 0 ? 1 : ancestors.length
    max = Math.max(max, depth)
  }
  return max
}

export interface BuildDeepHierarchyCsvOptions {
  assetTypes: AssetType[]
  fieldsets: Record<string, FieldsetData>
  /** Optional: improves Custom Field Type column from the mapping tab. */
  customFieldMappings?: CustomFieldMappingLike[]
}

/**
 * One row per (asset type × section × field). Omits types with no fieldset data.
 */
export function buildDeepHierarchyClassificationCsv(options: BuildDeepHierarchyCsvOptions): string {
  const { assetTypes, fieldsets, customFieldMappings } = options
  const pairCount = computeMaxHierarchyPairCount(assetTypes, fieldsets)
  const headerRow = [...hierarchyPairColumnHeaders(pairCount), ...TAIL_COLUMNS].join(",")

  const lines: string[] = [headerRow]

  for (const asset of assetTypes) {
    const fs = fieldsets[asset.fieldset]
    if (!fs?.sections?.length) continue

    const path = getPathToRoot(assetTypes, asset)
    const ancestors = path.length > 1 ? path.slice(0, -1) : []
    const leaf = path[path.length - 1] ?? asset

    const hierarchyCells = buildHierarchyPairs(leaf, ancestors, pairCount)

    for (const section of fs.sections) {
      const sectionName = section.name?.trim() || "General"
      for (const fieldName of section.fields) {
        if (!fieldName?.trim()) continue
        const fieldType = resolveFieldTypeForExport(fieldName, customFieldMappings)
        const row = [
          ...hierarchyCells,
          escapeCsvCell(leaf.name),
          escapeCsvCell(leaf.code),
          escapeCsvCell(sectionName),
          escapeCsvCell(fieldName.trim()),
          escapeCsvCell(fieldType),
        ].join(",")
        lines.push(row)
      }
    }
  }

  return "\uFEFF" + lines.join("\r\n")
}
