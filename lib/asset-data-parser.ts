import {
  filterImportedCustomFieldNames,
  isCsvCustomFieldTypeTokenName,
} from '@/lib/map-imported-custom-field-type'

/**
 * Asset Data Parser
 *
 * Intelligently parses uploaded data (CSV, TSV, TXT, JSON) into:
 * 1. Asset Type Hierarchy — sections / sub-sections / deeper levels (variable depth per row)
 * 2. Fieldsets — all attribute columns for a given structure bundled as one fieldset per leaf
 *
 * Supports formats:
 * - Tab-separated values (TSV) with columns: System Category, Asset Type, Asset Subtype, Metadata
 * - Comma-separated values (CSV)
 * - Flexible hierarchy tables: any depth of section columns + attribute columns (see asset-config skill)
 * - Indented text with bullets (•, ○, -, *)
 * - JSON arrays or objects
 *
 * Empty level placeholders (NA, N/A, none, not available, —, etc.) skip that level for that row.
 * Deep-hierarchy Number/Title pairs: if **Title** is NA/ghost, **skip the entire tier** — do not use Number
 * alone as a folder (avoids spurious `10-NA` nodes). Asset Type/Code rows that are NA-only are skipped.
 */

export interface ParsedHierarchyItem {
  code: string
  name: string
  description: string
  level: number
  children: ParsedHierarchyItem[]
  parentCode?: string
  fieldsetCode?: string
  /** Fields shown at parent (intersection of all descendant leaf fields). Parent fields are available in child nodes. */
  commonFields?: string[]
}

export interface ParsedFieldset {
  code: string
  name: string
  /** Leaf-only fields (per asset-config skill: do not repeat parent fields). */
  fields: string[]
  /** Root-level fields inherited by this fieldset (cascading). */
  inheritedFields?: string[]
  /** Grouped by Section Name (deep hierarchy long format). */
  sections?: { name: string; fields: string[] }[]
  /** Custom Field Name → Custom Field Type (raw) from CSV when present. */
  importedFieldTypes?: Record<string, string>
}

export interface ParseResult {
  hierarchy: ParsedHierarchyItem[]
  fieldsets: ParsedFieldset[]
  stats: {
    totalItems: number
    totalFieldsets: number
    totalFields: number
    format: 'table' | 'flexible-table' | 'deep-hierarchy-long' | 'text' | 'json' | 'unknown'
  }
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/**
 * Split a packed custom-field cell on commas **not** inside parentheses.
 * Trims tokens and strips a trailing period on each field name.
 */
export function splitPackedCustomFields(cell: string): string[] {
  const s = cell.trim()
  if (!s) return []
  let depth = 0
  let start = 0
  const out: string[] = []
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if ((ch === ',' || ch === ';') && depth === 0) {
      const part = s.slice(start, i).trim().replace(/\.$/, '').trim()
      if (part) out.push(part)
      start = i + 1
    }
  }
  const last = s.slice(start).trim().replace(/\.$/, '').trim()
  if (last) out.push(last)
  return out
}

/**
 * Main entry point - parses any text content into hierarchy and fieldsets
 */
export function parseAssetData(content: string): ParseResult {
  const trimmed = stripBom(content.trim())
  if (!trimmed) {
    return emptyResult('unknown')
  }

  const format = detectFormat(trimmed)

  let result: ParseResult
  switch (format) {
    case 'deep-hierarchy-long':
      result = parseDeepHierarchyLongFormat(trimmed)
      break
    case 'wide-table':
      result = parseWideTableFormat(trimmed)
      break
    case 'flexible-table':
      result = parseVariableDepthHierarchyTable(trimmed)
      break
    case 'table':
      result = parseTableFormat(trimmed)
      break
    case 'json':
      result = parseJsonFormat(trimmed)
      break
    case 'text':
      result = parseTextFormat(trimmed)
      break
    default:
      return emptyResult('unknown')
  }

  finalizeParseResult(result)
  return result
}

/**
 * After hierarchy + fieldsets are built: remove from each node's fieldset any field
 * that already appears on an ancestor's commonFields (normalized). Ensures parent
 * fields cascade into children without duplicate "New to this type" entries.
 */
function syncParsedFieldsetFieldsFromSections(fs: ParsedFieldset): void {
  if (fs.sections?.length) {
    fs.fields = fs.sections.flatMap((s) => s.fields)
  }
}

/** Keep importedFieldTypes keys aligned with remaining `fields` names. */
function pruneImportedFieldTypesOnFieldset(fs: ParsedFieldset): void {
  if (!fs.importedFieldTypes) return
  const allowed = new Set(fs.fields)
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries(fs.importedFieldTypes)) {
    if (allowed.has(k) && !isCsvCustomFieldTypeTokenName(k)) next[k] = v
  }
  fs.importedFieldTypes = Object.keys(next).length > 0 ? next : undefined
}

/**
 * After inheritance/dedupe: strip CSV **type** tokens that were mis-classified as field names
 * (e.g. `string`, `date`) from fieldsets and hierarchy `commonFields`.
 */
function sanitizeImportedFieldNamesInParseResult(result: ParseResult): void {
  const clean = filterImportedCustomFieldNames
  for (const fs of result.fieldsets) {
    fs.fields = clean(fs.fields)
    if (fs.inheritedFields?.length) {
      fs.inheritedFields = clean(fs.inheritedFields)
    }
    if (fs.sections?.length) {
      for (const sec of fs.sections) {
        sec.fields = clean(sec.fields)
      }
      syncParsedFieldsetFieldsFromSections(fs)
    }
    if (fs.importedFieldTypes) {
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(fs.importedFieldTypes)) {
        if (!isCsvCustomFieldTypeTokenName(k)) next[k] = v
      }
      fs.importedFieldTypes = Object.keys(next).length > 0 ? next : undefined
    }
    pruneImportedFieldTypesOnFieldset(fs)
  }

  function walkCommonFields(nodes: ParsedHierarchyItem[]) {
    for (const n of nodes) {
      if (n.commonFields?.length) {
        const cf = clean(n.commonFields)
        if (cf.length > 0) n.commonFields = cf
        else delete n.commonFields
      }
      if (n.children.length) walkCommonFields(n.children)
    }
  }
  walkCommonFields(result.hierarchy)
}

function finalizeParseResult(result: ParseResult): void {
  if (result.hierarchy.length === 0) return
  dedupeCascadeFieldsFromDescendants(result.hierarchy, result.fieldsets)
  sanitizeImportedFieldNamesInParseResult(result)
  result.stats.totalFields = result.fieldsets.reduce(
    (sum, fs) => sum + fs.fields.length + (fs.inheritedFields?.length ?? 0),
    0
  )
}

function normalizeFieldName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Walk tree with ancestor field set (from parent commonFields). Strip from each
 * leaf fieldset any field whose normalized name matches an ancestor — so e.g.
 * "Supply Air Flow" on Air Handling does not repeat under AHU / RU / FCU.
 */
