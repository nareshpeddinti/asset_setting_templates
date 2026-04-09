import type { AssetType } from "@/app/page"

/**
 * Company rule: each asset type has exactly one active fieldset key. Clears
 * {@link AssetType.fieldsetCandidates} whenever the active fieldset is set so alternates cannot
 * surface as multiple assignments (template view, imports, merge dialog).
 */
export function assetTypeWithSingleFieldset(t: AssetType, fieldsetKey: string): AssetType {
  const fk = fieldsetKey.trim() || "Procore Default"
  return {
    ...t,
    fieldset: fk,
    fieldsetCandidates: undefined,
  }
}
