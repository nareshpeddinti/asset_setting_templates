# Product Requirements Document (PRD)

**Product:** Asset Register & Template Configuration (demo application)  
**Document owner:** Product Management  
**Audience:** Engineering, Design, QA, Stakeholders  
**Status:** As-built (reflects current codebase capabilities)  
**Last updated:** March 2026  

---

## 1. Executive summary

This application lets construction / facilities teams **configure reusable asset templates** (type hierarchies, fieldsets, assembly rules) and **manage a per-template asset register**—including **assembly–component relationships** (e.g., wind turbines and subcomponents). The current build is a **front-end prototype** with rich UX and client-side sample data; persistence, auth, and production integrations are out of scope unless noted.

---

## 2. Goals & success metrics (product)

| Goal | Description |
|------|-------------|
| **G1 — Configurable registers** | Users can define asset types and structure per program / vertical without developer changes (within demo constraints). |
| **G2 — Traceable assemblies** | Users can see which register rows belong to a physical assembly and which component types are still missing. |
| **G3 — Efficient bulk operations** | Users can assign many assets to an assembly in one flow, with validation and safe reassignment. |
| **G4 — Discoverability** | Deep links and cross-navigation (e.g., new tab to register row) support handoffs between workflows. |

*Quantitative KPIs TBD when backend and analytics exist.*

---

## 3. Personas

| Persona | Needs |
|---------|--------|
| **Template admin** | Create templates, assign projects, define asset type trees, fieldsets, assembly roots, bulk-import type structures from documents. |
| **Field / asset coordinator** | Search and filter the register, open detail, link components to assemblies, bulk-assign rows, see attachment/component counts. |
| **Program viewer** | Read-only view of template definitions and register (view mode on template detail). |

---

## 4. Information architecture

- **Global shell:** Header; collapsible left nav with **Assets** and **Asset Settings**.
- **Asset Settings:** Asset Templates list (sub-tabs: **List** | **Recycle Bin** placeholder), template create/edit sheet, drill-in **template detail** (asset types & configuration).
- **Assets:** Template selector, **asset register** table, **Create Asset**, Import menu (placeholder), **asset detail** side panel.

---

## 5. Capabilities (requirements)

### 5.1 Asset templates (program-level)

| ID | Capability | Description | Acceptance criteria |
|----|-------------|-------------|---------------------|
| **T-01** | Template list | Table of templates with metadata (name, default flag, assigned project count, created/updated, actions). | User sees all templates; rows expose actions per **T-02–T-07**. |
| **T-02** | Create template | Modal/sheet to add a template (name, default flag). | New template appears in list; only one default if “default” is selected. |
| **T-03** | Edit template | Open template in edit sheet. | Changes persist in client state for session. |
| **T-04** | View vs edit template detail | Open template into full-page **Asset Settings** detail (edit or view mode). | Back navigation returns to list; mode controls edit affordances. |
| **T-05** | Copy template | Duplicate template row (naming convention e.g. “(Copy)”). | Copied template is independent in list. |
| **T-06** | Delete template | Remove template with confirmation. | Template removed from list. |
| **T-07** | Set default | Mark one template as default. | Exactly one default at a time in list. |
| **T-08** | Assign projects | Multi-select projects from directory; store on template. | Assigned projects reflected on template; count aligns with selection. |
| **T-09** | Recycle bin | Placeholder tab for deleted templates. | Shows empty / placeholder state. |

**Projects directory:** Predefined sample projects (residential, commercial, healthcare, industrial, data center, wind / renewable) used for assignment UX.

---

### 5.2 Template detail — asset types & fieldsets

| ID | Capability | Description | Acceptance criteria |
|----|-------------|-------------|---------------------|
| **S-01** | Asset type hierarchy | Tree/table of asset types with codes, names, parent/child, expand/collapse. | User can navigate hierarchy; types match template catalog data. |
| **S-02** | Type CRUD (sheet) | Create/edit type: name, code, description, fieldset, status group, assembly flag, parent. | Saved type updates hierarchy in UI. |
| **S-03** | Assembly root flag | Mark a type as **assembly** (whole-asset line item, e.g., full turbine). | Child types under assembly gain linkage rules per **A-***. |
| **S-04** | Fieldsets | Associate types with fieldset definitions (sections and fields); default fieldsets available. | Fieldset labels drive create/detail field grouping where implemented. |
| **S-05** | Copy from template | Copy type definitions from another template (dialog). | User can bootstrap hierarchy from existing template. |
| **S-06** | Bulk create from file | Upload document; parse hierarchy and fieldsets; preview/edit tree; import into template. | Supports parsing pipeline; accepts common doc types with text extraction (e.g. PDF, spreadsheet) per implementation. |
| **S-07** | Custom field mapping | Map catalog fields to org custom fields (table UI). | Mappings visible and editable in settings context. |
| **S-08** | Assembly linkage in fieldsets | Merge “Assembly linkage” section for types under an assembly (parent assembly field). | Fieldsets for qualifying types include parent assembly selection semantics in create flow. |

---

### 5.3 Asset register (per-template)