function dedupeCascadeFieldsFromDescendants(
  hierarchy: ParsedHierarchyItem[],
  fieldsets: ParsedFieldset[]
): void {
  const byCode = new Map(fieldsets.map((fs) => [fs.code, fs]))

  function walk(nodes: ParsedHierarchyItem[], ancestorNormSet: Set<string>) {
    for (const node of nodes) {
      const nextAncestor = new Set(ancestorNormSet)
      if (node.commonFields?.length) {
        for (const f of node.commonFields) nextAncestor.add(normalizeFieldName(f))
      }
      if (node.fieldsetCode) {
        const fs = byCode.get(node.fieldsetCode)
        if (fs) {
          fs.fields = fs.fields.filter((f) => !nextAncestor.has(normalizeFieldName(f)))
          if (fs.inheritedFields?.length) {
            fs.inheritedFields = fs.inheritedFields.filter(
              (f) => !nextAncestor.has(normalizeFieldName(f))
            )
          }
          if (fs.sections?.length) {
            fs.sections = fs.sections
              .map((sec) => ({
                ...sec,
                fields: sec.fields.filter((f) => !nextAncestor.has(normalizeFieldName(f))),
              }))
              .filter((sec) => sec.fields.length > 0)
            if (fs.sections.length === 0) fs.sections = undefined
            syncParsedFieldsetFieldsFromSections(fs)
          }
          pruneImportedFieldTypesOnFieldset(fs)
        }
      }
      if (node.children.length) walk(node.children, nextAncestor)
    }
  }

  walk(hierarchy, new Set())
}

function emptyResult(format: ParseResult['stats']['format']): ParseResult {
  return {
    hierarchy: [],
    fieldsets: [],
    stats: { totalItems: 0, totalFieldsets: 0, totalFields: 0, format }
  }
}

/** Matches common spreadsheet placeholders meaning “no category at this level”. */
const EMPTY_LEVEL_PATTERN =
  /^(n\/a|n\/\s*a|na|none|not\s*available|not\s*applicable|—|–|-\s*|\.\.\.|null|undefined|no\s*data|tbd|\?|n\/\s*a\.?)$/i

