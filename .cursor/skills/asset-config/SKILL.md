---
name: asset-config
description: >-
  Spec for technical fields (A/B/C), variable hierarchy depth, CMMS long-format group-by-path,
  and full CMMS ghost handling—including AIMS-style multi-column paths. Parser must align; skill
  is source of truth. LLM / bulk-import deliverable is CSV only (downloadable .csv file, Asset_Classification_Deep_Hierarchy shape).
---

# Skill: asset-config (Technical Field Intelligence)

**Description:** This skill does the **heavy lifting** for bulk asset templates. It does **not** assume one fixed spreadsheet layout. It **dynamically figures out** how the user encoded **technical fields** (custom metadata) by looking for **three specific patterns**—alone or mixed—and turns them into a clean **hierarchy + fieldsets** for preview and import.

**Purpose:** Make **logic-to-data** mapping unmistakable for an **LLM** or **developer** implementing or reviewing parsers (`parseAssetData`, UI).

**Scope:** **Hierarchy and fieldsets only** (no Status Groups, Default Fields, or other admin tabs).

**Expected output format (CSV only):** For bulk import and for any **LLM** asked to fix or generate hierarchy + field data (e.g. **Bulk Create → Copy prompt for LLM**), the deliverable **must be CSV only** — a **downloadable `.csv` file**: plain text, comma-separated values (RFC 4180) that the user can **save or download** and **re-upload** into Bulk Create, same canonical shape as **`Asset_Classification_Deep_Hierarchy.csv`** / **Export CSV** (see **Standard deep hierarchy CSV** below). **Do not** deliver JSON, Excel workbooks, PDFs, or unstructured prose as the answer; the only valid handoff is CSV text matching this spec.

### LLM deliverable: downloadable `.csv` file (preferred)

When a user pastes the **Copy prompt for LLM** into an external model, the model should **provide a downloadable `.csv` file directly** — e.g. **file attachment**, **export/download**, **artifact**, or the chat product’s native downloadable file output — named like `Asset_Classification_Deep_Hierarchy.csv`. The user **downloads** that file and **re-uploads** it in Bulk Create. The model should **not** ask the user to copy chat text into an editor to create the file.

- **Inside the file:** only RFC 4180 CSV (header + data rows per this skill). **No** JSON, Excel, or PDF.
- **If the product cannot emit a file:** fallback is **raw CSV text only** in the message (no markdown code fences, minimal or no prose) so the user can still save bytes as `.csv`.

If the delivered file (or raw fallback) contains non-CSV content, import may **fail**.

**Skill vs code:** This document is the **contract**. If bulk import behavior diverges (e.g. **group-by-path** or **ghost** handling for CMMS exports), **update the implementation** to match this skill—not the other way around.

---

## Building the asset tree: variable depth, groups, leaves, and ghosts

The skill **does not assume** a fixed number of hierarchy levels (e.g. always exactly three columns). It infers **how deep** the tree should be and **which columns are “folders” vs “specific types”** by looking at **how values behave down each column**, then applies **ghost skipping** so the preview never fills with **empty or useless** asset-type folders.

### How column repetition maps to branches (groups) vs leaves (specific assets)

| Signal | Typical meaning | Tree role |
| :--- | :--- | :--- |
| **High repetition** | The same token appears on **many rows** (e.g. `"Mechanical"` repeats for dozens of rows in that column). | **Broad group / branch / parent** — use as a **folder** that groups many children. |
| **Lower repetition / higher cardinality** | Values look **more unique** per row (e.g. `"Exhaust Fan"`, `"Chiller"`, `"Switchgear"`). | **Specific asset type / leaf (or near-leaf)** — the column where **distinct equipment names** live. |

