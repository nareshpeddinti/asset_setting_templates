import type { AssetType, FieldsetData } from "@/app/page"
import type { TemplateAssetConfig } from "@/components/asset-template-detail"
import { getTemplateSourceData } from "@/components/asset-template-detail"
import {
  buildMultiClientFieldsetDisplayName,
  buildFlatFieldsetDisplayName,
} from "@/lib/fieldset-display-names"
import {
  ALL_CATALOG_FIELDSET_CLIENTS,
  AIRPORT_FIELDSET_CLIENTS,
  buildSharedDatacenterMultiClientCatalog,
  DATACENTER_FIELDSET_CLIENTS,
  getFieldsetClientsForAssetType,
  HOSPITAL_FIELDSET_CLIENTS,
  RESIDENTIAL_FIELDSET_CLIENTS,
  syncFlatFieldsetsFromPrimaryClient,
} from "@/lib/build-multi-hierarchy-global-catalog"

type VerticalSpec = {
  templateId: "template-residential" | "template-healthcare" | "template-airport"
  prefix: string
  root: AssetType
  fieldsetClients: readonly string[]
}

const VERTICALS: VerticalSpec[] = [
  {
    templateId: "template-residential",
    prefix: "RES",
    fieldsetClients: RESIDENTIAL_FIELDSET_CLIENTS,
    root: {
      id: "vert-residential-root",
      name: "Residential Buildings",
      code: "RES",
      description:
        "Site, MEP, life safety, and common residential systems—aligned with the residential building template.",
      fieldset: "Procore Default",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
  },
  {
    templateId: "template-healthcare",
    prefix: "HOSP",
    fieldsetClients: HOSPITAL_FIELDSET_CLIENTS,
    root: {
      id: "vert-hospital-root",
      name: "Hospitals & Acute Care",
      code: "HOSP",
      description:
        "Clinical, imaging, medical gas, critical power, and life-safety systems for acute-care hospitals.",
      fieldset: "Procore Default",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
  },
  {
    templateId: "template-airport",
    prefix: "APT",
    fieldsetClients: AIRPORT_FIELDSET_CLIENTS,
    root: {
      id: "vert-airport-root",
      name: "Airports & Airfields",
      code: "APT",
      description:
        "Airfield pavement, lighting, terminals, baggage, ground support, fuel, and perimeter security.",
      fieldset: "Procore Default",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
  },
]

function verticalChunkForClient(
  rawFieldsets: Record<string, FieldsetData>,
  prefix: string,
  client: string
): Record<string, FieldsetData> {
  const out: Record<string, FieldsetData> = {}
  for (const [k, v] of Object.entries(rawFieldsets)) {
    if (k === "Procore Default") continue
    const nk = `${prefix}_${k}`
    const clone = JSON.parse(JSON.stringify(v)) as FieldsetData
    clone.name = buildMultiClientFieldsetDisplayName(nk, client)
    out[nk] = clone
  }
  return out
}

function verticalAssetTypes(rawTypes: AssetType[], prefix: string, root: AssetType): AssetType[] {
  const rootId = root.id
  const mapped = rawTypes.map((t) => ({
    ...t,
    fieldset: t.fieldset === "Procore Default" ? "Procore Default" : `${prefix}_${t.fieldset}`,
    parentId: t.parentId ?? rootId,
  }))
  return [root, ...mapped]
}

/**
 * Procore Default for every catalog client, DC template keys only on DC clients,
 * vertical template keys only on that vertical’s clients.
 */
function buildMergedFieldsetMaps(
  dcByClient: Record<string, Record<string, FieldsetData>>,
  verticals: {
    fieldsets: Record<string, FieldsetData>
    prefix: string
    fieldsetClients: readonly string[]
  }[]
): Record<string, Record<string, FieldsetData>> {
  const firstDc = DATACENTER_FIELDSET_CLIENTS[0]
  const defaultProcore = dcByClient[firstDc]?.["Procore Default"]
  if (!defaultProcore) {
    return {}
  }

  const out: Record<string, Record<string, FieldsetData>> = {}
  for (const c of ALL_CATALOG_FIELDSET_CLIENTS) {
    const pro = dcByClient[c]?.["Procore Default"]
    out[c] = {
      "Procore Default": JSON.parse(JSON.stringify(pro ?? defaultProcore)) as FieldsetData,
    }
  }

  for (const c of DATACENTER_FIELDSET_CLIENTS) {
    const src = dcByClient[c] ?? {}
    for (const [k, v] of Object.entries(src)) {
      if (k === "Procore Default") continue
      out[c][k] = JSON.parse(JSON.stringify(v)) as FieldsetData
    }
  }

  for (const v of verticals) {
    for (const c of v.fieldsetClients) {
      Object.assign(out[c], verticalChunkForClient(v.fieldsets, v.prefix, c))
    }
  }

  return out
}

function mergeFlatFieldsetsWithVerticals(
  dcFieldsets: Record<string, FieldsetData>,
  verticals: { fieldsets: Record<string, FieldsetData>; prefix: string }[]
): Record<string, FieldsetData> {
  const out: Record<string, FieldsetData> = { ...dcFieldsets }
  for (const v of verticals) {
    for (const [k, fs] of Object.entries(v.fieldsets)) {
      if (k === "Procore Default") continue
      const nk = `${v.prefix}_${k}`
      const clone = JSON.parse(JSON.stringify(fs)) as FieldsetData
      clone.name = buildFlatFieldsetDisplayName(nk)
      out[nk] = clone
    }
  }
  return out
}

function forceNonLeafFieldsetToProcoreDefault(assetTypes: AssetType[]): AssetType[] {
  const parentIdsWithChildren = new Set<string>()
  for (const t of assetTypes) {
    if (t.parentId) parentIdsWithChildren.add(t.parentId)
  }
  return assetTypes.map((t) =>
    parentIdsWithChildren.has(t.id) ? { ...t, fieldset: "Procore Default" } : t
  )
}

function pruneFlatFieldsetsToReferenced(
  assetTypes: AssetType[],
  fieldsets: Record<string, FieldsetData>
): Record<string, FieldsetData> {
  const referenced = new Set(assetTypes.map((t) => t.fieldset).filter(Boolean))
  const out: Record<string, FieldsetData> = {}
  for (const k of referenced) {
    if (fieldsets[k]) out[k] = fieldsets[k]
  }
  return out
}

function pruneFieldsetsByClientToReferenced(
  assetTypes: AssetType[],
  byClient: Record<string, Record<string, FieldsetData>>
): Record<string, Record<string, FieldsetData>> {
  const referenced = new Set(assetTypes.map((t) => t.fieldset).filter(Boolean))
  const out: Record<string, Record<string, FieldsetData>> = {}
  for (const c of ALL_CATALOG_FIELDSET_CLIENTS) {
    const src = byClient[c] ?? {}
    const next: Record<string, FieldsetData> = {}
    for (const k of referenced) {
      if (src[k]) next[k] = src[k]
    }
    out[c] = next
  }
  return out
}

function leafFieldsetKeyForType(typeId: string): string {
  return `LEAF_${typeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

/**
 * Leaf types: unique LEAF_* key; definitions only on that hierarchy’s clients, named with that client.
 */
function assignLeafClientSpecificFieldsets(
  assetTypes: AssetType[],
  fieldsetsByClient: Record<string, Record<string, FieldsetData>>
): { assetTypes: AssetType[]; fieldsetsByClient: Record<string, Record<string, FieldsetData>> } {
  const parentIdsWithChildren = new Set<string>()
  for (const t of assetTypes) {
    if (t.parentId) parentIdsWithChildren.add(t.parentId)
  }

  const nextByClient: Record<string, Record<string, FieldsetData>> = {}
  for (const c of ALL_CATALOG_FIELDSET_CLIENTS) {
    nextByClient[c] = { ...(fieldsetsByClient[c] ?? {}) }
  }

  const nextTypes = assetTypes.map((t) => {
    if (parentIdsWithChildren.has(t.id)) {
      return { ...t }
    }

    const newKey = leafFieldsetKeyForType(t.id)
    const baseKey = t.fieldset
    const clients = getFieldsetClientsForAssetType(assetTypes, t.id)

    for (const c of clients) {
      const clientMap = fieldsetsByClient[c] ?? {}
      const src =
        clientMap[baseKey] ??
        clientMap["Procore Default"] ??
        ({ name: "Procore Default", sections: [] } as FieldsetData)
      const clone = JSON.parse(JSON.stringify(src)) as FieldsetData
      const label = t.name.trim() || t.code || t.id
      clone.name = `${label} Fieldset ${c}`
      nextByClient[c][newKey] = clone
    }

    return { ...t, fieldset: newKey }
  })

  return { assetTypes: nextTypes, fieldsetsByClient: nextByClient }
}

/**
 * Company catalog: data center (AWS, Meta, Oracle) plus residential, hospital, and airport verticals with
 * their own client sets. Published maps are sparse per client; flat `fieldsets` merges all keys for tools.
 */
export function buildMultiVerticalCompanyCatalog(): TemplateAssetConfig {
  const dc = buildSharedDatacenterMultiClientCatalog()

  const verticalPayloads = VERTICALS.map((v) => {
    const { assetTypes: rawTypes, fieldsets: rawFs } = getTemplateSourceData(v.templateId)
    return {
      rawTypes,
      fieldsets: rawFs,
      prefix: v.prefix,
      root: v.root,
      fieldsetClients: v.fieldsetClients,
    }
  })

  let allTypes = [...dc.assetTypes]
  for (const p of verticalPayloads) {
    allTypes = allTypes.concat(verticalAssetTypes(p.rawTypes, p.prefix, p.root))
  }
  allTypes = forceNonLeafFieldsetToProcoreDefault(allTypes)

  const verticalsForMerge = verticalPayloads.map((p) => ({
    fieldsets: p.fieldsets,
    prefix: p.prefix,
    fieldsetClients: p.fieldsetClients,
  }))
  const verticalsForFlat = verticalPayloads.map((p) => ({ fieldsets: p.fieldsets, prefix: p.prefix }))

  if (!dc.fieldsetsByClient) {
    let fieldsets = mergeFlatFieldsetsWithVerticals(dc.fieldsets, verticalsForFlat)
    fieldsets = pruneFlatFieldsetsToReferenced(allTypes, fieldsets)
    return { assetTypes: allTypes, fieldsets }
  }

  let fieldsetsByClient = buildMergedFieldsetMaps(dc.fieldsetsByClient, verticalsForMerge)
  const leafAssigned = assignLeafClientSpecificFieldsets(allTypes, fieldsetsByClient)
  allTypes = leafAssigned.assetTypes
  fieldsetsByClient = leafAssigned.fieldsetsByClient
  fieldsetsByClient = pruneFieldsetsByClientToReferenced(allTypes, fieldsetsByClient)

  return syncFlatFieldsetsFromPrimaryClient({
    assetTypes: allTypes,
    fieldsets: {},
    fieldsetsByClient,
  })
}