/** Trim and strip surrounding quotes / smart quotes (Excel exports often wrap cells). */
export function normalizeHierarchyCell(raw: string): string {
  return raw.replace(/^[\s"'“”‘’\u00a0]+|[\s"'“”‘’\u00a0]+$/g, "").trim()
}

/** True when this cell should not create a node at this hierarchy level (asset-config skill). */
export function isEmptyLevelValue(raw: string): boolean {
  const s = normalizeHierarchyCell(raw)
  if (!s) return true
  return EMPTY_LEVEL_PATTERN.test(s)
}

/**
 * Remove placeholder tokens (NA, N/A, etc.) from hyphenated hierarchy / asset type codes.
 * Previews and imports no longer show `10-NA-10-RAD` when `NA` was padding in the source file.
 */
export function collapseGhostSegmentsInHyphenatedCode(code: string): string {
  const s = normalizeHierarchyCell(code)
  if (!s) return ""
  const parts = s.split("-").map((p) => normalizeHierarchyCell(p)).filter((p) => p && !isEmptyLevelValue(p))
  return parts.join("-")
}

/**
 * Drop empty / NA-like cells in left-to-right hierarchy columns so `A,,,B` becomes `[A,B]`
 * (same semantics as NA padding — level not applicable). Used by wide / generic table parsers.
 */
export function compressHierarchyColumnValues(values: string[]): string[] {
  return values.map(normalizeHierarchyCell).filter((v) => v && !isEmptyLevelValue(v))
}

function isHierarchyColumnHeader(h: string): boolean {
  const x = h.toLowerCase().trim()
  if (!x) return false
  // Explicit attribute-only headers (not structure)
  if (
    /^(attribute|field\s*name|parameter\s*name|metadata|custom\s*field\s*\d*)$/i.test(x) ||
    (/^field\s*\d+$/i.test(x) && !/category|type/.test(x))
  ) {
    return false
  }
  return /\b(section|subsection|sub-?section|division|sub-?division|category|sub-?category|group|sub-?group|class|family|level\s*\d|tier|hierarchy|system|discipline|asset\s*type|subtype|sub-?type|equipment|area)\b/.test(
    x
  )
}

function isAttributeColumnHeader(h: string): boolean {
  const x = h.toLowerCase().trim()
  return (
    /\b(attribute|field|parameter|metadata|custom\s*fields?|property|value|unit|notes|description|spec)\b/.test(
      x
    ) ||
    /^field\s*\d+$/i.test(x) ||
    /^attr(ribute)?\s*\d+$/i.test(x) ||
    /^custom\s*fields?/i.test(x)
  )
}

/**
 * Split header row into: structure columns (section / subsection / …) vs attribute columns.
 * Attribute columns are bundled into one fieldset per leaf (same structure).
 */
export function splitHierarchyAndAttributeColumns(headers: string[]): {
  hierarchyIndices: number[]
  attributeIndices: number[]
} {
  const n = headers.length
  if (n === 0) return { hierarchyIndices: [], attributeIndices: [] }

  let cut = -1
  for (let j = 0; j < n; j++) {
    const h = headers[j]?.trim() ?? ''
    if (isAttributeColumnHeader(h) && !isHierarchyColumnHeader(h)) {
      cut = j
      break
    }
  }

  if (cut <= 0) {
    if (n >= 4) {
      const hierLen = Math.min(3, n - 1)
      return {
        hierarchyIndices: Array.from({ length: hierLen }, (_, k) => k),
        attributeIndices: Array.from({ length: n - hierLen }, (_, k) => k + hierLen),
      }
    }
    if (n === 3) {
      return { hierarchyIndices: [0, 1], attributeIndices: [2] }
    }
    if (n === 2) {
      return { hierarchyIndices: [0], attributeIndices: [1] }
    }
    return { hierarchyIndices: [0], attributeIndices: [] }
  }

  return {
    hierarchyIndices: Array.from({ length: cut }, (_, k) => k),
    attributeIndices: Array.from({ length: n - cut }, (_, k) => k + cut),
  }
}

function pathCodeForSegments(segments: string[], depth: number): string {
  const parts = segments
    .slice(0, depth + 1)
    .map((s) => normalizeHierarchyCell(s))
    .filter((s) => s && !isEmptyLevelValue(s))
    .map((s) => generateCode(s))
    .filter((g) => g.length > 0 && !isEmptyLevelValue(g))
  if (parts.length === 0) return "H"
  return collapseGhostSegmentsInHyphenatedCode(parts.join("-")).slice(0, 48) || "H"
}

/**
 * Variable-depth hierarchy: each row defines a path through section columns; empty/NA cells skip
 * levels. All attribute column headers become one fieldset for the leaf (deepest node on path).
 */
function parseVariableDepthHierarchyTable(content: string): ParseResult {
  const lines = content.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return emptyResult('table')

  const delimiter = detectDelimiter(content)
  const splitRow = (line: string) =>
    delimiter === ',' ? parseCSVLine(line) : line.split(delimiter).map((c) => c.trim())

  const headerRow = splitRow(lines[0]!)
  const { hierarchyIndices, attributeIndices } = splitHierarchyAndAttributeColumns(headersTrim(headerRow))

  const attributeHeaders = filterImportedCustomFieldNames(
    attributeIndices.map((i) => headerRow[i]?.trim() ?? '').filter(Boolean)
  )

  const findOrCreateChild = (
    siblings: ParsedHierarchyItem[],
    name: string,
    code: string,
    level: number,
    parentCode: string | undefined
  ): ParsedHierarchyItem => {
    let node = siblings.find((n) => n.code === code || (n.name === name && n.level === level))
    if (!node) {
      node = {
        code,
        name,
        description: '',
        level,
        children: [],
        parentCode,
      }
      siblings.push(node)
    }
    return node
  }

  const globalRoots: ParsedHierarchyItem[] = []
  const fieldsetMap = new Map<string, ParsedFieldset>()

  for (let r = 1; r < lines.length; r++) {
    const cols = splitRow(lines[r]!.trim())
    if (cols.length < Math.max(1, hierarchyIndices[hierarchyIndices.length - 1] ?? 0) + 1) continue

    const segments: string[] = []
    for (const hi of hierarchyIndices) {
      const cell = cols[hi] ?? ""
      const norm = normalizeHierarchyCell(cell)
      if (isEmptyLevelValue(norm)) continue
      segments.push(norm)
    }
    if (segments.length === 0) continue

    let parentCode: string | undefined
    let siblings = globalRoots
    for (let d = 0; d < segments.length; d++) {
      const name = segments[d]!
      const code = pathCodeForSegments(segments, d)
      const level = d
      const node = findOrCreateChild(siblings, name, code, level, parentCode)
      parentCode = node.code
      siblings = node.children
      if (d === segments.length - 1) {
        node.fieldsetCode = code
        const prev = fieldsetMap.get(code)
        const fields = attributeHeaders.length > 0 ? [...attributeHeaders] : []
        if (!prev) {
          fieldsetMap.set(code, {
            code,
            name,
            fields: [...fields],
          })
        } else {
          const merged = new Set([...prev.fields, ...fields])
          prev.fields = Array.from(merged)
        }
      }
    }
  }

  let fieldsets = Array.from(fieldsetMap.values())
  fieldsets = applyFieldsetInheritance(globalRoots, fieldsets)
  attachCommonFieldsToParents(globalRoots, fieldsets)

  return {
    hierarchy: globalRoots,
    fieldsets,
    stats: {
      totalItems: countItems(globalRoots),
      totalFieldsets: fieldsets.length,
      totalFields: fieldsets.reduce(
        (sum, fs) => sum + fs.fields.length + (fs.inheritedFields?.length ?? 0),
        0
      ),
      format: 'flexible-table',
    },
  }
}

function headersTrim(row: string[]): string[] {
  return row.map((c) => c.trim())
}

/** Column-based schema (e.g. CMMS/Excel: Division, Subdivision, Asset Type Code, Custom Fields) */
const WIDE_TABLE_HEADERS = [
  'division number', 'division title', 'subdivision number', 'subdivision title',
  'subdivision 2 number', 'subdivision 2 title', 'asset type', 'asset type code',
  'custom field'
]

function shouldUseFlexibleHierarchyTable(lines: string[], delimiter: string): boolean {
  if (lines.length < 2) return false
  const splitRow = (line: string) =>
    delimiter === ',' ? parseCSVLine(line) : line.split(delimiter).map((c) => c.trim())
  const header = splitRow(lines[0]!)
  if (header.length < 3) return false
  /** Classic 4-column “System Category | Asset Type | Asset Subtype | Custom Fields” uses table parser + packed cells. */
  if (looksLikeFourColumnAssetDictionaryHeader(header)) return false
  const lower = header.map((c) => c.toLowerCase())
  const hasHierarchyKeyword = lower.some((h) =>
    /\b(section|subsection|division|subdivision|category|system|discipline|group|class|area)\b/.test(h)
  )
  const hasAttr = lower.some((h) => isAttributeColumnHeader(h))
  /** Prefer variable-depth parser when structure/attribute columns are explicit or sheet is wide. */
  return header.length >= 5 || hasHierarchyKeyword || (hasAttr && header.length >= 4)
}

/**
 * Commercial / CMMS-style dictionary: exactly four columns — three hierarchy tiers +
 * one column of comma-separated custom field names (often RFC4180-quoted).
 */
function looksLikeFourColumnAssetDictionaryHeader(headers: string[]): boolean {
  if (headers.length !== 4) return false
  const [h0, h1, h2, h3] = headers.map((h) => h.trim().toLowerCase())
  const col0Ok =
    /\bsystem\s+category\b/.test(h0) ||
    (/\bcategory\b/.test(h0) && /\b(system|building|discipline|division|group)\b/.test(h0))
  const col1Ok = /\basset\s+type\b/.test(h1) && !/\bsub/.test(h1)
  const col2Ok = /\bsubtype\b/.test(h2) || /\bsub\s*-?\s*type\b/.test(h2)
  const col3Ok =
    /\bcustom\s*fields?\b/.test(h3) ||
    /\bmetadata\s*(fields?)?\b/.test(h3) ||
    /\btechnical\s*(metadata|attributes?|fields?)?\b/.test(h3) ||
    h3 === 'attributes' ||
    h3 === 'technical metadata'
  return col0Ok && col1Ok && col2Ok && col3Ok
}

/**
 * Standard CMMS template: one or more Division / Subdivision (×N pairs) / Asset Type / Asset Type Code,
 * then long-format rows with Section Name + Custom Field Name (+ type). Column count is **not** fixed:
 * depth = (index of Asset Type column) / 2. See asset-config skill.
 */
function looksLikeDeepHierarchyClassificationHeader(headers: string[]): boolean {
  if (headers.length < 5) return false
  const lower = headers.map((h) => h.trim().toLowerCase())
  const hasDivisionNum = lower.some((h) => h.includes('division') && h.includes('number'))
  const hasAssetType = lower.some((h) => /\basset\s+type\b/.test(h) && !h.includes('code'))
  const hasAssetTypeCode = lower.some((h) => h.includes('asset type code'))
  const hasCustomFieldName = lower.some(
    (h) => h === 'custom field name' || (h.includes('custom') && h.includes('field name'))
  )
  if (!hasDivisionNum || !hasAssetType || !hasAssetTypeCode || !hasCustomFieldName) return false
  const assetTypeIdx = lower.findIndex((h) => /\basset\s+type\b/.test(h) && !h.includes('code'))
  /** At least one Number+Title pair before Asset Type; deeper files add more pairs. */
  if (assetTypeIdx < 2 || assetTypeIdx % 2 !== 0) return false
  return true
}

function detectFormat(
  content: string
): 'table' | 'wide-table' | 'flexible-table' | 'deep-hierarchy-long' | 'json' | 'text' | 'unknown' {
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length === 0) return 'unknown'

  if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
    try {
      JSON.parse(content)
      return 'json'
    } catch {
      // not valid JSON
    }
  }

  // Route early: comma/TSV files with quoted packed fields must use CSV-aware header + table parser (not flexible-tree).
  const firstLine = lines[0]!
  const tabCt = (firstLine.match(/\t/g) || []).length
  const commaCt = (firstLine.match(/,/g) || []).length
  const headerDelim = tabCt >= commaCt ? '\t' : ','
  const headerCells =
    headerDelim === ','
      ? parseCSVLine(firstLine)
      : firstLine.split('\t').map((c) => c.trim())
  if (looksLikeFourColumnAssetDictionaryHeader(headerCells)) {
    return 'table'
  }
  if (looksLikeDeepHierarchyClassificationHeader(headerCells)) {
    return 'deep-hierarchy-long'
  }

  const delimiter = detectDelimiter(content)
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim().toLowerCase())
    const headerLike = cols.some(c =>
      WIDE_TABLE_HEADERS.some(h => c.includes(h) || (h.length <= 4 && c === h))
    )
    const hasAssetTypeCode = cols.some(c => c.includes('asset type code') || c === 'assettypecode')
    const hasCustomField = cols.some(c => c.includes('custom field'))
    if (headerLike && (hasAssetTypeCode || hasCustomField) && cols.length >= 8) {
      return 'wide-table'
    }
  }

  const sampleLines = lines.slice(0, 10)
  const tabLines = sampleLines.filter(l => l.split('\t').length >= 3)
  const commaLines = sampleLines.filter((l) =>
    (delimiter === ',' ? parseCSVLine(l) : l.split(',')).length >= 3
  )
  const looksTabular =
    tabLines.length >= sampleLines.length * 0.5 || commaLines.length >= sampleLines.length * 0.5
  if (looksTabular && shouldUseFlexibleHierarchyTable(lines, delimiter)) {
    return 'flexible-table'
  }
  if (looksTabular) return 'table'

  return 'text'
}

