/**
 * Builds a paste-ready prompt for external LLMs when the bulk-import preview needs fixing.
 * Instructs **CSV-only** output (Asset_Classification_Deep_Hierarchy shape). Embeds skill rules,
 * current parse snapshot, and optional uploaded file excerpt.
 */

/**
 * Asset-config rules aligned with `.cursor/skills/asset-config/SKILL.md`.
 * External LLM deliverable: **CSV only**, matching app **Export CSV** (\`export-deep-hierarchy-csv.ts\`).
 */
export const ASSET_CONFIG_SKILL_EXCERPT = `## Asset-config skill (bulk import / export contract)

### Deliverable: a **downloadable \`.csv\` file** (preferred)

When the user pastes this **Copy prompt for LLM** into you, **give them a downloadable CSV file directly** — use your product’s **file attachment**, **download / export**, **artifact**, **canvas file**, or equivalent so they receive a real file (e.g. \`Asset_Classification_Deep_Hierarchy.csv\`) they can save and re-upload in Bulk Create. **Do not** ask them to copy chat text into Notepad.

- The **file contents** must be **only** valid RFC 4180 CSV (header row + data rows) per the spec below — **no** JSON, Excel, or PDF.
- **If you can attach or emit a file:** put the full CSV in that file; avoid putting the same CSV inside markdown code fences in the chat body.
- **If your UI cannot attach files:** then output **only** the raw CSV text (no \`\`\` fences, no prose before/after) as a fallback.

**Violations break import** if the delivered file contains non-CSV text or markdown wrappers inside the file.

**Scope:** Hierarchy + fieldsets only. Infer from source data: **Pattern A** (packed lists in one cell), **Pattern B** (wide attribute columns), **Pattern C** (long-format: one field per row — group by hierarchy path).

**Ghost / placeholder tiers (skip as structure, do not invent folders):** \`N/A\`, \`NA\`, \`-\`, \`—\`, \`None\`, \`TBD\`, \`(None Allocated)\`, \`(No LFU)\`, \`(Not Applicable)\`, empty cells — compress path to the next real ancestor.

**Number + Title pairs:** If **Title** is \`NA\` / empty / ghost, that tier is **skipped** — do **not** use **Number** alone as a folder name (the app parser rejects that to avoid bogus nodes like \`10-NA\`). Unused export padding should use \`NA\` in **both** Number and Title for that pair.

**Variable depth:** Use as many hierarchy **Number + Title** pairs as the **deepest branch** needs — not a fixed count (e.g. not “always five subdivisions”). Shallower branches leave later pairs padded with \`NA\`/\`NA\`.

---

## REQUIRED — Expected output: a \`.csv\` file (\`Asset_Classification_Deep_Hierarchy\` shape, same as app Export CSV)

**The deliverable is CSV only:** one header line plus data lines, comma-separated — the **downloadable file’s body** (or raw fallback) must match this shape. The app’s **Export CSV** (\`Asset_Classification_Deep_Hierarchy_<template>.csv\`) and the reference \`Asset_Classification_Deep_Hierarchy.csv\` use **this exact shape**.

### Column order (canonical)

1. **Hierarchy:** repeating pairs, left → right:
   - Pair 0: \`Division Number\`, \`Division Title\`
   - Pair 1: \`Subdivision Number\`, \`Subdivision Title\`
   - Pair 2+: \`Subdivision 2 Number\`, \`Subdivision 2 Title\`, then \`Subdivision 3 Number\`, \`Subdivision 3 Title\`, … **add pairs until every row’s path fits** (depth = deepest branch in the data).

2. **Tail (fixed — always the last five columns):**  
   \`Asset Type\`, \`Asset Type Code\`, \`Section Name\`, \`Custom Field Name\`, \`Custom Field Type\`

### Rules (match export behavior)

- **One data row per custom field** (long tail): repeat the full hierarchy + Asset Type + Asset Type Code on each row; **Section Name** groups fields in the product.
- **Unused hierarchy pairs:** put \`NA\` in **both** the Number and Title cells for that pair (same as export padding). **Do not** put \`NA\` only in Title with a real Number — that would be skipped on import; use \`NA,NA\` for the whole pair.
- **Group by \`Asset Type Code\`:** same code → one leaf fieldset; all field rows for that code belong together.
- **\`Custom Field Type\`** use the same tokens as dictionary / export mapping: \`string\`, \`number\`, \`date\`, \`pull down\` (and similar plain labels — avoid inventing new type names unless unknown).
- **RFC 4180:** quote cells that contain commas, quotes, or newlines; double internal quotes.

### Example header (six hierarchy pairs + tail — adjust pair count to your data)

\`\`\`
Division Number,Division Title,Subdivision Number,Subdivision Title,Subdivision 2 Number,Subdivision 2 Title,Subdivision 3 Number,Subdivision 3 Title,Subdivision 4 Number,Subdivision 4 Title,Subdivision 5 Number,Subdivision 5 Title,Asset Type,Asset Type Code,Section Name,Custom Field Name,Custom Field Type
\`\`\`

### Example data rows

\`\`\`
11,Equipment,40,Food Service Equip.,60,Refrigerators,NA,NA,NA,NA,NA,NA,Walk-in Freezer,11-40-60-10,Inspection Summary,Pre Installation Inspection,date
11,Equipment,40,Food Service Equip.,60,Refrigerators,NA,NA,NA,NA,NA,NA,Walk-in Freezer,11-40-60-10,Status & Compliance,Status,pull down
\`\`\`

**Core:** Dedupe fields on paths (case-insensitive); group-by-path for long-format; **packed fields:** split on commas not inside parentheses.
`

