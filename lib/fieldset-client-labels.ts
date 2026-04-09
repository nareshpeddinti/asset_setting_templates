import type { AssetType, FieldsetData } from "@/app/page"
import { COMPANY_FIELDSET_CLIENTS } from "@/lib/build-multi-hierarchy-global-catalog"
import {
  customFieldsetKeysAssignedAndAncestorsOnly,
  customFieldsetKeysAssignedAndAncestorsWithinSelection,
} from "@/lib/fieldset-keys-for-asset-type"
import {
  fieldsetTemplateAssignmentStorageKey,
  getFieldsetTemplateAssignmentList,
  parseFieldsetTemplateAssignmentStorageKey,
} from "@/lib/fieldset-template-assignment-keys"

/**
 * Labels for one logical fieldset key across clients (same key, different display names).
 * `primary` is the first distinct name in client order; `extraCount` is additional distinct names.
 */
export function fieldsetPrimaryAndExtraCount(
  fieldsetKey: string,
  fieldsetsByClient: Record<string, Record<string, FieldsetData>> | undefined,
  clientOrder: readonly string[],
  fallbackFieldsets: Record<string, FieldsetData>
): { primary: string; extraCount: number; tooltipLines: string[] } {
  if (!fieldsetsByClient) {
    const primary =
      fallbackFieldsets[fieldsetKey]?.name?.trim() || fieldsetKey
    return { primary, extraCount: 0, tooltipLines: [] }
  }

  const tooltipLines: string[] = []
  const namesInOrder: string[] = []
  for (const c of clientOrder) {
    const n = fieldsetsByClient[c]?.[fieldsetKey]?.name?.trim()
    if (n) {
      namesInOrder.push(n)
      tooltipLines.push(`${c}: ${n}`)
    }
  }

  if (namesInOrder.length === 0) {
    const primary =
      fallbackFieldsets[fieldsetKey]?.name?.trim() || fieldsetKey
    return { primary, extraCount: 0, tooltipLines: [] }
  }

  const unique = [...new Set(namesInOrder)]
  if (unique.length <= 1) {
    return { primary: unique[0]!, extraCount: 0, tooltipLines }
  }

  return {
    primary: unique[0]!,
    extraCount: unique.length - 1,
    tooltipLines,
  }
}

/** Every client’s display name for one fieldset key (same row in the Fieldsets table). */
export function fieldsetLabelsForAllClients(
  fieldsetKey: string,
  fieldsetsByClient: Record<string, Record<string, FieldsetData>> | undefined,
  clientOrder: readonly string[],
  fallbackFieldsets: Record<string, FieldsetData>
): { client: string; name: string }[] {
  if (!fieldsetsByClient) {
    const name = fallbackFieldsets[fieldsetKey]?.name?.trim() || fieldsetKey
    return [{ client: "", name }]
  }
  return clientOrder.map((c) => ({
    client: c,
    name: fieldsetsByClient[c]?.[fieldsetKey]?.name?.trim() || "—",
  }))
}

function customFieldsetKeysForMergeScope(
  t: AssetType,
  allTypes: readonly AssetType[],
  scopeSelectedTypeIds: ReadonlySet<string> | undefined
): string[] {
  return scopeSelectedTypeIds
    ? customFieldsetKeysAssignedAndAncestorsWithinSelection(t, allTypes, scopeSelectedTypeIds)
    : customFieldsetKeysAssignedAndAncestorsOnly(t, allTypes)
}

/**
 * True when every type in scope has at most one custom fieldset key in merge scope (no multi-key
 * hierarchy row to choose). After a successful import, use this to avoid reopening the merge
 * dialog when nothing needs multi-key selection anymore (even if template sync checks would
 * otherwise suggest another round).
 */
export function everyMergeScopeTypeHasAtMostOneCustomFieldsetKey(
  assetTypesInScope: readonly AssetType[],
  allTypes: readonly AssetType[],
  scopeSelectedTypeIds: ReadonlySet<string>
): boolean {
  return assetTypesInScope.every(
    (t) => customFieldsetKeysForMergeScope(t, allTypes, scopeSelectedTypeIds).length <= 1
  )
}

/**
 * Matches the Asset Types table “+N” badge: same fieldset key but multiple distinct display names
 * across clients (see {@link fieldsetPrimaryAndExtraCount}), or multiple custom fieldset keys on the
 * type (assigned + ancestors only; not {@link AssetType.fieldsetCandidates}).
 *
 * When `scopeSelectedTypeIds` is set (Assign-templates step), ancestor keys only include parents
 * whose ids are in that set — same scope as the user’s selected asset types.
 */
