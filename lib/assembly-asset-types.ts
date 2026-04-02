import type { AssetType } from "@/app/page"

/** Section name injected into fieldsets for types under an assembly. */
export const ASSEMBLY_LINKAGE_SECTION = "Assembly linkage"

/**
 * Walks up from `typeId` and returns the nearest ancestor marked `isAssembly`.
 * Used to know which assembly instance child assets should reference.
 */
export function nearestAssemblyAncestor(
  all: AssetType[],
  typeId: string
): AssetType | null {
  const byId = new Map(all.map((t) => [t.id, t]))
  let cur = byId.get(typeId)?.parentId
  while (cur) {
    const node = byId.get(cur)
    if (!node) break
    if (node.isAssembly) return node
    cur = node.parentId
  }
  return null
}

/** True when this type sits under an assembly ancestor (not the assembly root itself). */
export function typeRequiresParentAssemblyField(
  all: AssetType[],
  typeId: string
): boolean {
  return nearestAssemblyAncestor(all, typeId) !== null
}

/** Default field label for selecting the parent assembly asset instance. */
export function parentAssemblyFieldLabel(assemblyType: AssetType): string {
  return `Parent ${assemblyType.name} asset`
}

/**
 * All asset types in the template tree that sit under a given assembly root
 * (nearest assembly ancestor is `assemblyTypeId`).
 */
export function getComponentTypesUnderAssembly(
  all: AssetType[],
  assemblyTypeId: string
): AssetType[] {
  const root = all.find((t) => t.id === assemblyTypeId && t.isAssembly)
  if (!root) return []
  return all.filter((t) => {
    if (t.id === assemblyTypeId) return false
    const anc = nearestAssemblyAncestor(all, t.id)
    return anc?.id === assemblyTypeId
  })
}

function typeHasChildrenInList(all: AssetType[], typeId: string): boolean {
  return all.some((t) => t.parentId === typeId)
}

/**
 * True when Create Asset may use this type: `isAssembly` (whole-asset row) or a **leaf**
 * type (no child types in the template tree). Intermediate grouping nodes are not creatable.
 */
export function isCreatableAssetType(all: AssetType[], typeId: string): boolean {
  const t = all.find((x) => x.id === typeId)
  if (!t) return false
  if (t.isAssembly) return true
  return !typeHasChildrenInList(all, typeId)
}

/**
 * Leaf types under an assembly that can be instantiated as component assets
 * (no child rows in the type tree; excludes the assembly root and group nodes).
 */
export function getLinkableLeafTypesUnderAssembly(
  all: AssetType[],
  assemblyTypeId: string
): AssetType[] {
  const under = getComponentTypesUnderAssembly(all, assemblyTypeId)
  return under.filter((t) => !t.isAssembly && !typeHasChildrenInList(all, t.id))
}

/** Resolve the settings assembly type row for an assembly asset instance (by display name). */
export function resolveAssemblyTypeForAsset(
  all: AssetType[],
  assetTypeName: string
): AssetType | null {
  return all.find((t) => t.isAssembly && t.name === assetTypeName) ?? null
}

/** True if a register row's type name is a linkable leaf under the assembly root in settings. */
export function isComponentTypeAllowedUnderAssembly(
  all: AssetType[],
  assemblyCatalogTypeId: string,
  componentTypeName: string
): boolean {
  return getLinkableLeafTypesUnderAssembly(all, assemblyCatalogTypeId).some(
    (t) => t.name === componentTypeName
  )
}

export interface BulkAssignValidationResult {
  invalid: { asset: { id: string; name: string; code: string; type: string }; reason: string }[]
  alreadyOnTarget: { id: string; name: string; code: string }[]
  /** Valid rows that will receive the new parent (unlinked + reassign). */
  toAssign: { id: string; name: string; code: string }[]
  /** Subset of toAssign that were linked to a different assembly (for confirmation). */
  needsReassign: { id: string; name: string; code: string }[]
}

/**
 * Validates bulk "assign components to assembly" against the template hierarchy.
 * Use {@link resolveAssemblyTypeForAsset} for the target assembly row's catalog type.
 */
export function validateBulkAssignToAssembly(
  all: AssetType[],
  selectedAssets: { id: string; name: string; code: string; type: string; isAssembly?: boolean; parentAssemblyAssetId?: string }[],
  targetAssembly: { id: string; name: string; code: string; type: string; isAssembly?: boolean },
  assemblyCatalogType: AssetType | null
): BulkAssignValidationResult {
  const invalid: BulkAssignValidationResult["invalid"] = []
  const alreadyOnTarget: BulkAssignValidationResult["alreadyOnTarget"] = []
  const toAssign: BulkAssignValidationResult["toAssign"] = []
  const needsReassign: BulkAssignValidationResult["needsReassign"] = []

  if (!assemblyCatalogType?.id) {
    for (const asset of selectedAssets) {
      invalid.push({
        asset: { id: asset.id, name: asset.name, code: asset.code, type: asset.type },
        reason:
          "Target assembly type is not defined in Asset Settings for this template.",
      })
    }
    return { invalid, alreadyOnTarget, toAssign, needsReassign }
  }

  const allowed = new Set(
    getLinkableLeafTypesUnderAssembly(all, assemblyCatalogType.id).map((t) => t.name)
  )

  for (const asset of selectedAssets) {
    const row = { id: asset.id, name: asset.name, code: asset.code, type: asset.type }
    if (asset.id === targetAssembly.id) {
      invalid.push({ asset: row, reason: "You cannot assign the assembly row to itself." })
      continue
    }
    if (asset.isAssembly) {
      invalid.push({
        asset: row,
        reason: "Assembly assets cannot be assigned as components. Deselect them or pick component rows only.",
      })
      continue
    }
    if (!allowed.has(asset.type)) {
      invalid.push({
        asset: row,
        reason: `Type "${asset.type}" is not allowed as a component under this assembly in Asset Settings (only leaf types under the assembly hierarchy).`,
      })
      continue
    }

    if (asset.parentAssemblyAssetId === targetAssembly.id) {
      alreadyOnTarget.push({ id: asset.id, name: asset.name, code: asset.code })
      continue
    }

    toAssign.push({ id: asset.id, name: asset.name, code: asset.code })
    if (asset.parentAssemblyAssetId) {
      needsReassign.push({ id: asset.id, name: asset.name, code: asset.code })
    }
  }

  return { invalid, alreadyOnTarget, toAssign, needsReassign }
}