**How to use this in practice:** Treat repetition and uniqueness as **relative** within the sheet—compare columns (or sample rows) to see which columns behave like **labels that repeat** vs **labels that discriminate**. Headers are hints; **value distribution** decides. Optional heuristic: if the **ratio of unique values to row count** is **low** for a column, it behaves like a **group**; if **high**, it behaves like **specific types** (leaves or the last structural tier before technical fields). Exact thresholds may be tuned in code; intent is **content-first**.

### Variable hierarchical depth

- Branches may have **different depths** (e.g. one branch stops at two tiers, another uses four).
- Do **not** insert **placeholder** levels just to pad every row to the same depth, and **do not** assume a fixed number of subdivision tiers (e.g. five) in the **parser** — depth grows only from **real** path segments in the data. (The **Export CSV** may include many Number+Title **column pairs** in the header and pad unused pairs with `NA` per row; that is **file-shape** padding, not a requirement that every branch have that many levels.)
- **Structure columns** (left-to-right or section headers) define **path segments**; only create a node for a segment when the cell has a **real**, non-ghost value.

### Skip “ghost” tiers (no empty folders)

If a cell at a hierarchy step is a **placeholder**, the skill **does not** create a node for that step—it **skips** that tier and connects the real child to the correct parent so the tree stays **meaningful**.

**Deep-hierarchy Number + Title pairs (standard CSV):** The **Title** cell is the canonical **folder label** for that tier. If **Title** is `NA` / empty / ghost (export padding), **skip the entire tier** — do **not** use the **Number** cell alone as a hierarchy node. Using Number-only when Title is `NA` incorrectly creates bogus folders (e.g. `10-NA`, `10-NA-NA`). When both Number and Title are ghosts, skip the tier; proceed to the next pair or to **Asset Type**. **Empty Title** and **`NA` Title** mean the same: level not applicable. If **Title** is **only the same digits as Number** (e.g. both `12`), treat as padding — **skip** (avoids nameless `12` / `12 12` nodes).

**Single-column hierarchy columns (generic wide table — first three columns):** **Empty cells** are treated like **`NA`**: `compressHierarchyColumnValues` drops them so a path `Type1,,,Type2` previews as **Type1 → Type2** with no blank intermediate nodes.

**Treat as transparent / skip in *structure* (hierarchy) cells — non-exhaustive:**  
`N/A`, `N/A.`, `None`, `-`, `—`, `…`, `null`, `TBD`, empty cells, and CMMS-style **parenthetical** placeholders including:

- `(None Allocated)`  
- `(No LFU)`, `(No FU)`  
- `(Not Applicable)`  
- Any same-pattern label meaning “no object at this tier” (case-insensitive; normalize whitespace).

**Effect:** Avoids **empty asset-type hierarchies**—no folder whose only purpose is to hold a placeholder. After skipping, **re-parent** the next real level under the last valid ancestor (**path compression**).

**Ghost *field* rows (Pattern C):** If the column that carries **field names** (e.g. **Attribute Name**) contains `-`, `N/A`, or the same placeholder list **as a value**, that row contributes **no** field to the fieldset—it is not a real attribute name.

**Parser requirement:** Hierarchy placeholder matching **must** include the **parenthetical CMMS forms** above, not only bare `N/A` / `-`. A regex that omits `(None Allocated)` and similar will **incorrectly** create **ghost folders** in the tree. **Group-by-path** and **ghost** logic are **both** required for exports like the AIMS sample (see below).

---

## The three patterns (how technical fields show up)

### Pattern A — “Packed” fields (comma-separated in one cell)

| | |
| :--- | :--- |
| **What it sees** | A **single cell** packed with text, e.g. `"Motor HP, RPM, Volts"`, or quoted RFC4180 cells with many commas inside. |
| **What it does** | Treats the cell as a **list**, not one string. It **splits** on delimiters (commas/semicolons; **not** inside balanced parentheses), **trims** tokens, strips stray **trailing punctuation**, and produces separate fields: `[Motor HP]`, `[RPM]`, `[Volts]`. Parenthetical units stay on the same field (e.g. `Flow (GPM)`). |