function detectDelimiter(content: string): string {
  const first = content.split('\n').find(l => l.trim().length > 0) ?? ''
  const tabCount = (first.match(/\t/g) || []).length
  const commaCount = (first.match(/,/g) || []).length
  return tabCount >= commaCount ? '\t' : ','
}

/**
 * Parse a CSV line respecting double-quoted fields (commas inside quotes stay in one field).
 */
function parseCSVLine(line: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1
      while (end < line.length) {
        const next = line.indexOf('"', end)
        if (next === -1) break
        if (line[next + 1] === '"') {
          end = next + 2
          continue
        }
        end = next
        break
      }
      out.push(line.slice(i + 1, end).replace(/""/g, '"').trim())
      i = end + 1
      if (line[i] === ',') i++
      continue
    }
    const nextComma = line.indexOf(',', i)
    if (nextComma === -1) {
      out.push(line.slice(i).trim())
      break
    }
    out.push(line.slice(i, nextComma).trim())
    i = nextComma + 1
  }
  return out
}

/**
 * One deep-hierarchy (Number, Title) pair → path segment.
 * **Title** carries the folder label. **Empty Title** = level not applicable (same as `NA` padding) — skip.
 * Do **not** use Number alone when Title is empty/ghost.
 * **Title** that only repeats the **Number** (e.g. both `12`) is export noise — skip (avoids `12` / `12 12` nodes).
 */
function segmentFromHierarchyPair(num: string, title: string): string | null {
  const n = normalizeHierarchyCell(num)
  const t = normalizeHierarchyCell(title)
  if (!n && !t) return null
  if (isEmptyLevelValue(n) && isEmptyLevelValue(t)) return null
  if (!t || isEmptyLevelValue(t)) return null
  if (n && t && /^[0-9]+$/.test(t) && t === n) return null
  return t
}

/**
 * Standard **deep hierarchy + long-format fields** CSV (e.g. `Asset_Classification_Deep_Hierarchy.csv`):
 * any positive even count of hierarchy columns (Division + Subdivision / Subdivision 2… Number+Title pairs),
 * then Asset Type, Asset Type Code, Section Name, Custom Field Name, Custom Field Type.
 * Groups rows by **Asset Type Code** (canonical, case-insensitive) and merges all custom field names
 * into one fieldset. **One leaf per code** globally — duplicate rows with the same name+code (or same
 * code under a different path) do not create extra nodes; fields accumulate on the single fieldset.
 */