export function assetTypeQualifiesForFieldsetMergeConfirm(
  t: AssetType,
  allTypes: readonly AssetType[],
  opts: {
    fieldsetsByClient?: Record<string, Record<string, FieldsetData>>
    fieldsetClientOrder?: readonly string[]
    fallbackFieldsets: Record<string, FieldsetData>
  },
  scopeSelectedTypeIds?: ReadonlySet<string>
): boolean {
  if (customFieldsetKeysForMergeScope(t, allTypes, scopeSelectedTypeIds).length > 1) return true
  const { fieldsetsByClient, fieldsetClientOrder = [], fallbackFieldsets } = opts
  if (!fieldsetsByClient || fieldsetClientOrder.length === 0) return false
  const { extraCount } = fieldsetPrimaryAndExtraCount(
    t.fieldset,
    fieldsetsByClient,
    fieldsetClientOrder,
    fallbackFieldsets
  )
  return extraCount > 0
}

/**
 * After Import on the fieldset merge dialog: `true` if some merge-eligible type still has a required
 * fieldset key that was not in the user’s selection (partial merge). When `false`, every qualifying
 * type had all of its assigned+ancestor keys included in `selectedFieldsetKeys`.
 */
export function qualifyingMergeTypesStillNeedKeySelection(
  selectedFieldsetKeys: readonly string[],
  assetTypes: readonly AssetType[],
  opts: {
    fieldsetsByClient?: Record<string, Record<string, FieldsetData>>
    fieldsetClientOrder?: readonly string[]
    fallbackFieldsets: Record<string, FieldsetData>
    /** When set, required keys use the same ancestor scope as Assign templates. */
    mergeScopeSelectedTypeIds?: ReadonlySet<string>
  }
): boolean {
  const selected = new Set(selectedFieldsetKeys)
  const scope = opts.mergeScopeSelectedTypeIds
  for (const t of assetTypes) {
    if (!assetTypeQualifiesForFieldsetMergeConfirm(t, assetTypes, opts, scope)) continue
    const required = customFieldsetKeysForMergeScope(t, assetTypes, scope)
    if (required.some((k) => !selected.has(k))) return true
  }
  return false
}

/** Storage keys that receive template merges for a logical fieldset key (matches merge template storage). */
function storageKeysForMergeLogicalFieldset(
  logicalKey: string,
  fieldsets: Record<string, FieldsetData>,
  fieldsetsByClient: Record<string, Record<string, FieldsetData>> | undefined,
  clientIds: readonly string[]
): string[] {
  if (!Object.prototype.hasOwnProperty.call(fieldsets, logicalKey)) return []
  if (!fieldsetsByClient) return [logicalKey]
  const keysToTouch = new Set<string>()
  if (logicalKey === "Procore Default") keysToTouch.add("Procore Default")
  for (const c of clientIds) {
    const m = fieldsetsByClient[c]
    if (m && Object.prototype.hasOwnProperty.call(m, logicalKey)) {
      keysToTouch.add(fieldsetTemplateAssignmentStorageKey(logicalKey, c))
    }
  }
  return [...keysToTouch]
}

function storageRowIncludesAllTemplateIds(
  assign: Record<string, string[]> | undefined,
  storageKey: string,
  templateIds: readonly string[],
  clientIds: readonly string[],
  hasMulti: boolean
): boolean {
  const parsed = parseFieldsetTemplateAssignmentStorageKey(storageKey, clientIds)
  const list = getFieldsetTemplateAssignmentList(assign, parsed.fieldsetKey, parsed.clientId, hasMulti)
  return templateIds.every((tid) => list.includes(tid))
}

/**
 * After an Import merged `templateIds` onto selected fieldset keys, returns whether another merge
 * round is needed: some merge-eligible type still has a logical fieldset key whose storage row(s)
 * do not yet list all assigned templates.
 */
export function qualifyingMergeNeedsAnotherRoundAfterImport(
  templateIds: readonly string[],
  assetTypes: readonly AssetType[],
  fieldsetTemplateAssignments: Record<string, string[]> | undefined,
  fieldsets: Record<string, FieldsetData>,
  fieldsetsByClient: Record<string, Record<string, FieldsetData>> | undefined,
  opts: {
    fieldsetsByClient?: Record<string, Record<string, FieldsetData>>
    fieldsetClientOrder?: readonly string[]
    fallbackFieldsets: Record<string, FieldsetData>
    /** When set, merge checks use ancestor keys only within this Assign-templates selection. */
    mergeScopeSelectedTypeIds?: ReadonlySet<string>
  }
): boolean {
  if (templateIds.length === 0) return false
  const hasMulti = !!fieldsetsByClient
  const clientIds = COMPANY_FIELDSET_CLIENTS
  const scope = opts.mergeScopeSelectedTypeIds

  for (const t of assetTypes) {
    if (!assetTypeQualifiesForFieldsetMergeConfirm(t, assetTypes, opts, scope)) continue
    for (const k of customFieldsetKeysForMergeScope(t, assetTypes, scope)) {
      const storageKeys = storageKeysForMergeLogicalFieldset(k, fieldsets, fieldsetsByClient, clientIds)
      if (storageKeys.length === 0) continue
      for (const sk of storageKeys) {
        if (
          !storageRowIncludesAllTemplateIds(
            fieldsetTemplateAssignments,
            sk,
            templateIds,
            clientIds,
            hasMulti
          )
        ) {
          return true
        }
      }
    }
  }
  return false
}