**Detection signals:** High fraction of non-empty cells in that column contain delimiters; column headers like **Custom Fields**, **Metadata**, **Technical Attributes**; classic **four-column** dictionaries (*System Category · Asset Type · Asset Subtype · Custom Fields*) where column 4 is explicitly the packed list.

**Implementation notes:** Use CSV-aware line parsing (`parseCSVLine`) so commas **inside quotes** do not split columns before packed-field splitting runs on the **inner** cell text. See `splitPackedCustomFields` in `lib/asset-data-parser.ts`.

---

### Pattern B — “Multi-column” fields (read horizontally)

| | |
| :--- | :--- |
| **What it sees** | **Several columns** after the hierarchy columns, where **each column** is one slot for technical data—either **header row names the attribute** (e.g. `Make`, `Model`, `Serial Number`) or **each cell holds a field name / value** read across the row. |
| **What it does** | **Reads the row horizontally**: collects **all attribute columns** for that row into **one fieldset** for the leaf node. Header text often becomes the **field name**; when the row is “wide” with many technical columns, union/merge rules apply per parser pass. |

**Variants included in B:**

- **Wide CMMS / Excel:** Division / subdivision / asset type / **Custom Field 1…N** as separate columns (field names from headers).
- **Generic wide table:** First row = header; first 3 columns = hierarchy path; **remaining columns** = field names; one row = one leaf’s fieldset.

**Detection signals:** Column count ≥ 5 with repeating path columns + trailing attribute columns; or explicit **Custom Field N** / attribute-style headers.

**Implementation notes:** `parseGenericTableFormat`, wide-table path, and flexible hierarchy tables that split **structure vs attribute** columns (`splitHierarchyAndAttributeColumns`).

---

### Pattern C — “Long-format” fields (read vertically)

| | |
| :--- | :--- |
| **What it sees** | **One column** (or a small set) dedicated to **field names** or technical lines, with **multiple rows** describing the **same** asset path (same System / Type / Subtype repeated). |
| **What it does** | **Groups rows** that share the same **hierarchy path** (stable keys from structure columns). It **bundles** every field name (or value) from those rows into **one fieldset** for that leaf—instead of treating each row as overwriting the previous one. |

**Detection signals:** Same path repeated on consecutive rows; a column whose header matches **Field Name**, **Attribute**, **Parameter**, **Technical Field**, etc.; row count ≫ unique paths.

**Implementation notes:** Parsers aligning with this skill **must** merge vertical stacks by **path key** before building the preview. When long-format is ambiguous, prefer **group-by-path + concatenate unique field names**.

---

## CMMS / AIMS long-format (reference workbook)

**Reference file (shape, not code):**  
`12C-007_01-AIMS-Possible-View-August-2018.xlsx` — sheet **“AIMS Possible View”**, exported to CSV for parsing.

**Header shape (example):**

| Facility Class | PFU Class | LFU Class | FU Class | Asset Class | Provisional EQ Cat | Attribute Name | Attribute Type | Attribute Counter |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |

- **Structure (path) columns:** All columns **strictly before** the first **attribute-name** column (here: everything left of **Attribute Name**). There may be **many** tiers (here: **six**), not three. **Do not** assume “first three columns = hierarchy” for this layout.
- **Long-format attribute column:** **Attribute Name** holds the **technical field name for that row** (e.g. `Asset Status`, `Depth (Metres)`). The **same path** repeats on **many rows**; each row adds **one** field (or none if ghost) to **one** fieldset for that leaf.
- **Trailing metadata columns** (e.g. **Attribute Type**, **Attribute Counter**): classify as **metadata**, not as extra field *names*, unless the product explicitly maps them.

**Required behavior:**