function parseDeepHierarchyLongFormat(content: string): ParseResult {
  const lines = content.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return emptyResult('deep-hierarchy-long')

  const delimiter = detectDelimiter(content)
  const splitRow = (line: string) =>
    delimiter === ',' ? parseCSVLine(line) : line.split(delimiter).map((c) => c.trim())

  const headerRow = splitRow(lines[0]!)
  const lower = headerRow.map((h) => h.trim().toLowerCase())
  const assetTypeIdx = lower.findIndex((h) => /\basset\s+type\b/.test(h) && !h.includes('code'))
  const assetTypeCodeIdx = lower.findIndex((h) => h.includes('asset type code'))
  const customFieldNameIdx = lower.findIndex(
    (h) => h === 'custom field name' || (h.includes('custom') && h.includes('field name'))
  )
  const sectionNameIdx = lower.findIndex((h) => h === 'section name' || /\bsection\s*name\b/.test(h))
  const customFieldTypeIdx = lower.findIndex((h) => {
    const x = h.trim().toLowerCase()
    if (x === 'custom field type') return true
    if (x.includes('custom field') && x.includes('type') && !x.includes('name')) return true
    return false
  })

  if (assetTypeIdx < 2 || assetTypeIdx % 2 !== 0 || assetTypeCodeIdx < 0 || customFieldNameIdx < 0) {
    return emptyResult('deep-hierarchy-long')
  }

  const findOrCreateChild = (
    siblings: ParsedHierarchyItem[],
    name: string,
    code: string,
    level: number,
    parentCode: string | undefined
  ): ParsedHierarchyItem => {
    let node = siblings.find((n) => n.code === code || (n.name === name && n.level === level))
    if (!node) {
      node = {
        code,
        name,
        description: '',
        level,
        children: [],
        parentCode,
      }
      siblings.push(node)
    }
    return node
  }

  const globalRoots: ParsedHierarchyItem[] = []
  /** One hierarchy leaf per canonical asset type code (case-insensitive). */
  const globalLeafByNormCode = new Map<string, ParsedHierarchyItem>()
  /** Stable fieldset / node code string (first-seen casing) per normalized code. */
  const stableAssetCodeByNorm = new Map<string, string>()
  const hasSectionColumn = sectionNameIdx >= 0
  /** When no Section Name column: one set of custom field names per asset type code. */
  const fieldsetFieldSets = new Map<string, Set<string>>()
  /** When Section Name exists: per code → normalized section key → display name + field names. */
  const fieldsetSectionBuckets = new Map<
    string,
    Map<string, { displayName: string; fields: Set<string> }>
  >()
  const fieldsetLeafNames = new Map<string, string>()
  /** Per fieldset code: custom field name → raw Custom Field Type cell value. */
  const fieldsetImportedTypesByCode = new Map<string, Map<string, string>>()

  for (let r = 1; r < lines.length; r++) {
    const row = splitRow(lines[r]!.trim())
    const maxIdx = Math.max(
      assetTypeCodeIdx,
      customFieldNameIdx,
      customFieldTypeIdx >= 0 ? customFieldTypeIdx : 0
    )
    if (row.length <= maxIdx) continue

    const segments: string[] = []
    for (let p = 0; p < assetTypeIdx; p += 2) {
      const num = row[p] ?? ''
      const title = row[p + 1] ?? ''
      const seg = segmentFromHierarchyPair(num, title)
      if (seg !== null) segments.push(seg)
    }

    const assetNameRaw = normalizeHierarchyCell(row[assetTypeIdx] ?? "")
    const assetCodeRaw = normalizeHierarchyCell(row[assetTypeCodeIdx] ?? "")
    const assetCode = collapseGhostSegmentsInHyphenatedCode(assetCodeRaw)
    if (!assetCode || isEmptyLevelValue(assetCode)) continue
    const assetName = !isEmptyLevelValue(assetNameRaw) ? assetNameRaw : assetCode
    if (!assetName) continue

    const fieldRaw = (row[customFieldNameIdx] ?? '').trim()
    if (!fieldRaw || isEmptyLevelValue(fieldRaw)) continue
    if (isCsvCustomFieldTypeTokenName(fieldRaw)) continue

    const normCode = assetCode.trim().toLowerCase()
    if (!stableAssetCodeByNorm.has(normCode)) {
      stableAssetCodeByNorm.set(normCode, assetCode.trim())
    }
    const stableCode = stableAssetCodeByNorm.get(normCode)!
    if (!fieldsetLeafNames.has(stableCode)) fieldsetLeafNames.set(stableCode, assetName)

    let parentCode: string | undefined
    let siblings = globalRoots
    for (let d = 0; d < segments.length; d++) {
      const name = segments[d]!
      const code = pathCodeForSegments(segments, d)
      const level = d
      const node = findOrCreateChild(siblings, name, code, level, parentCode)
      parentCode = node.code
      siblings = node.children
    }

    const leafLevel = segments.length
    let leafNode = globalLeafByNormCode.get(normCode)
    if (!leafNode) {
      leafNode = {
        code: stableCode,
        name: assetName,
        description: '',
        level: leafLevel,
        children: [],
        parentCode,
        fieldsetCode: stableCode,
      }
      siblings.push(leafNode)
      globalLeafByNormCode.set(normCode, leafNode)
    } else {
      leafNode.fieldsetCode = stableCode
      // Same code → one asset type; keep first-seen display name if later rows differ.
      if (!leafNode.name && assetName) leafNode.name = assetName
    }

    if (hasSectionColumn) {
      const sectionRaw = (row[sectionNameIdx] ?? '').trim()
      const normSection =
        sectionRaw && !isEmptyLevelValue(sectionRaw) ? sectionRaw.toLowerCase() : "__general__"
      const displaySection =
        sectionRaw && !isEmptyLevelValue(sectionRaw) ? sectionRaw : "General"

      if (!fieldsetSectionBuckets.has(stableCode)) {
        fieldsetSectionBuckets.set(stableCode, new Map())
      }
      const bucket = fieldsetSectionBuckets.get(stableCode)!
      if (!bucket.has(normSection)) {
        bucket.set(normSection, { displayName: displaySection, fields: new Set() })
      }
      bucket.get(normSection)!.fields.add(fieldRaw)
    } else {
      if (!fieldsetFieldSets.has(stableCode)) fieldsetFieldSets.set(stableCode, new Set())
      fieldsetFieldSets.get(stableCode)!.add(fieldRaw)
    }

    if (customFieldTypeIdx >= 0) {
      const typeRaw = (row[customFieldTypeIdx] ?? '').trim()
      if (typeRaw && !isEmptyLevelValue(typeRaw)) {
        if (!fieldsetImportedTypesByCode.has(stableCode)) {
          fieldsetImportedTypesByCode.set(stableCode, new Map())
        }
        fieldsetImportedTypesByCode.get(stableCode)!.set(fieldRaw, typeRaw)
      }
    }
  }

  const fieldsets: ParsedFieldset[] = []
  const allCodes = new Set<string>([
    ...fieldsetFieldSets.keys(),
    ...fieldsetSectionBuckets.keys(),
  ])
  for (const code of allCodes) {
    const name = fieldsetLeafNames.get(code) ?? code
    const typeMap = fieldsetImportedTypesByCode.get(code)
    const importedFieldTypes =
      typeMap && typeMap.size > 0 ? Object.fromEntries(typeMap.entries()) : undefined

    if (hasSectionColumn && fieldsetSectionBuckets.has(code)) {
      const bucket = fieldsetSectionBuckets.get(code)!
      const sections = Array.from(bucket.values())
        .map(({ displayName, fields }) => ({
          name: displayName,
          fields: Array.from(fields).sort((a, b) => a.localeCompare(b)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      const fields = sections.flatMap((s) => s.fields)
      fieldsets.push({
        code,
        name,
        fields,
        sections,
        ...(importedFieldTypes ? { importedFieldTypes } : {}),
      })
    } else {
      const fs = fieldsetFieldSets.get(code)
      const fields = fs ? Array.from(fs).sort((a, b) => a.localeCompare(b)) : []
      fieldsets.push({
        code,
        name,
        fields,
        ...(importedFieldTypes ? { importedFieldTypes } : {}),
      })
    }
  }

  let fieldsetsOut = fieldsets
  fieldsetsOut = applyFieldsetInheritance(globalRoots, fieldsetsOut)
  attachCommonFieldsToParents(globalRoots, fieldsetsOut)

  return {
    hierarchy: globalRoots,
    fieldsets: fieldsetsOut,
    stats: {
      totalItems: countItems(globalRoots),
      totalFieldsets: fieldsetsOut.length,
      totalFields: fieldsetsOut.reduce(
        (sum, fs) => sum + fs.fields.length + (fs.inheritedFields?.length ?? 0),
        0
      ),
      format: 'deep-hierarchy-long',
    },
  }
}

/**
 * Detect header row index and column indices for wide CMMS/Excel-style CSV.
 * Expects: Division Number, Division Title, Subdivision Number, Subdivision Title,
 * Subdivision 2 Number, Subdivision 2 Title, Asset Type, Asset Type Code, Custom Field 1..N
 */
function detectWideSchema(lines: string[], delimiter: string): { headerIdx: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const row = lines[i].split(delimiter).map(c => c.trim())
    const lower = row.map(c => c.toLowerCase())
    const hasDivision = lower.some(c => c.includes('division'))
    const hasAssetOrCustom = lower.some(c => c.includes('asset type') || c.includes('custom field'))
    if (!hasDivision || !hasAssetOrCustom || row.length < 8) continue

    const divisionNumber = lower.findIndex(c => c.includes('division') && c.includes('number') && !c.includes('sub'))
    const divisionTitle = lower.findIndex(c => c.includes('division') && c.includes('title') && !c.includes('sub'))
    const subdivisionNumber = lower.findIndex(c => c.includes('subdivision') && c.includes('number') && !c.includes('2'))
    const subdivisionTitle = lower.findIndex(c => c.includes('subdivision') && c.includes('title') && !c.includes('2'))
    const sub2Number = lower.findIndex(c => c.includes('subdivision') && c.includes('2') && c.includes('number'))
    const sub2Title = lower.findIndex(c => c.includes('subdivision') && c.includes('2') && c.includes('title'))
    const assetType = lower.findIndex(c => c.includes('asset type') && !c.includes('code'))
    const assetTypeCode = lower.findIndex(c => c.includes('asset type code'))
    const customFieldStart = lower.findIndex(c => c.includes('custom field'))

    const cols: Record<string, number> = {}
    if (divisionNumber >= 0) cols.divisionNumber = divisionNumber
    else if (lower.some(c => c.includes('division'))) cols.divisionNumber = lower.findIndex(c => c.includes('division'))
    if (divisionTitle >= 0) cols.divisionTitle = divisionTitle
    else cols.divisionTitle = (cols.divisionNumber ?? 0) + 1
    if (subdivisionNumber >= 0) cols.subdivisionNumber = subdivisionNumber
    if (subdivisionTitle >= 0) cols.subdivisionTitle = subdivisionTitle
    if (sub2Number >= 0) { cols.subdivision2Number = sub2Number; cols.subdivision2Title = sub2Title >= 0 ? sub2Title : sub2Number + 1 }
    if (assetType >= 0) cols.assetType = assetType
    if (assetTypeCode >= 0) cols.assetTypeCode = assetTypeCode
    else cols.assetTypeCode = cols.assetType ?? 7
    if (customFieldStart >= 0) cols.customFieldStart = customFieldStart
    else cols.customFieldStart = 8

    if ((cols.divisionNumber !== undefined || cols.divisionTitle !== undefined) && (cols.assetTypeCode !== undefined || cols.assetType !== undefined)) {
      return { headerIdx: i, cols }
    }
  }
  return null
}

/**
 * Parse wide table (CMMS/Excel): Division, Subdivision, Subdivision 2, Asset Type, Asset Type Code, Custom Field 1..N
 * Builds 4-level hierarchy and one fieldset per leaf (Asset Type Code); fields = Custom Field column headers.
 */
function parseWideTableFormat(content: string): ParseResult {
  const delimiter = detectDelimiter(content)
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length < 2) return emptyResult('table')

  const schema = detectWideSchema(lines, delimiter)
  if (!schema) return parseTableFormat(content)

  const { headerIdx, cols } = schema
  const headerRow = lines[headerIdx].split(delimiter).map(c => c.trim())
  const divNumIdx = cols.divisionNumber ?? 0
  const divTitleIdx = cols.divisionTitle ?? 1
  const subNumIdx = cols.subdivisionNumber ?? 2
  const subTitleIdx = cols.subdivisionTitle ?? 3
  const sub2NumIdx = cols.subdivision2Number ?? 4
  const sub2TitleIdx = cols.subdivision2Title ?? 5
  const assetTypeIdx = cols.assetType ?? 6
  const assetTypeCodeIdx = cols.assetTypeCode ?? 7
  const customStartIdx = cols.customFieldStart ?? 8

  const globalRoots: ParsedHierarchyItem[] = []
  const fieldsetMap = new Map<string, ParsedFieldset>()
  /** One leaf per asset type code (case-insensitive) — merge rows; avoid duplicate nodes. */
  const globalLeafByNormCode = new Map<string, ParsedHierarchyItem>()
  const stableLeafCodeByNorm = new Map<string, string>()

  const findOrCreateChild = (
    siblings: ParsedHierarchyItem[],
    name: string,
    code: string,
    level: number,
    parentCode: string | undefined
  ): ParsedHierarchyItem => {
    let node = siblings.find((n) => n.code === code || (n.name === name && n.level === level))
    if (!node) {
      node = {
        code,
        name,
        description: "",
        level,
        children: [],
        parentCode,
      }
      siblings.push(node)
    }
    return node
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = lines[i].split(delimiter).map((c) => c.trim())
    if (row.length < Math.max(assetTypeCodeIdx, assetTypeIdx) + 1) continue

    const divNum = normalizeHierarchyCell(row[divNumIdx] ?? "")
    const divTitle = normalizeHierarchyCell(row[divTitleIdx] ?? "")
    const subNum = normalizeHierarchyCell(row[subNumIdx] ?? "")
    const subTitle = normalizeHierarchyCell(row[subTitleIdx] ?? "")
    const sub2Num = normalizeHierarchyCell(row[sub2NumIdx] ?? "")
    const sub2Title = normalizeHierarchyCell(row[sub2TitleIdx] ?? "")
    const assetTypeName = normalizeHierarchyCell(row[assetTypeIdx] ?? "")
    const assetTypeCode = normalizeHierarchyCell(row[assetTypeCodeIdx] ?? "")

    if (!divTitle && !divNum && !assetTypeCode) continue

    const ancestors = compressHierarchyColumnValues([divTitle, subTitle, sub2Title])

    let rawLeafCode = collapseGhostSegmentsInHyphenatedCode(assetTypeCode)
    if (!rawLeafCode || isEmptyLevelValue(rawLeafCode)) {
      const fallback = ancestors.length > 0 ? pathCodeForSegments(ancestors, ancestors.length - 1) : ""
      rawLeafCode = collapseGhostSegmentsInHyphenatedCode(fallback)
    }
    if (!rawLeafCode || isEmptyLevelValue(rawLeafCode)) continue

    const normLeaf = rawLeafCode.toLowerCase()
    if (!stableLeafCodeByNorm.has(normLeaf)) stableLeafCodeByNorm.set(normLeaf, rawLeafCode)
    const leafCode = stableLeafCodeByNorm.get(normLeaf)!
    const atn = assetTypeName
    const leafName = atn && !isEmptyLevelValue(atn) ? atn : leafCode

    const fieldNames = filterImportedCustomFieldNames(row.slice(customStartIdx).filter(Boolean))

    let parentCode: string | undefined
    let siblings = globalRoots
    for (let d = 0; d < ancestors.length; d++) {
      const name = ancestors[d]!
      const code = pathCodeForSegments(ancestors, d)
      const node = findOrCreateChild(siblings, name, code, d, parentCode)
      parentCode = node.code
      siblings = node.children
    }

    let leafItem = globalLeafByNormCode.get(normLeaf)
    if (!leafItem) {
      leafItem = {
        code: leafCode,
        name: leafName,
        description: "",
        level: ancestors.length,
        children: [],
        parentCode,
        fieldsetCode: leafCode,
      }
      siblings.push(leafItem)
      globalLeafByNormCode.set(normLeaf, leafItem)
    } else {
      if (!leafItem.name && leafName) leafItem.name = leafName
      leafItem.fieldsetCode = leafCode
    }

    const prevFs = fieldsetMap.get(leafCode)
    if (!prevFs) {
      fieldsetMap.set(leafCode, {
        code: leafCode,
        name: leafItem.name || leafName,
        fields: fieldNames.length > 0 ? [...fieldNames] : [],
      })
    } else if (fieldNames.length > 0) {
      const merged = new Set([...prevFs.fields, ...fieldNames])
      prevFs.fields = Array.from(merged)
    }
  }

  const hierarchy = globalRoots
  let fieldsets = Array.from(fieldsetMap.values())
  fieldsets = applyFieldsetInheritance(hierarchy, fieldsets)
  attachCommonFieldsToParents(hierarchy, fieldsets)

  return {
    hierarchy,
    fieldsets,
    stats: {
      totalItems: countItems(hierarchy),
      totalFieldsets: fieldsets.length,
      totalFields: fieldsets.reduce((sum, fs) => sum + fs.fields.length + (fs.inheritedFields?.length ?? 0), 0),
      format: 'table'
    }
  }
}

/**
 * Parse table format (TSV/CSV).
 * Structure-agnostic: if 5+ columns, treat first row as header, first 3 columns = hierarchy, rest = field names.
 * Otherwise: columns 0,1,2 = hierarchy, column 3 = metadata (comma-separated field names).
 */
function parseTableFormat(content: string): ParseResult {
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length === 0) return emptyResult('table')

  const delimiter = detectDelimiter(content)
  const splitRow = (line: string) =>
    delimiter === ',' ? parseCSVLine(line) : line.split(delimiter).map(c => c.trim())

  const firstRow = splitRow(lines[0])
  // Generic wide table: 5+ columns → first 3 = hierarchy, rest = field names (header row)
  if (firstRow.length >= 5) {
    return parseGenericTableFormat(lines, splitRow)
  }

  let startIdx = 0
  const firstCols = firstRow.map(c => c.toLowerCase())
  if (firstCols.some(c => ['system', 'category', 'type', 'asset', 'subtype', 'metadata', 'required', 'technical'].some(k => c.includes(k)))) {
    startIdx = 1
  }

  const globalRoots: ParsedHierarchyItem[] = []
  const fieldsetMap = new Map<string, ParsedFieldset>()

  const findOrCreateChild = (
    siblings: ParsedHierarchyItem[],
    name: string,
    code: string,
    level: number,
    parentCode: string | undefined
  ): ParsedHierarchyItem => {
    let node = siblings.find((n) => n.code === code || (n.name === name && n.level === level))
    if (!node) {
      node = {
        code,
        name,
        description: '',
        level,
        children: [],
        parentCode,
      }
      siblings.push(node)
    }
    return node
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = splitRow(line)
    if (cols.length < 3) continue

    const metadata = cols[3] || ''
    const segments = compressHierarchyColumnValues([cols[0] ?? '', cols[1] ?? '', cols[2] ?? ''])
    if (segments.length === 0) continue

    let parentCode: string | undefined
    let siblings = globalRoots
    for (let d = 0; d < segments.length; d++) {
      const name = segments[d]!
      const code = pathCodeForSegments(segments, d)
      const level = d
      const node = findOrCreateChild(siblings, name, code, level, parentCode)
      parentCode = node.code
      siblings = node.children
      if (d === segments.length - 1) {
        node.fieldsetCode = code
        const fields = filterImportedCustomFieldNames(splitPackedCustomFields(metadata))
        if (fields.length > 0) {
          const prev = fieldsetMap.get(code)
          if (!prev) {
            fieldsetMap.set(code, {
              code,
              name,
              fields: [...fields],
            })
          } else {
            const merged = new Set([...prev.fields, ...fields])
            prev.fields = Array.from(merged)
          }
        }
      }
    }
  }

  const hierarchy = globalRoots
  let fieldsets = Array.from(fieldsetMap.values())
  fieldsets = applyFieldsetInheritance(hierarchy, fieldsets)
  attachCommonFieldsToParents(hierarchy, fieldsets)

  return {
    hierarchy,
    fieldsets,
    stats: {
      totalItems: countItems(hierarchy),
      totalFieldsets: fieldsets.length,
      totalFields: fieldsets.reduce((sum, fs) => sum + fs.fields.length + (fs.inheritedFields?.length ?? 0), 0),
      format: 'table'
    }
  }
}

/**
 * Generic table: first row = header; first 3 columns = hierarchy (level 0, 1, 2); remaining columns = field names.
 * One leaf per unique (col0, col1, col2); fieldset = all field column headers (union).
 */
function parseGenericTableFormat(
  lines: string[],
  splitRow: (line: string) => string[]
): ParseResult {
  const hierarchyColCount = 3
  const headerRow = splitRow(lines[0])
  const fieldNames = filterImportedCustomFieldNames(
    headerRow.slice(hierarchyColCount).filter(Boolean).map((h) => h.trim())
  )
  const globalRoots: ParsedHierarchyItem[] = []
  const fieldsetMap = new Map<string, ParsedFieldset>()

  const findOrCreateChild = (
    siblings: ParsedHierarchyItem[],
    name: string,
    code: string,
    level: number,
    parentCode: string | undefined
  ): ParsedHierarchyItem => {
    let node = siblings.find((n) => n.code === code || (n.name === name && n.level === level))
    if (!node) {
      node = {
        code,
        name,
        description: '',
        level,
        children: [],
        parentCode,
      }
      siblings.push(node)
    }
    return node
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i].trim())
    if (cols.length < hierarchyColCount) continue

    const segments = compressHierarchyColumnValues([cols[0] ?? '', cols[1] ?? '', cols[2] ?? ''])
    if (segments.length === 0) continue

    let parentCode: string | undefined
    let siblings = globalRoots
    for (let d = 0; d < segments.length; d++) {
      const name = segments[d]!
      const code = pathCodeForSegments(segments, d)
      const level = d
      const node = findOrCreateChild(siblings, name, code, level, parentCode)
      parentCode = node.code
      siblings = node.children
      if (d === segments.length - 1) {
        node.fieldsetCode = code
        const prev = fieldsetMap.get(code)
        const fields = fieldNames.length > 0 ? [...fieldNames] : []
        if (!prev) {
          fieldsetMap.set(code, {
            code,
            name,
            fields: [...fields],
          })
        } else {
          const merged = new Set([...prev.fields, ...fields])
          prev.fields = Array.from(merged)
        }
      }
    }
  }

  const hierarchy = globalRoots
  let fieldsets = Array.from(fieldsetMap.values())
  fieldsets = applyFieldsetInheritance(hierarchy, fieldsets)
  attachCommonFieldsToParents(hierarchy, fieldsets)

  return {
    hierarchy,
    fieldsets,
    stats: {
      totalItems: countItems(hierarchy),
      totalFieldsets: fieldsets.length,
      totalFields: fieldsets.reduce((sum, fs) => sum + fs.fields.length + (fs.inheritedFields?.length ?? 0), 0),
      format: 'table'
    }
  }
}

