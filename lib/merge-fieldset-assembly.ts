import type { AssetType, FieldsetData } from "@/app/page"
import {
  ASSEMBLY_LINKAGE_SECTION,
  nearestAssemblyAncestor,
  parentAssemblyFieldLabel,
  typeRequiresParentAssemblyField,
} from "@/lib/assembly-asset-types"

/**
 * Returns a deep-cloned fieldset with an "Assembly linkage" section prepended
 * when the asset type is a descendant of an assembly node.
 */
export function mergeFieldsetWithAssemblyLinkage(
  base: FieldsetData | null | undefined,
  allTypes: AssetType[],
  forTypeId: string
): FieldsetData | null {
  if (!base) return null
  const cloned: FieldsetData = {
    name: base.name,
    sections: base.sections.map((s) => ({
      name: s.name,
      fields: [...s.fields],
    })),
  }

  if (!typeRequiresParentAssemblyField(allTypes, forTypeId)) {
    return cloned
  }

  const assembly = nearestAssemblyAncestor(allTypes, forTypeId)
  if (!assembly) return cloned

  const fieldName = parentAssemblyFieldLabel(assembly)
  const existingIdx = cloned.sections.findIndex((s) => s.name === ASSEMBLY_LINKAGE_SECTION)
  if (existingIdx >= 0) {
    const sec = cloned.sections[existingIdx]
    if (!sec.fields.includes(fieldName)) {
      sec.fields = [fieldName, ...sec.fields]
    }
  } else {
    cloned.sections = [
      {
        name: ASSEMBLY_LINKAGE_SECTION,
        fields: [fieldName],
      },
      ...cloned.sections,
    ]
  }
  return cloned
}