/** Max characters of uploaded file text embedded in the prompt (clipboard-safe for most CSVs). */
const MAX_UPLOADED_CONTENT = 1_500_000

export interface BuildBulkImportCopyPromptParams {
  filename: string | null
  /** Full text extracted from the uploaded file (for LLM context). */
  uploadedRawText: string
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}\n\n… [truncated ${s.length - max} characters — paste the rest of the file manually if needed]`
}

function countLines(s: string): number {
  if (!s.length) return 0
  let n = 1
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) n++
  }
  return n
}

export function buildBulkImportCopyPrompt(params: BuildBulkImportCopyPromptParams): string {
  const { filename, uploadedRawText } = params

  const trimmedUpload = uploadedRawText
  const uploadChars = trimmedUpload.length
  const uploadLines = countLines(trimmedUpload)
  const uploadWasTruncated = uploadChars > MAX_UPLOADED_CONTENT
  const rawContentBlock = trimmedUpload.trim()
    ? truncate(trimmedUpload, MAX_UPLOADED_CONTENT)
    : "(No raw file text was retained — re-upload the file in the bulk import dialog, then use Copy prompt again.)"

  const uploadDetailsBlock =
    trimmedUpload.trim().length === 0
      ? "**Uploaded content:** not available in this session."
      : [
          `**Original filename:** ${filename ?? "(unknown)"}`,
          `**Extracted text length:** ${uploadChars.toLocaleString()} characters`,
          `**Line count (approx.):** ${uploadLines.toLocaleString()}`,
          uploadWasTruncated
            ? `**Note:** The full file is larger than ${MAX_UPLOADED_CONTENT.toLocaleString()} characters; the block below contains the **start only**. Re-export a smaller slice or paste the remainder after the truncated marker.`
            : `**Note:** The block below contains the **full** extracted text from the upload.`,
        ].join("\n")

  const sourceLine =
    "Preview was produced by the app’s **built-in parser** (`parseAssetData` / asset-config rules)."

  return `## How you must deliver the result