/**
 * Per skill: common fields (e.g. Status) only at root; push to children via inheritance.
 * Root = full common set; mid-level parents = only group-specific (exclude root common).
 */
function attachCommonFieldsToParents(
  items: ParsedHierarchyItem[],
  fieldsets: ParsedFieldset[]
): void {
  const byCode = new Map(fieldsets.map(fs => [fs.code, fs]))
  function fullFieldsForLeaf(item: ParsedHierarchyItem): string[] {
    const fs = item.fieldsetCode ? byCode.get(item.fieldsetCode) : null
    if (!fs) return []
    return [...(fs.inheritedFields ?? []), ...fs.fields]
  }
  function collectLeafFieldLists(nodes: ParsedHierarchyItem[]): string[][] {
    const out: string[][] = []
    for (const n of nodes) {
      if (n.fieldsetCode) out.push(fullFieldsForLeaf(n))
      else out.push(...collectLeafFieldLists(n.children))
    }
    return out
  }
  function intersect(lists: string[][]): string[] {
    if (lists.length === 0) return []
    return lists.slice(1).reduce((acc, arr) => acc.filter(f => arr.includes(f)), lists[0] ?? [])
  }
  function getRootCommon(root: ParsedHierarchyItem): string[] {
    const leafLists = collectLeafFieldLists(root.children)
    if (leafLists.length === 0) return []
    return intersect(leafLists)
  }

  const roots = items.filter(i => i.level === 0)
  const rootCommonByCode = new Map<string, string[]>()
  roots.forEach(root => {
    const common = getRootCommon(root)
    if (common.length > 0) {
      root.commonFields = common
      rootCommonByCode.set(root.code, common)
    }
  })

  function walkMidLevel(nodes: ParsedHierarchyItem[], rootCode: string): void {
    for (const node of nodes) {
      if (node.children.length > 0 && !node.fieldsetCode && node.level > 0) {
        const leafLists = collectLeafFieldLists(node.children)
        if (leafLists.length > 0) {
          const common = intersect(leafLists)
          const rootCommon = rootCommonByCode.get(rootCode) ?? []
          const groupOnly = common.filter(f => !rootCommon.includes(f))
          if (groupOnly.length > 0) node.commonFields = groupOnly
        }
        walkMidLevel(node.children, rootCode)
      } else if (node.children.length > 0) {
        walkMidLevel(node.children, rootCode)
      }
    }
  }
  roots.forEach(root => walkMidLevel(root.children, root.code))
}