1. **Column cut:** Detect structure vs attributes by **header semantics**—e.g. first column matching `(?i)^(attribute|field|parameter)\s*name$` starts **attribute** columns; columns to the left are **hierarchy** only. Fallbacks that cap hierarchy at **three** columns **break** this export.
2. **Group by path:** Build a stable **path key** from non-ghost structure cells. For every row with the same key, **union** the **Attribute Name** values into one leaf fieldset (dedupe).
3. **Ghosts:** Skip `(None Allocated)` / `(No LFU)` / etc. in path columns; skip rows whose **Attribute Name** is a **ghost field** token (`-`, …).

Until an implementation performs (1)–(3), **Pattern C** and **ghost** behavior for this file will **not** match the skill.

---

## Standard deep hierarchy CSV (`Asset_Classification_Deep_Hierarchy.csv`)

**The file format is CSV only:** Output is a **downloadable `.csv` file** (text, commas/quoting per RFC 4180), not JSON and not a binary spreadsheet. The user **needs that file** to import: they save or download the LLM’s CSV text as **`.csv`**, then upload it in Bulk Create. The user or LLM must not substitute other formats—**no other format** is acceptable for LLM-generated fixes.

**LLM paste behavior:** After pasting the **Copy prompt for LLM**, the model should deliver a **downloadable `.csv` file** (see **LLM deliverable** above). The prompt instructs the model to use attachments/downloads rather than copy-from-chat workflows when possible.

**Reference workbook file:** `Asset_Classification_Deep_Hierarchy.csv` (e.g. under **Asset Data Dictionary**) defines the **canonical** tabular shape for hierarchy + long-format custom fields.

**Parity with this app:** **Export CSV** from **Asset template → Types** writes `Asset_Classification_Deep_Hierarchy_<template>.csv` using the **same column order, `NA` padding rules, and tail columns** as the reference file. Implementation: `lib/export-deep-hierarchy-csv.ts` (`hierarchyPairColumnHeaders`, `buildHierarchyPairs`, `TAIL_COLUMNS`). Anything that claims to “match Procore / dictionary CSV” should match **this** shape—not a different header ordering.

**Parsing:** In each **Number + Title** pair, **`NA` in Title** means “no subdivision at this tier” — **skip the tier**; do **not** promote **Number** alone into the path (that was the source of false `10-NA` intermediate asset types). **`NA` in Number** with a real **Title** still uses **Title** as the segment label. Rows whose **Asset Type Code** (or both type columns) are ghost/empty are **skipped** so no leaf is named `NA`. Implementation: `segmentFromHierarchyPair` in `lib/asset-data-parser.ts`.

### Expected output — column order (canonical)

1. **Hierarchy:** zero or more **pairs** of columns, left to right:
   - Pair 0: `Division Number`, `Division Title`
   - Pair 1: `Subdivision Number`, `Subdivision Title`
   - Pair 2+: `Subdivision 2 Number`, `Subdivision 2 Title`, then `Subdivision 3 Number`, `Subdivision 3 Title`, … **as many pairs as the deepest path** in the file (export picks `pairCount` from max depth; parsers infer pairs until `Asset Type`).

2. **Tail (fixed, always last five columns):**  
   `Asset Type`, `Asset Type Code`, `Section Name`, `Custom Field Name`, `Custom Field Type`

**Example header row** (reference uses **six** hierarchy pairs — Division + five Subdivision tiers — before the tail; shallower trees still use the same tail):

```text
Division Number,Division Title,Subdivision Number,Subdivision Title,Subdivision 2 Number,Subdivision 2 Title,Subdivision 3 Number,Subdivision 3 Title,Subdivision 4 Number,Subdivision 4 Title,Subdivision 5 Number,Subdivision 5 Title,Asset Type,Asset Type Code,Section Name,Custom Field Name,Custom Field Type
```

**Example data rows** (one row per custom field; unused hierarchy pairs are padded with **`NA`** in **both** Number and Title cells — same as export):