| ID | Capability | Description | Acceptance criteria |
|----|-------------|-------------|---------------------|
| **R-01** | Template switcher | Dropdown to choose active template; register data scopes to template. | Table shows assets for selected template only. |
| **R-02** | Search | Free-text filter across key columns (e.g., name, code, project, type, trade). | Rows filter live as user types. |
| **R-03** | Filters | Filters: **Type**, **Status**, **Project**, **Trade**, **Assembly** (all / assemblies only / non-assemblies). | Combined filters narrow rows; clear/reset available. |
| **R-04** | Columns | Name (with Assembly badge), Code, Project, Type, Status, Last modified, **Assembly** (parent name for components), **Components** count (for assembly rows), **Attachments** count, Actions. | Assembly column shows parent assembly name or em dash; component count shows linked children count for assemblies. |
| **R-05** | Row selection | Checkbox per row; select all on page. | Selection drives bulk actions. |
| **R-06** | Row click | Open **asset detail** panel for row. | Panel shows selected asset. |
| **R-07** | Deep link | URL query params open register with specific asset detail (e.g., `template` + `asset`). | Visiting link selects template and opens detail for asset. |
| **R-08** | Bulk assign to assembly | Choose target assembly from register assemblies; validate selected rows against template rules. | Invalid rows listed with reasons; rows already on target handled; reassignment from another assembly requires confirmation. |
| **R-09** | Import (menu) | Dropdown: Import from CSV / Excel (placeholder). | Menu entries visible; full import not required in demo. |

---

### 5.4 Asset detail panel

| ID | Capability | Description | Acceptance criteria |
|----|-------------|-------------|---------------------|
| **D-01** | Tabs | Tabbed layout (e.g., Information, Photos, Documents, **Components** for assemblies). | Tabs switch content without losing context. |
| **D-02** | Information | Trade, description, specification/maintenance-style fields; **parent assembly** when applicable. | Parent assembly shows linked assembly asset when `parentAssemblyAssetId` set. |
| **D-03** | Assembly components tab | For assembly assets: list linked components; **Link Items**; **Unlink** per row. | Linked list matches register rows with `parentAssemblyAssetId` = assembly id. |
| **D-04** | Missing component types | Banner listing **linkable leaf types** (from settings) with no linked asset of that type yet. | Hidden when nothing missing; shows type name/code badges when gaps exist. |
| **D-05** | Link Items modal | Left: linkable types; right: candidate register assets; search; filters; multi-select; **selection persists when switching type**; link applies parent to all selected. | User can select assets across multiple types in one session and link in one confirmation. |
| **D-06** | Open in register | Component rows link to register URL in **new tab** (deep link). | New tab opens correct template + asset. |
| **D-07** | Related / demo content | Demo panels (e.g., related assets for specific verticals) where implemented. | Consistent with sample data. |

---

### 5.5 Assembly & hierarchy rules (logic)

| ID | Rule | Description |
|----|------|-------------|
| **A-01** | Assembly ancestor | Types under an assembly root inherit “component under assembly” behavior. |
| **A-02** | Creatable types | Only **assembly** types or **leaf** types (no children in tree) are creatable in UI. |
| **A-03** | Linkable leaves | Components that may be linked to an assembly instance are **leaf** types under that assembly in settings. |
| **A-04** | Bulk assign validation | Reject assembly rows as components; reject types not allowed under target assembly; support reassign with explicit confirmation. |
| **A-05** | Field label | Parent field label derives from assembly type name (e.g., “Parent {Assembly} asset”). |

---

### 5.6 Create asset

| ID | Capability | Description | Acceptance criteria |
|----|-------------|-------------|---------------------|
| **C-01** | Template selection | User picks template for new asset. | Types list scopes to template. |
| **C-02** | Type selection | Pick creatable type; show parent assembly field when required by hierarchy. | Cannot pick non-creatable group nodes. |
| **C-03** | Save | Submit creates asset (demo may log to console). | Sheet closes or confirms per UX. |

---

## 6. Non-functional requirements (current build)

| Area | Note |
|------|------|
| **Data** | Client-side state and static samples; no authoritative server persistence. |
| **Auth** | Not implemented. |
| **Performance** | Suitable for demo dataset sizes. |
| **Accessibility** | Partial (e.g., aria on some controls); full WCAG audit not claimed. |
| **i18n** | English UI. |

---

## 7. Out of scope / roadmap candidates

- Real CSV/Excel import pipeline and validation reports.
- Server APIs, multi-user concurrency, audit log.
- Attachments upload/storage (counts are demo).
- Recycle bin restore/delete permanence.
- Mobile-optimized layouts.
- Procore (or other) production integration beyond conceptual alignment in copy.

---

## 8. Glossary

| Term | Definition |
|------|------------|
| **Template** | Reusable configuration package: asset type tree + fieldsets for a program/vertical. |
| **Assembly** | A whole-asset register row (e.g., one turbine) that can own **component** assets. |
| **Component** | Register row whose type sits under an assembly in settings and links via `parentAssemblyAssetId`. |
| **Linkable leaf** | Deepest creatable type under an assembly branch—allowed target for linking to that assembly. |
| **Register** | Per-template table of asset instances (rows). |

---

## 9. Revision history

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-18 | Initial PRD from as-built product capabilities. |

---

*End of document*