**Provide a downloadable \`.csv\` file** — use a **file attachment**, **download link**, **export**, **artifact**, or any built-in way your chat/product offers so the user gets a real \`*.csv\` on disk (e.g. \`Asset_Classification_Deep_Hierarchy.csv\`). They will **download that file** and upload it back into this app’s Bulk Create.

- **Do not** rely on the user copying from the chat into a text editor to build the file.
- The **file** must contain **only** RFC 4180 CSV (see skill excerpt). **No** JSON, Excel, or PDF.
- If your environment **cannot** produce a downloadable file, output **only** raw CSV text in the message (**no** markdown code fences, **no** intro/outro prose) as a last resort.

---

You are helping produce asset template data for a Procore-style bulk import tool.

## What the user needs

The user uploaded a file and the app’s built-in preview **does not match** what they expect. They need a corrected import file.

**Deliverable:** A **\`Asset_Classification_Deep_Hierarchy\`-style** CSV — **same column layout and rules** as **Export CSV** (\`Asset_Classification_Deep_Hierarchy_<template>.csv\`): dynamic \`Division\` / \`Subdivision N\` **Number + Title** pairs, then \`Asset Type\`, \`Asset Type Code\`, \`Section Name\`, \`Custom Field Name\`, \`Custom Field Type\`; \`NA\` padding; one row per custom field. Follow the skill excerpt below.

## Uploaded file — details (source of truth for fixing the parse)

${uploadDetailsBlock}

## How the app parsed it (context only — do not output JSON)

**File name:** ${filename ?? "(unknown)"}
**How this preview was produced:** ${sourceLine}

---

## Asset-config skill excerpt (rules the app follows)

${ASSET_CONFIG_SKILL_EXCERPT}

---

## Original uploaded file — full extracted text

Use this to infer the **true** structure and fields. Fix hierarchy paths, ghost tiers, field names, and section groupings.

\`\`\`
${rawContentBlock}
\`\`\`

---

## Instructions

1. Use the **uploaded file text** and the skill rules to fix hierarchy, ghosts, sections, and field names/types.
2. Build **header row + body rows** matching **Export CSV** / \`Asset_Classification_Deep_Hierarchy\` (correct hierarchy pair count for max depth, fixed five-column tail, \`NA\` padding, \`Custom Field Type\` tokens).
3. **Ship it as a downloadable \`.csv\` file** (attachment / download / artifact). Filename suggestion: \`Asset_Classification_Deep_Hierarchy.csv\` or similar.

---

## Final check

- **Primary:** User gets a **downloadable \`.csv\`** from you — not instructions to paste into an editor.
- **Inside the file:** only valid CSV lines (RFC 4180).
- **Fallback (no file support):** message body = raw CSV only — first line is the header, **no** \`\`\` fences.
`
}

export interface BuildBulkImportFormatHelperPromptParams {
  filename: string | null
  /** Extracted text from the user’s file, if they already uploaded in this dialog. */
  uploadedRawText: string
}

/**
 * Prompt for external LLMs to **convert** arbitrary source data into import-ready
 * `Asset_Classification_Deep_Hierarchy` CSV — used from the import dialog **before** or **without** a preview.
 */
export function buildBulkImportFormatHelperPrompt(
  params: BuildBulkImportFormatHelperPromptParams
): string {
  const { filename, uploadedRawText } = params
  const trimmed = uploadedRawText.trim()
  const hasContent = trimmed.length > 0
  const fileBlock = hasContent
    ? truncate(trimmed, MAX_UPLOADED_CONTENT)
    : "(No file text embedded — paste or attach your source file in the LLM chat together with this prompt, or select a file in the import dialog and copy again to include its text.)"

  return `## Task: convert source data into import-ready CSV

The user will import into a **bulk asset template** tool. They need a **downloadable \`.csv\` file** in the **Asset_Classification_Deep_Hierarchy** shape — the **same format as this app’s Export CSV** (\`Asset_Classification_Deep_Hierarchy_<template>.csv\`).

**Your job:** Turn the source material below into that CSV (or the user will paste/attach the same content in this chat). Output per the skill — **CSV only**, as a **downloadable file** when possible.

**Source filename (if known):** ${filename ?? "(not loaded in dialog)"}

---

## Canonical rules (import / export)

${ASSET_CONFIG_SKILL_EXCERPT}

---

## Source data to convert

The block below is the user’s file from the import dialog when available; otherwise paste your data in the LLM.

\`\`\`
${fileBlock}
\`\`\`

---

## Deliverable

Build **header + rows** per the skill. **Ship as a downloadable \`.csv\`** (attachment / artifact / export). Filename suggestion: \`Asset_Classification_Deep_Hierarchy.csv\`. If you cannot attach a file, output **raw CSV only** (no markdown fences).
`
}
