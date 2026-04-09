import type { AssetType } from "@/app/page"

/** Canonical object key for the built-in Procore default fieldset (not a custom fieldset). */
export const PROCORE_DEFAULT_FIELDSET_KEY = "Procore Default"

/**
 * Distinct fieldset object keys for an asset type used in assignment / merge UI.
 *
 * Keys are **authored on the catalog** (same strings as `AssetType.fieldset` and
 * `fieldsetCandidates`), e.g. `"23-AIR_Fieldset"` for the “Air Handling & Room Cooling” branch in
 * the datacenter seed (`components/asset-template-detail.tsx` → `TEMPLATE_DATACENTER_ASSET_TYPES`).
 * This helper does not invent keys; it unions:
 * - this type’s `fieldset` and `fieldsetCandidates`
 * - each ancestor’s `fieldset` while walking `parentId` (so a leaf can surface both a branch
 *   fieldset and a grandparent fieldset, e.g. `23_Fieldset` + `23-GEN_Fieldset`)
 */
function addFieldsetKey(keys: Set<string>, k: string | undefined | null) {
  if (k != null && String(k).trim() !== "") keys.add(k)
}

export function fieldsetKeysForAssetType(t: AssetType, allTypes: readonly AssetType[]): string[] {
  const keys = new Set<string>()
  addFieldsetKey(keys, t.fieldset)
  for (const c of t.fieldsetCandidates ?? []) addFieldsetKey(keys, c)
  const byId = new Map(allTypes.map((a) => [a.id, a]))
  let cur: AssetType | undefined = t
  while (cur?.parentId) {
    const p = byId.get(cur.parentId)
    if (!p) break
    addFieldsetKey(keys, p.fieldset)
    cur = p
  }
  return [...keys]
}

/**
 * Active `fieldset` plus each ancestor’s `fieldset` only — **no** `fieldsetCandidates`.
 * Use for template merge / Fieldsets confirm so alternates (e.g. 23-AIR / 23-PMP on Chiller Units seed)
 * do not appear as extra rows; the Types column reflects the assigned key + hierarchy only.
 */
export function fieldsetKeysAssignedAndAncestorsOnly(
  t: AssetType,
  allTypes: readonly AssetType[]
): string[] {
  const keys = new Set<string>()
  addFieldsetKey(keys, t.fieldset)
  const byId = new Map(allTypes.map((a) => [a.id, a]))
  let cur: AssetType | undefined = t
  while (cur?.parentId) {
    const p = byId.get(cur.parentId)
    if (!p) break
    addFieldsetKey(keys, p.fieldset)
    cur = p
  }
  return [...keys]
}

/** True when the key is not the built-in Procore default (custom / hierarchy-specific fieldsets). */
export function isCustomFieldsetKey(key: string): boolean {
  return key.trim() !== "" && key !== PROCORE_DEFAULT_FIELDSET_KEY
}

/**
 * Like {@link fieldsetKeysForAssetType} but omits {@link PROCORE_DEFAULT_FIELDSET_KEY}.
 * Use for “multiple custom fieldsets” UX (confirm dialog, gates).
 */
export function customFieldsetKeysForAssetType(
  t: AssetType,
  allTypes: readonly AssetType[]
): string[] {
  return fieldsetKeysForAssetType(t, allTypes).filter(isCustomFieldsetKey)
}

/** {@link fieldsetKeysAssignedAndAncestorsOnly} minus {@link PROCORE_DEFAULT_FIELDSET_KEY}. */
export function customFieldsetKeysAssignedAndAncestorsOnly(
  t: AssetType,
  allTypes: readonly AssetType[]
): string[] {
  return fieldsetKeysAssignedAndAncestorsOnly(t, allTypes).filter(isCustomFieldsetKey)
}

/**
 * Like {@link fieldsetKeysAssignedAndAncestorsOnly}, but only walks to an ancestor when that
 * ancestor’s id is in `selectedTypeIds`. Stops at the first parent not in the selection.
 *
 * Use when merge / import UX must match types chosen in Assign templates only — no fieldset keys
 * from hierarchy branches the user did not include in that step.
 */
export function fieldsetKeysAssignedAndAncestorsWithinSelection(
  t: AssetType,
  allTypes: readonly AssetType[],
  selectedTypeIds: ReadonlySet<string>
): string[] {
  const keys = new Set<string>()
  addFieldsetKey(keys, t.fieldset)
  const byId = new Map(allTypes.map((a) => [a.id, a]))
  let cur: AssetType | undefined = t
  while (cur?.parentId) {
    const p = byId.get(cur.parentId)
    if (!p) break
    if (!selectedTypeIds.has(p.id)) break
    addFieldsetKey(keys, p.fieldset)
    cur = p
  }
  return [...keys]
}

/** {@link fieldsetKeysAssignedAndAncestorsWithinSelection} minus {@link PROCORE_DEFAULT_FIELDSET_KEY}. */
export function customFieldsetKeysAssignedAndAncestorsWithinSelection(
  t: AssetType,
  allTypes: readonly AssetType[],
  selectedTypeIds: ReadonlySet<string>
): string[] {
  return fieldsetKeysAssignedAndAncestorsWithinSelection(t, allTypes, selectedTypeIds).filter(
    isCustomFieldsetKey
  )
}