```text
11,Equipment,40,Food Service Equip.,60,Refrigerators,NA,NA,NA,NA,NA,NA,Walk-in Freezer,11-40-60-10,Inspection Summary,Pre Installation Inspection,date
11,Equipment,40,Food Service Equip.,60,Refrigerators,NA,NA,NA,NA,NA,NA,Walk-in Freezer,11-40-60-10,Status & Compliance,Status,pull down
```

**`Custom Field Type` tokens** (align with export mapping `appFieldTypeToDeepHierarchyCsvType`): typical values include `string`, `number`, `date`, `pull down` (dropdown / single select style in source dictionaries).

### Semantics (unchanged contract)

| Role | Columns |
| :--- | :--- |
| **Hierarchy** | All **Number + Title** pairs **before** **Asset Type** — walk pairs left-to-right; skip a tier when the pair is empty, both cells are ghost, or **Title** is ghost (including `NA` padding). **Do not** create a folder from Number-only when Title is `NA`. |
| **Leaf** | **Asset Type** (display name) + **Asset Type Code** (stable id for fieldset key). |
| **Fields (Pattern C)** | Each row adds one field under **Section Name**; parser stores **`sections[]`** (`name` + `fields`) for preview/import. **Custom Field Type** maps to **`importedFieldTypes`** (name → raw type). |
| **Group by** | **Asset Type Code** (case-insensitive) — merge all rows with the same code into **one fieldset** and **one hierarchy leaf**. |

**Parser:** `parseDeepHierarchyLongFormat` in `lib/asset-data-parser.ts` (`detectFormat` → `deep-hierarchy-long`). After merge, **inheritance / promotion** rules apply as elsewhere in the skill.

**Hyphenated codes:** `collapseGhostSegmentsInHyphenatedCode()` strips `NA` / `N/A` **segments** from **Asset Type Code** and from **computed path codes** so previews do not show `10-NA-…` when the file embedded padding in the code string. Cells are normalized with `normalizeHierarchyCell()` (strip stray quotes) before ghost checks.

---

## How patterns combine with the rest of the skill

1. **Hierarchy first** — Infer **groups vs leaves** and **depth** from **repetition and cardinality** (see **Building the asset tree**), then attach **Patterns A / B / C** field data to the correct **leaf** path.
2. **Packed-field decomposition (Pattern A detail)** — Threshold: if **> ~30%** of non-empty cells in a candidate column contain delimiters, treat as packed. Never leave a comma-separated attribute list as a **single** undifferentiated field after decomposition.
3. **Fieldset logic & inheritance** — Fields attach to the **leaf** first; **promote** to parent when **every** sibling shares the same field name (dedupe). No duplicate field names on parent and child on the same path (case-insensitive).
4. **Ghost tiers** — Same as **Skip “ghost” tiers** above: placeholders **never** become folders; **compress** the path so children are not stranded under empty types.
5. **Entropy / content-first** — Prefer **cell content** over header wording when classifying columns (e.g. “Notes” full of `HP, RPM` → technical fields, not free text).

---

## Export (template UI)

From **Asset template → Types**, **Export CSV** downloads `Asset_Classification_Deep_Hierarchy_<template>.csv`. It is the **same canonical shape** as **`Asset_Classification_Deep_Hierarchy.csv`** (reference dictionary file): **dynamic** Division / Subdivision column pairs — the export includes **as many Number+Title pairs as the deepest ancestor path** in the template (then **Asset Type**, **Asset Type Code**, **Section Name**, **Custom Field Name**, **Custom Field Type**). Shallower rows are padded with **`NA`** for unused pairs. Types without a resolvable fieldset with sections are skipped; **Custom Field Mapping** types inform the exported **Custom Field Type** column when present.

---

## Product flow (Bulk Create)

```
Upload (dialog) → Parse (infer A / B / C) → Preview in dialog → Import
```