/**
 * Per asset-config skill: root fields apply to all descendants; leaf fieldsets store only
 * fields not already defined at root. Sets inheritedFields and reduces fields to leaf-unique.
 */
function applyFieldsetInheritance(
  hierarchy: ParsedHierarchyItem[],
  fieldsets: ParsedFieldset[]
): ParsedFieldset[] {
  const fieldsetByCode = new Map(fieldsets.map((fs) => [fs.code, { ...fs }]))

  function collectLeafFieldsetCodes(items: ParsedHierarchyItem[]): string[] {
    const codes: string[] = []
    for (const it of items) {
      if (it.fieldsetCode) codes.push(it.fieldsetCode)
      if (it.children.length) codes.push(...collectLeafFieldsetCodes(it.children))
    }
    return codes
  }

  for (const root of hierarchy.filter((i) => i.level === 0)) {
    const leafCodes = collectLeafFieldsetCodes(root.children)
    if (leafCodes.length < 2) continue
    const allFieldLists = leafCodes
      .map((code) => fieldsetByCode.get(code)?.fields ?? [])
      .filter((arr) => arr.length > 0)
    if (allFieldLists.length === 0) continue
    const common =
      allFieldLists.length > 1
        ? allFieldLists.slice(1).reduce((acc, list) => acc.filter((f) => list.includes(f)), allFieldLists[0])
        : []
    if (common.length === 0) continue
    for (const code of leafCodes) {
      const fs = fieldsetByCode.get(code)
      if (!fs) continue
      const leafOnly = fs.fields.filter((f) => !common.includes(f))
      fs.inheritedFields = common
      fs.fields = leafOnly
      if (fs.sections?.length) {
        fs.sections = fs.sections
          .map((sec) => ({
            ...sec,
            fields: sec.fields.filter((f) => !common.includes(f)),
          }))
          .filter((sec) => sec.fields.length > 0)
        if (fs.sections.length === 0) fs.sections = undefined
        syncParsedFieldsetFieldsFromSections(fs)
      }
      pruneImportedFieldTypesOnFieldset(fs)
    }
  }

  return Array.from(fieldsetByCode.values())
}

