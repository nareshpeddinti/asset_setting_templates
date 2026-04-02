/** Shared types for bulk import hierarchy + fieldsets (used by dialog, preview panel, refine agent). */

export interface HierarchyItem {
  code: string
  name: string
  description?: string
  level: number
  parentCode?: string
  fieldsetCode?: string
  /** Parent-level fields (shown at parent; available in child nodes). */
  commonFields?: string[]
  children: HierarchyItem[]
}

export interface FieldsetSection {
  name: string
  fields: string[]
}

export interface Fieldset {
  code: string
  name: string
  /** Leaf-only fields (asset-config: do not repeat parent). Kept in sync with `sections` when present. */
  fields: string[]
  /** Root-level inherited fields (cascading). */
  inheritedFields?: string[]
  /**
   * When set (e.g. deep hierarchy CSV with Section Name), preview/import group fields by section.
   * `fields` should equal `sections.flatMap(s => s.fields)`.
   */
  sections?: FieldsetSection[]
  /**
   * From **Custom Field Type** column (deep hierarchy CSV): maps custom field **name** → raw type string.
   * Used for Custom Field Mapping default type; pruned when fields are removed by cascade/inheritance.
   */
  importedFieldTypes?: Record<string, string>
}