1. **Upload** — User picks a file. If upload fails, read from **local file path**.
2. **Parse** — Infer pattern(s), build hierarchy + fieldsets; strip **UTF-8 BOM** on ingest when present.
3. **Preview** — Editable tree + fieldsets; user validates before import.
4. **Copy prompt for LLM** (optional) — If preview is wrong, user copies a prompt into an external LLM; the model should provide a **downloadable `.csv` file** in the **Standard deep hierarchy CSV** shape (above). The user **downloads** it and **re-uploads** for import (or saves raw CSV if the product has no file download).
5. **Import** — Merge into template.

---

## Core constraints

1. **No duplicate fields** — Same field name cannot appear on both **parent** and **child** on one path (after promotion).
2. **Case insensitivity** — `motor hp` ≡ `Motor HP` for dedupe.
3. **Variable depth** — Branches may differ in length; **do not** invent levels or empty **asset type** nodes to normalize row shape.
4. **No empty hierarchy folders** — Ghost placeholders are **skipped**; the tree must not gain useless intermediate **asset types** that only repeat `N/A` / `-` / `None`.
5. **Groups vs leaves** — Use **column repetition and uniqueness** to infer **broad groups** vs **specific types**, not column index alone.
6. **Content priority** — Classify from **values**, not titles alone.
7. **Preview before import** — User must confirm.
8. **Packed lists** — After Pattern A splitting, each token is its own field candidate, not one blob.

---

## Preview format (UX contract)

1. **Surface inferred pattern** — Where possible, show whether fields came from **packed**, **horizontal**, or **grouped vertical** logic (even as subtle UI hints).
2. **Hierarchy + fieldsets** — Tree and per-node fields for validation; tree should **not** show spurious empty tiers after ghost removal.

---

## Implementation map

| Area | Location |
| :--- | :--- |
| Upload dialog + preview | `components/bulk-create-dialog.tsx` |
| Template (opens bulk create) | `components/asset-template-detail.tsx` |
| Preview tree | `components/bulk-create-preview-body.tsx` |
| Types | `lib/bulk-hierarchy-types.ts` |
| **Pattern A / B** | `lib/asset-data-parser.ts` — `parseAssetData()`, `splitPackedCustomFields()`, `parseCSVLine()`, table + wide + generic paths; `compressHierarchyColumnValues()` for 3-column generic / classic tables |
| **Deep hierarchy + long fields (standard template)** | `lib/asset-data-parser.ts` — `parseDeepHierarchyLongFormat()` when headers match **Division / Subdivision… / Asset Type / Asset Type Code / Custom Field Name**; `segmentFromHierarchyPair()` skips a tier when **Title** is ghost (`NA` padding) — **never** Number-only |
| **Pattern C + CMMS (AIMS-style)** | `lib/asset-data-parser.ts` — **group-by-path** for **Attribute Name**-style columns; **CMMS ghost** matching per **Skip “ghost” tiers** and **CMMS / AIMS** sections |
| **Ghost skip** | Same — `isEmptyLevelValue` / equivalent **must** recognize **parenthetical** CMMS placeholders and **ghost field** rows |
| Extraction | `lib/file-extractors.ts` |

---

## Appendix: Thresholds & implementation

- **Packed column flag** — **> ~30%** of non-empty cells with delimiter (intent; code may sample rows).
- **Group vs leaf columns** — Prefer **low unique-count / high repeat rate** → group-like column; **high unique-count** → specific-type / leaf-like column (tune thresholds per implementation).
- **Wide vs long** — Use **unique paths / total rows** and repeated path keys to disambiguate **B** vs **C**; AIMS-style sheets are **C** with **many** hierarchy columns.
- **Promotion** — **100% of children** is the rule for lifting a field to the parent.
- **Ghost tiers** — Match **full** list under **Skip “ghost” tiers** (including **parenthetical** CMMS strings); compress paths; **group-by-path** for long-format **before** preview.