/**
 * Parse text format with indentation/bullets
 */
function parseTextFormat(content: string): ParseResult {
  const lines = content.split('\n')
  const hierarchy: ParsedHierarchyItem[] = []
  const fieldsets: ParsedFieldset[] = []
  const stack: { item: ParsedHierarchyItem; level: number }[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) continue

    // Calculate indent level
    const leadingSpaces = line.length - line.trimStart().length
    let level = Math.floor(leadingSpaces / 2)

    // Adjust for bullet types
    const bulletMatch = trimmed.match(/^([•●○◦▪\-\*\+])/)
    if (bulletMatch) {
      const bullet = bulletMatch[1]
      if (['•', '●', '*', '+'].includes(bullet)) level = Math.max(1, level)
      else if (['○', '◦'].includes(bullet)) level = Math.max(2, level)
      else if (['▪', '-'].includes(bullet)) level = Math.max(3, level)
    }

    // Remove bullets and parse content
    let text = trimmed.replace(/^[•●○◦▪\-\*\+]\s*/, '')
    if (!text) continue

    // Extract code and name
    let code = ''
    let name = ''
    let description = ''

    // Pattern: CODE: Name - Description
    const match1 = text.match(/^([A-Z0-9][A-Z0-9\-\.]*)\s*[:]\s*([^\–\-–]*?)(?:\s*[–\-–]\s*(.+))?$/)
    // Pattern: CODE - Name
    const match2 = text.match(/^([A-Z0-9][A-Z0-9\-\.]*)\s*[–\-–]\s*(.+)$/)
    // Pattern: Name (with parenthetical code)
    const match3 = text.match(/^(.+?)\s*\(([A-Z0-9]+)\)$/)

    if (match1) {
      code = match1[1]
      name = match1[2].trim()
      description = match1[3]?.trim() || ''
    } else if (match2) {
      code = match2[1]
      name = match2[2].trim()
    } else if (match3) {
      name = match3[1].trim()
      code = match3[2]
    } else {
      name = text
      code = generateCode(name)
    }

    const item: ParsedHierarchyItem = {
      code,
      name,
      description,
      level,
      children: []
    }

    // Build tree
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop()
    }

    if (stack.length === 0) {
      hierarchy.push(item)
    } else {
      const parent = stack[stack.length - 1].item
      parent.children.push(item)
      item.parentCode = parent.code
    }

    stack.push({ item, level })
  }

  return {
    hierarchy,
    fieldsets,
    stats: {
      totalItems: countItems(hierarchy),
      totalFieldsets: fieldsets.length,
      totalFields: 0,
      format: 'text'
    }
  }
}

/**
 * Parse JSON format
 */
function parseJsonFormat(content: string): ParseResult {
  try {
    const data = JSON.parse(content)
    const hierarchy: ParsedHierarchyItem[] = []
    const fieldsets: ParsedFieldset[] = []

    if (Array.isArray(data)) {
      // Array of items
      for (const item of data) {
        if (typeof item === 'object' && item !== null) {
          hierarchy.push(convertJsonToHierarchyItem(item, 0))
        }
      }
    } else if (typeof data === 'object' && data !== null) {
      // Single object
      hierarchy.push(convertJsonToHierarchyItem(data, 0))
    }

    return {
      hierarchy,
      fieldsets,
      stats: {
        totalItems: countItems(hierarchy),
        totalFieldsets: 0,
        totalFields: 0,
        format: 'json'
      }
    }
  } catch {
    return emptyResult('json')
  }
}

function convertJsonToHierarchyItem(obj: Record<string, unknown>, level: number): ParsedHierarchyItem {
  const code = String(obj.code || obj.id || generateCode(String(obj.name || 'item')))
  const name = String(obj.name || obj.title || code)
  const description = String(obj.description || '')
  const children: ParsedHierarchyItem[] = []

  if (Array.isArray(obj.children)) {
    for (const child of obj.children) {
      if (typeof child === 'object' && child !== null) {
        children.push(convertJsonToHierarchyItem(child as Record<string, unknown>, level + 1))
      }
    }
  }

  return { code, name, description, level, children }
}

/**
 * Generate a code from a name
 */
function generateCode(name: string): string {
  if (!name) return 'ITEM'
  
  // Remove parenthetical content first
  const cleanName = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
  
  // Get first letters of each word, or first few chars
  const words = cleanName.split(/\s+/)
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
  }
  
  return cleanName
    .substring(0, 6)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * Count total items in hierarchy
 */
function countItems(items: ParsedHierarchyItem[]): number {
  let count = 0
  for (const item of items) {
    count += 1
    if (item.children) {
      count += countItems(item.children)
    }
  }
  return count
}
