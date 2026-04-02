/**
 * Map CSV / export "Custom Field Type" strings to Custom Field Mapping UI types
 * (see `FIELD_TYPES` in `components/custom-field-mapping.tsx`).
 */

const APP_FIELD_TYPES = [
  "Plain Text (Short)",
  "Plain Text (Long)",
  "Number",
  "Date",
  "Single Select (Dropdown)",
  "Multi Select",
  "Checkbox",
  "Company",
  "URL",
] as const

function isEmptyPlaceholder(s: string): boolean {
  return /^(n\/a|na|none|-+|\?|tbd)$/i.test(s.trim())
}

/**
 * Normalize a cell/header before classifying it as a type token vs field name
 * (BOM, NBSP, smart quotes, trailing punctuation from Excel).
 */
export function normalizeImportFieldLabelForTypeCheck(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\u00a0/g, " ")
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .trim()
    .replace(/[.,;:!]+$/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

/**
 * True when `name` is only a **Custom Field Type** dictionary token (e.g. mis-parsed CSV cells),
 * not a real field label. Used so type strings like `string` / `number` are not added as custom fields.
 * Intentionally does not match common real field names (e.g. "Description", "Status").
 */
export function isCsvCustomFieldTypeTokenName(name: string): boolean {
  const t = normalizeImportFieldLabelForTypeCheck(name)
  if (!t || isEmptyPlaceholder(t)) return true
  for (const label of APP_FIELD_TYPES) {
    if (label.toLowerCase() === t) return true
  }
  // Deep-hierarchy export tokens (export-deep-hierarchy-csv, asset-config skill)
  if (
    t === "string" ||
    t === "text" ||
    t === "number" ||
    t === "date" ||
    t === "pull down" ||
    t === "pulldown"
  ) {
    return true
  }
  // Synonyms that map to app types in mapImportedCustomFieldTypeToApp (single-token / short)
  if (
    /^(varchar|integer|decimal|float|double|boolean|datetime|timestamp|textarea|picklist|enumerated|multi-select|multi select|single-select|single select|yes\/no|yes no|qty|quantity|currency|numeric|pulldown|tags|checklist|memo|short text|long text|plain text|single line|rich text)$/i.test(
      t
    )
  ) {
    return true
  }
  return false
}

/** Drop CSV type tokens from a list of imported field names. */
export function filterImportedCustomFieldNames(names: string[]): string[] {
  return names.filter((n) => !isCsvCustomFieldTypeTokenName(n))
}

/**
 * Map a **Custom Field Type** cell from an import file to an app mapping type.
 * @param csvTypeRaw - Value from "Custom Field Type" column (or equivalent)
 * @param fallback - Used when the cell is empty or unrecognized (e.g. matched Procore field type)
 */
export function mapImportedCustomFieldTypeToApp(
  csvTypeRaw: string | undefined | null,
  fallback: string
): string {
  if (csvTypeRaw == null || typeof csvTypeRaw !== "string") return fallback
  const raw = csvTypeRaw.trim()
  if (!raw || isEmptyPlaceholder(raw)) return fallback

  const t = raw.toLowerCase().replace(/\s+/g, " ").trim()

  for (const label of APP_FIELD_TYPES) {
    if (label.toLowerCase() === t) return label
  }

  if (/^(plain text|text|short text|string|varchar|single line)$/.test(t)) {
    return "Plain Text (Short)"
  }
  if (/^(long text|memo|rich text|multi-?line|note|description)$/.test(t)) {
    return "Plain Text (Long)"
  }
  if (/^(number|numeric|integer|decimal|float|double|currency|qty|quantity)$/.test(t)) {
    return "Number"
  }
  if (/^(date|datetime|date\/time|time|timestamp)$/.test(t)) {
    return "Date"
  }
  if (/^(dropdown|single select|select|list|picklist|enumerated)$/.test(t)) {
    return "Single Select (Dropdown)"
  }
  if (/^(multi ?select|multi-?select|tags|checklist)$/.test(t)) {
    return "Multi Select"
  }
  if (/^(checkbox|boolean|yes\/no|yes no)$/.test(t)) {
    return "Checkbox"
  }
  if (/^(company|vendor|counterparty)$/.test(t)) {
    return "Company"
  }
  if (/^(url|link|uri|hyperlink)$/.test(t)) {
    return "URL"
  }

  return fallback
}

/** Find CSV type string for a field name across imported fieldsets (first match). */
export function findImportedCustomFieldTypeRaw(
  fieldName: string,
  fieldsets: { importedFieldTypes?: Record<string, string> }[]
): string | undefined {
  const norm = fieldName.trim().toLowerCase()
  for (const fs of fieldsets) {
    const m = fs.importedFieldTypes
    if (!m) continue
    if (m[fieldName]) return m[fieldName]
    const key = Object.keys(m).find((k) => k.trim().toLowerCase() === norm)
    if (key) return m[key]
  }
  return undefined
}
