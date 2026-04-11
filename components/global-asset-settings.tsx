"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Lock,
  Download,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import type { AssetType, FieldsetData } from "@/app/page"
import type { TemplateAssetConfig } from "@/components/asset-template-detail"
import { AssetTypeSheet } from "@/components/asset-type-sheet"
import { AssetTypesTable } from "@/components/asset-types-table"
import { cn } from "@/lib/utils"
import { buildDeepHierarchyClassificationCsv } from "@/lib/export-deep-hierarchy-csv"
import { fieldsetKeyFromDisplayName } from "@/lib/fieldset-name-key"
import { COMPANY_FIELDSET_CLIENTS } from "@/lib/build-multi-hierarchy-global-catalog"
import { AssignFieldsetToTypesDialog } from "@/components/assign-fieldset-to-types-dialog"
import { AssignTemplatesDialog } from "@/components/assign-templates-dialog"
import type { AssetTemplate } from "@/components/asset-templates-table"
import { COMPANY_PROJECTS } from "@/lib/company-projects"
import { countProjectsUsingFieldsetKey } from "@/lib/project-fieldset-keys"
import {
  getAssetTypesVisibleForTemplate,
  isFieldsetRowAssignedToTemplate,
  catalogHasAnyFieldsetAssignmentForTemplate,
} from "@/lib/template-assigned-catalog"
import { getEffectiveAssetTypeTemplateIds } from "@/lib/default-company-template"
import {
  pruneFieldsetTemplateAssignmentsOneRowPerLogicalKeyAndTemplate,
  syncFieldsetTemplateAssignmentsWithAssetTypes,
} from "@/lib/sync-fieldset-template-assignments-with-types"
import {
  fieldsetTemplateAssignmentStorageKey,
  getFieldsetTemplateAssignmentList,
  mergeTemplateIdsIntoFieldsetAssignmentStorage,
  parseFieldsetTemplateAssignmentStorageKey,
  uniqueFieldsetKeysForAssetTypeIds,
} from "@/lib/fieldset-template-assignment-keys"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type GlobalTab =
  | "types"
  | "fieldsets"
  | "customFields"
  | "defaultFields"
  | "statusGroups"

const COMPANY_SETTINGS_TABS: { id: GlobalTab; label: string }[] = [
  { id: "types", label: "Types" },
  { id: "fieldsets", label: "Fieldsets" },
  { id: "customFields", label: "Custom Fields" },
  { id: "defaultFields", label: "Default Fields" },
  { id: "statusGroups", label: "Status Groups" },
]

const TEMPLATE_CATALOG_TABS: { id: GlobalTab; label: string }[] = [
  { id: "types", label: "Types" },
  { id: "fieldsets", label: "Fieldsets" },
]

function countTypesUsingFieldset(types: AssetType[], fieldsetKey: string): number {
  return types.filter((t) => t.fieldset === fieldsetKey).length
}

/**
 * True if at least one selected template has no asset types that use this fieldset and are
 * assigned to that template (effective type→template assignments). Otherwise saving
 * [Procore Default + DNATA] would look “covered” because types match default only.
 */
function someSelectedTemplateLacksTypesForFieldset(
  types: AssetType[],
  fieldsetKey: string,
  templateIdsBeingSaved: string[],
  assetTypeTemplateAssignments: Record<string, string[]> | undefined
): boolean {
  if (templateIdsBeingSaved.length === 0) return false
  return templateIdsBeingSaved.some((tid) => {
    const n = types.filter((t) => {
      if (t.fieldset !== fieldsetKey) return false
      return getEffectiveAssetTypeTemplateIds(assetTypeTemplateAssignments, t.id).includes(tid)
    }).length
    return n === 0
  })
}

function removeTypeAndDescendants(types: AssetType[], rootId: string): AssetType[] {
  const remove = collectTypeIdsInSubtree(types, rootId)
  return types.filter((t) => !remove.has(t.id))
}

/** Root id plus every descendant (for bulk selection: parent selects whole subtree). */
function collectTypeIdsInSubtree(types: AssetType[], rootId: string): Set<string> {
  const ids = new Set<string>()
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()!
    ids.add(id)
    for (const t of types) {
      if (t.parentId === id) stack.push(t.id)
    }
  }
  return ids
}

type TypeEditCtx = {
  asset: AssetType | null
}

const COMPANY_PROJECT_IDS = COMPANY_PROJECTS.map((p) => p.id)

type GlobalFieldsetDisplayRow = {
  rowId: string
  fieldsetKey: string
  /** Which client this row represents; null for single-catalog or shared default row. */
  clientId: string | null
  data: FieldsetData
  displayName: string
  assigned: number
  totalTypes: number
  /** For delete guard only (not shown in the table). */
  projectsUsingCount: number
  locked: boolean
}

type FieldsetAssignDialogState =
  | null
  | { mode: "single"; row: GlobalFieldsetDisplayRow }
  | {
      mode: "bulk"
      choices: { fieldsetKey: string; displayName: string }[]
      activeKey: string
    }

function formatFieldsetLastModified(data: FieldsetData): string {
  const iso = data.updatedAt
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    const dateStr = d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
    const timeStr = d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
    const tz =
      Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
        .formatToParts(d)
        .find((p) => p.type === "timeZoneName")?.value ?? ""
    const by = data.updatedBy?.trim()
    if (!by) return `${dateStr} at ${timeStr}${tz ? ` ${tz}` : ""}`
    return `${dateStr} at ${timeStr}${tz ? ` ${tz}` : ""} by ${by}`
  } catch {
    return "—"
  }
}

function stampFieldsetMeta(data: FieldsetData): FieldsetData {
  return {
    ...data,
    updatedAt: new Date().toISOString(),
    updatedBy: "You",
  }
}

type TemplateAssignTarget =
  | { scope: "fieldset"; keys: string[] }
  | { scope: "assetType"; typeIds: string[] }

type PendingFieldsetAutoSyncSave = {
  target: TemplateAssignTarget
  templateIds: string[]
  fieldsets: Set<string>
  fieldsetLabels: string[]
}

export interface GlobalAssetSettingsProps {
  templates: AssetTemplate[]
  globalCatalog: TemplateAssetConfig
  onUpdateGlobalCatalog: (updater: (prev: TemplateAssetConfig) => TemplateAssetConfig) => void
  /** Company catalog only: create a template from the assign dialog without leaving it. */
  onCreateTemplate?: (name: string) => AssetTemplate
  /**
   * When set, lists only asset types and fieldsets assigned to this template (company catalog).
   * Use `embedded` when this block sits under another page header (e.g. template detail).
   */
  templateView?: { templateId: string; embedded?: boolean }
}

export function GlobalAssetSettings({
  templates,
  globalCatalog,
  onUpdateGlobalCatalog,
  onCreateTemplate,
  templateView,
}: GlobalAssetSettingsProps) {
  const isTemplateView = !!templateView
  const [activeTab, setActiveTab] = useState<GlobalTab>("types")
  const [search, setSearch] = useState("")

  const [typeSheetOpen, setTypeSheetOpen] = useState(false)
  const [editCtx, setEditCtx] = useState<TypeEditCtx | null>(null)

  const [fieldsetSheetOpen, setFieldsetSheetOpen] = useState(false)
  const [fieldsetCtx, setFieldsetCtx] = useState<{
    fieldsetKey: string
    data: FieldsetData
  } | null>(null)

  const [createFieldsetOpen, setCreateFieldsetOpen] = useState(false)
  const [newFieldsetName, setNewFieldsetName] = useState("")
  const [newFieldsetKeyOverride, setNewFieldsetKeyOverride] = useState("")

  const [assignDialog, setAssignDialog] = useState<FieldsetAssignDialogState>(null)
  const [assignSelectedIds, setAssignSelectedIds] = useState<Set<string>>(() => new Set())
  const [fieldsetRowSelection, setFieldsetRowSelection] = useState<Set<string>>(() => new Set())
  const [typeRowSelection, setTypeRowSelection] = useState<Set<string>>(() => new Set())
  const [templateAssignOpen, setTemplateAssignOpen] = useState(false)
  const [templateAssignTarget, setTemplateAssignTarget] = useState<TemplateAssignTarget | null>(null)

  const [fieldsetAutoSyncAlertOpen, setFieldsetAutoSyncAlertOpen] = useState(false)
  const [pendingFieldsetAutoSyncSave, setPendingFieldsetAutoSyncSave] =
    useState<PendingFieldsetAutoSyncSave | null>(null)
  const pendingFieldsetAutoSyncRef = useRef<PendingFieldsetAutoSyncSave | null>(null)

  /** Which client&apos;s fieldset definition is edited in the fieldset sheet (no top-level client tabs). */
  const [fieldsetSheetClient, setFieldsetSheetClient] = useState<string>(COMPANY_FIELDSET_CLIENTS[0])

  const assetTypes = isTemplateView
    ? getAssetTypesVisibleForTemplate(globalCatalog, templateView!.templateId)
    : globalCatalog.assetTypes
  const fieldsetsByClient = globalCatalog.fieldsetsByClient

  /** Primary (synced) fieldset map — same keys as per-client maps; used for type editor and export. */
  const primaryFieldsets = globalCatalog.fieldsets

  const totalTemplates = templates.length

  const filteredGlobalTypes = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return assetTypes
    const byId = new Map(assetTypes.map((a) => [a.id, a]))
    const include = new Set<string>()
    const fieldsetSearchLabels = (key: string) => {
      if (!fieldsetsByClient) return primaryFieldsets[key]?.name ?? ""
      return COMPANY_FIELDSET_CLIENTS.map((c) => fieldsetsByClient[c]?.[key]?.name ?? "").join(" ")
    }
    const matches = (a: AssetType) => {
      const fsLabel = fieldsetSearchLabels(a.fieldset)
      const hay =
        `${a.name} ${a.code} ${a.description} ${a.fieldset} ${fsLabel} ${a.statusGroup}`.toLowerCase()
      return hay.includes(q)
    }
    for (const a of assetTypes) {
      if (!matches(a)) continue
      let cur: AssetType | undefined = a
      while (cur) {
        include.add(cur.id)
        const parentId: string | undefined = cur.parentId
        cur = parentId ? byId.get(parentId) : undefined
      }
    }
    return assetTypes.filter((t) => include.has(t.id))
  }, [assetTypes, search, fieldsetsByClient, primaryFieldsets])

  const visibleTypeIds = useMemo(
    () => filteredGlobalTypes.map((t) => t.id),
    [filteredGlobalTypes]
  )

  const effectiveAssetTypeTemplateAssignments = useMemo(() => {
    const m = globalCatalog.assetTypeTemplateAssignments ?? {}
    const out: Record<string, string[]> = {}
    for (const t of globalCatalog.assetTypes) {
      out[t.id] = getEffectiveAssetTypeTemplateIds(m, t.id)
    }
    return out
  }, [globalCatalog.assetTypes, globalCatalog.assetTypeTemplateAssignments])

  const templateAssignInitialIds = useMemo(() => {
    if (!templateAssignTarget) return []
    const fa = globalCatalog.fieldsetTemplateAssignments
    const hasFieldsetsByClient = !!globalCatalog.fieldsetsByClient
    if (templateAssignTarget.scope === "fieldset") {
      const acc = new Set<string>()
      for (const k of templateAssignTarget.keys) {
        const parsed = parseFieldsetTemplateAssignmentStorageKey(k, COMPANY_FIELDSET_CLIENTS)
        for (const id of getFieldsetTemplateAssignmentList(
          fa,
          parsed.fieldsetKey,
          parsed.clientId,
          hasFieldsetsByClient
        )) {
          acc.add(id)
        }
      }
      return [...acc]
    }
    const acc = new Set<string>()
    const at = globalCatalog.assetTypeTemplateAssignments
    for (const tid of templateAssignTarget.typeIds) {
      for (const id of getEffectiveAssetTypeTemplateIds(at, tid)) acc.add(id)
    }
    return [...acc]
  }, [templateAssignTarget, globalCatalog])

  const takenFieldsetKeys = useMemo(() => new Set(Object.keys(primaryFieldsets)), [primaryFieldsets])

  const previewNewFieldsetKey = useMemo(() => {
    const name = newFieldsetName.trim()
    const override = newFieldsetKeyOverride.trim()
    if (!name && !override) return ""
    if (override) return fieldsetKeyFromDisplayName(override, takenFieldsetKeys)
    return fieldsetKeyFromDisplayName(name, takenFieldsetKeys)
  }, [newFieldsetName, newFieldsetKeyOverride, takenFieldsetKeys])

  const globalFieldsetDisplayRows = useMemo((): GlobalFieldsetDisplayRow[] => {
    const q = search.trim().toLowerCase()
    const totalTypes = assetTypes.length
    const rows: GlobalFieldsetDisplayRow[] = []
    const keys = Object.keys(primaryFieldsets).sort((a, b) => {
      const na = primaryFieldsets[a]?.name || a
      const nb = primaryFieldsets[b]?.name || b
      return na.localeCompare(nb)
    })

    for (const fieldsetKey of keys) {
      const assigned = countTypesUsingFieldset(assetTypes, fieldsetKey)
      const projectsUsingCount = countProjectsUsingFieldsetKey(
        globalCatalog,
        fieldsetKey,
        COMPANY_PROJECT_IDS
      )
      const baseData = primaryFieldsets[fieldsetKey]

      if (!fieldsetsByClient) {
        const displayName = baseData.name || fieldsetKey
        if (q && !`${fieldsetKey} ${displayName}`.toLowerCase().includes(q)) continue
        rows.push({
          rowId: fieldsetKey,
          fieldsetKey,
          clientId: null,
          data: baseData,
          displayName,
          assigned,
          totalTypes,
          projectsUsingCount,
          locked: fieldsetKey === "Procore Default",
        })
        continue
      }

      if (fieldsetKey === "Procore Default") {
        const displayName = baseData.name || fieldsetKey
        if (q && !`${fieldsetKey} ${displayName}`.toLowerCase().includes(q)) continue
        rows.push({
          rowId: fieldsetKey,
          fieldsetKey,
          clientId: null,
          data: baseData,
          displayName,
          assigned,
          totalTypes,
          projectsUsingCount,
          locked: true,
        })
        continue
      }

      for (const c of COMPANY_FIELDSET_CLIENTS) {
        const clientMap = fieldsetsByClient[c]
        if (!clientMap || !Object.prototype.hasOwnProperty.call(clientMap, fieldsetKey)) {
          continue
        }
        const data = clientMap[fieldsetKey]
        const displayName = data.name || fieldsetKey
        if (q) {
          const hay = `${fieldsetKey} ${displayName} ${c}`.toLowerCase()
          if (!hay.includes(q)) continue
        }
        rows.push({
          rowId: `${fieldsetKey}__${c}`,
          fieldsetKey,
          clientId: c,
          data,
          displayName,
          assigned,
          totalTypes,
          projectsUsingCount,
          locked: false,
        })
      }
    }

    rows.sort((a, b) => {
      const aDef = a.fieldsetKey === "Procore Default" ? 0 : 1
      const bDef = b.fieldsetKey === "Procore Default" ? 0 : 1
      if (aDef !== bDef) return aDef - bDef
      return a.displayName.localeCompare(b.displayName)
    })
    if (templateView) {
      return rows.filter((r) =>
        isFieldsetRowAssignedToTemplate(globalCatalog, templateView!.templateId, r)
      )
    }
    return rows
  }, [assetTypes, primaryFieldsets, fieldsetsByClient, search, globalCatalog, templateView])

  const fieldsetVisibleRowIds = useMemo(
    () => globalFieldsetDisplayRows.map((r) => r.rowId),
    [globalFieldsetDisplayRows]
  )
  const allFieldsetRowsSelected =
    fieldsetVisibleRowIds.length > 0 &&
    fieldsetVisibleRowIds.every((id) => fieldsetRowSelection.has(id))
  const someFieldsetRowsSelected =
    fieldsetVisibleRowIds.some((id) => fieldsetRowSelection.has(id)) && !allFieldsetRowsSelected

  const assignDialogFieldsetKey =
    assignDialog?.mode === "single"
      ? assignDialog.row.fieldsetKey
      : assignDialog?.mode === "bulk"
        ? assignDialog.activeKey
        : ""
  const assignDialogDisplayName =
    assignDialog?.mode === "single"
      ? assignDialog.row.displayName
      : assignDialog?.mode === "bulk"
        ? assignDialog.choices.find((c) => c.fieldsetKey === assignDialog.activeKey)?.displayName ?? ""
        : ""

  useEffect(() => {
    if (activeTab !== "fieldsets") setFieldsetRowSelection(new Set())
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== "types") setTypeRowSelection(new Set())
  }, [activeTab])

  useEffect(() => {
    if (
      isTemplateView &&
      activeTab !== "types" &&
      activeTab !== "fieldsets"
    ) {
      setActiveTab("types")
    }
  }, [isTemplateView, activeTab])

  const handleExportCsv = () => {
    const csv = buildDeepHierarchyClassificationCsv({
      assetTypes,
      fieldsets: primaryFieldsets,
      customFieldMappings: [],
    })
    const normalized = csv.replace(/^\uFEFF/, "")
    const dataLines = normalized.split(/\r?\n/).filter((l) => l.trim())
    if (dataLines.length <= 1) {
      alert("Nothing to export for asset settings.")
      return
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "Asset_Classification_Deep_Hierarchy_Asset_Settings.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSaveType = (data: {
    name: string
    code: string
    description: string
    isAssembly?: boolean
    fieldset?: string
  }) => {
    if (!editCtx) return
    const fsKey = data.fieldset ?? "Procore Default"

    const fsMap = (p: TemplateAssetConfig) => p.fieldsets

    if (!editCtx.asset) {
      onUpdateGlobalCatalog((prev) => {
        const map = fsMap(prev)
        const safeFs = fsKey in map ? fsKey : "Procore Default"
        const newAsset: AssetType = {
          id: `type-${Date.now()}`,
          name: data.name,
          code: data.code,
          description: data.description,
          fieldset: safeFs,
          statusGroup: "Procore Default",
          isAssembly: data.isAssembly ?? false,
        }
        const newTypes = [...prev.assetTypes, newAsset]
        const fsSynced = syncFieldsetTemplateAssignmentsWithAssetTypes(
          prev.fieldsetTemplateAssignments ?? {},
          newTypes,
          prev.assetTypeTemplateAssignments,
          COMPANY_FIELDSET_CLIENTS,
          undefined
        )
        return {
          ...prev,
          assetTypes: newTypes,
          fieldsetTemplateAssignments: fsSynced,
        }
      })
      setTypeSheetOpen(false)
      setEditCtx(null)
      return
    }

    const typeId = editCtx.asset.id
    onUpdateGlobalCatalog((prev) => {
      const map = fsMap(prev)
      const safeFs = fsKey in map ? fsKey : "Procore Default"
      const newTypes = prev.assetTypes.map((x) =>
        x.id === typeId
          ? {
              ...x,
              name: data.name,
              code: data.code,
              description: data.description,
              isAssembly: data.isAssembly ?? false,
              fieldset: safeFs,
            }
          : x
      )
      const fsSynced = syncFieldsetTemplateAssignmentsWithAssetTypes(
        prev.fieldsetTemplateAssignments ?? {},
        newTypes,
        prev.assetTypeTemplateAssignments,
        COMPANY_FIELDSET_CLIENTS,
        undefined
      )
      return {
        ...prev,
        assetTypes: newTypes,
        fieldsetTemplateAssignments: fsSynced,
      }
    })
    setTypeSheetOpen(false)
    setEditCtx(null)
  }

  const openCreateType = () => {
    setEditCtx({ asset: null })
    setTypeSheetOpen(true)
  }

  const openEditFromGlobal = (a: AssetType) => {
    setEditCtx({ asset: a })
    setTypeSheetOpen(true)
  }

  const handleAddSubtype = (parentId: string) => {
    const parent = assetTypes.find((x) => x.id === parentId)
    if (!parent) return
    const newId = `${parentId}-ns-${Date.now()}`
    const newSubtype: AssetType = {
      id: newId,
      name: "New Subtype",
      code: `${parent.code}.`,
      description: "",
      fieldset: parent.fieldset,
      statusGroup: parent.statusGroup,
      parentId,
      isAssembly: false,
    }
    onUpdateGlobalCatalog((prev) => {
      const newTypes = [
        ...prev.assetTypes.map((a) => (a.id === parentId ? { ...a, hasSubtypes: true } : a)),
        newSubtype,
      ]
      const fsSynced = syncFieldsetTemplateAssignmentsWithAssetTypes(
        prev.fieldsetTemplateAssignments ?? {},
        newTypes,
        prev.assetTypeTemplateAssignments,
        COMPANY_FIELDSET_CLIENTS,
        undefined
      )
      return {
        ...prev,
        assetTypes: newTypes,
        fieldsetTemplateAssignments: fsSynced,
      }
    })
    setEditCtx({ asset: newSubtype })
    setTypeSheetOpen(true)
  }

  const onDeleteGlobal = (id: string) => {
    onUpdateGlobalCatalog((prev) => {
      const newTypes = removeTypeAndDescendants(prev.assetTypes, id)
      const fsSynced = syncFieldsetTemplateAssignmentsWithAssetTypes(
        prev.fieldsetTemplateAssignments ?? {},
        newTypes,
        prev.assetTypeTemplateAssignments,
        COMPANY_FIELDSET_CLIENTS,
        undefined
      )
      return {
        ...prev,
        assetTypes: newTypes,
        fieldsetTemplateAssignments: fsSynced,
      }
    })
  }

  const openAssignFieldset = (row: GlobalFieldsetDisplayRow) => {
    setAssignDialog({ mode: "single", row })
    setAssignSelectedIds(
      new Set(assetTypes.filter((a) => a.fieldset === row.fieldsetKey).map((a) => a.id))
    )
  }

  const openBulkAssignFromFieldsetSelection = () => {
    const rows = globalFieldsetDisplayRows.filter((r) => fieldsetRowSelection.has(r.rowId))
    if (rows.length === 0) return
    const byKey = new Map<string, string>()
    for (const r of rows) {
      if (!byKey.has(r.fieldsetKey)) byKey.set(r.fieldsetKey, r.displayName)
    }
    const choices = [...byKey.entries()].map(([fieldsetKey, displayName]) => ({
      fieldsetKey,
      displayName,
    }))
    choices.sort((a, b) => a.displayName.localeCompare(b.displayName))
    const activeKey = choices[0]!.fieldsetKey
    setAssignDialog({ mode: "bulk", choices, activeKey })
    setAssignSelectedIds(
      new Set(assetTypes.filter((a) => a.fieldset === activeKey).map((a) => a.id))
    )
  }

  const openTemplateAssignForFieldsetRow = (row: GlobalFieldsetDisplayRow) => {
    const key = fieldsetTemplateAssignmentStorageKey(row.fieldsetKey, row.clientId)
    setTemplateAssignTarget({ scope: "fieldset", keys: [key] })
    setTemplateAssignOpen(true)
  }

  const openBulkTemplateAssignForSelectedFieldsets = () => {
    const rows = globalFieldsetDisplayRows.filter((r) => fieldsetRowSelection.has(r.rowId))
    const keys = [
      ...new Set(rows.map((r) => fieldsetTemplateAssignmentStorageKey(r.fieldsetKey, r.clientId))),
    ]
    if (keys.length === 0) return
    setTemplateAssignTarget({ scope: "fieldset", keys })
    setTemplateAssignOpen(true)
  }

  const openTemplateAssignForAssetType = (typeId: string) => {
    setTemplateAssignTarget({ scope: "assetType", typeIds: [typeId] })
    setTemplateAssignOpen(true)
  }

  const openBulkTemplateAssignForSelectedTypes = () => {
    const typeIds = [...typeRowSelection]
    if (typeIds.length === 0) return
    setTemplateAssignTarget({ scope: "assetType", typeIds })
    setTemplateAssignOpen(true)
  }

  const commitTemplateAssignmentsSave = useCallback(
    (
      target: TemplateAssignTarget,
      templateIds: string[],
      autoSyncTemplatesOntoFieldsetTypes: Set<string> | null,
      mergeTemplatesOntoFieldsetRows = false
    ) => {
      onUpdateGlobalCatalog((prev) => {
        if (target.scope === "fieldset") {
          const nextFs: Record<string, string[]> = {
            ...(prev.fieldsetTemplateAssignments ?? {}),
          }
          for (const k of target.keys) {
            if (templateIds.length === 0) delete nextFs[k]
            else nextFs[k] = templateIds
          }
          if (prev.fieldsetsByClient && templateIds.length > 0) {
            for (const k of target.keys) {
              const { fieldsetKey, clientId } = parseFieldsetTemplateAssignmentStorageKey(
                k,
                COMPANY_FIELDSET_CLIENTS
              )
              if (clientId) delete nextFs[fieldsetKey]
            }
          }
          let mergedFs = pruneFieldsetTemplateAssignmentsOneRowPerLogicalKeyAndTemplate(
            nextFs,
            COMPANY_FIELDSET_CLIENTS,
            target.keys
          )

          let nextAt: Record<string, string[]> | undefined
          if (
            autoSyncTemplatesOntoFieldsetTypes &&
            autoSyncTemplatesOntoFieldsetTypes.size > 0 &&
            templateIds.length > 0
          ) {
            const atPrev = prev.assetTypeTemplateAssignments ?? {}
            nextAt = { ...atPrev }
            for (const t of prev.assetTypes) {
              if (!autoSyncTemplatesOntoFieldsetTypes.has(t.fieldset)) continue
              const cur = getEffectiveAssetTypeTemplateIds(atPrev, t.id)
              const merged = [...new Set([...cur, ...templateIds])]
              nextAt[t.id] = merged
            }
            const atFinal =
              Object.keys(nextAt).length > 0 ? nextAt : undefined
            mergedFs =
              syncFieldsetTemplateAssignmentsWithAssetTypes(
                mergedFs,
                prev.assetTypes,
                atFinal,
                COMPANY_FIELDSET_CLIENTS,
                target.keys
              ) ?? {}
          }

          const fsOut =
            Object.keys(mergedFs).length > 0 ? mergedFs : undefined
          return {
            ...prev,
            fieldsetTemplateAssignments: fsOut,
            ...(nextAt !== undefined
              ? {
                  assetTypeTemplateAssignments:
                    Object.keys(nextAt).length > 0 ? nextAt : undefined,
                }
              : {}),
          }
        }
        const next: Record<string, string[]> = {
          ...(prev.assetTypeTemplateAssignments ?? {}),
        }
        for (const tid of target.typeIds) {
          if (templateIds.length === 0) delete next[tid]
          else next[tid] = templateIds
        }
        const atFinal = Object.keys(next).length > 0 ? next : undefined

        const nextAssetTypes = prev.assetTypes

        let fsBase = prev.fieldsetTemplateAssignments ?? {}
        if (mergeTemplatesOntoFieldsetRows && templateIds.length > 0) {
          const logicalKeys = uniqueFieldsetKeysForAssetTypeIds(
            target.typeIds,
            nextAssetTypes
          )
          if (logicalKeys.length > 0) {
            fsBase = mergeTemplateIdsIntoFieldsetAssignmentStorage(
              prev.fieldsetTemplateAssignments,
              logicalKeys,
              templateIds,
              {
                fieldsets: prev.fieldsets,
                fieldsetsByClient: prev.fieldsetsByClient,
              },
              COMPANY_FIELDSET_CLIENTS
            )
          }
        }
        const fsSynced = syncFieldsetTemplateAssignmentsWithAssetTypes(
          fsBase,
          nextAssetTypes,
          atFinal,
          COMPANY_FIELDSET_CLIENTS,
          undefined
        )
        return {
          ...prev,
          assetTypes: nextAssetTypes,
          assetTypeTemplateAssignments: atFinal,
          fieldsetTemplateAssignments: fsSynced,
        }
      })
      const multi =
        target.scope === "fieldset"
          ? target.keys.length > 1
          : target.typeIds.length > 1
      if (multi) {
        if (target.scope === "fieldset") setFieldsetRowSelection(new Set())
        else setTypeRowSelection(new Set())
      }
      setTemplateAssignOpen(false)
      setTemplateAssignTarget(null)
    },
    [onUpdateGlobalCatalog]
  )

  const finalizeFieldsetAutoSyncAlert = (withAutoSync: boolean) => {
    const p = pendingFieldsetAutoSyncRef.current
    pendingFieldsetAutoSyncRef.current = null
    setPendingFieldsetAutoSyncSave(null)
    if (!p) return
    commitTemplateAssignmentsSave(
      p.target,
      p.templateIds,
      withAutoSync ? p.fieldsets : null
    )
    setFieldsetAutoSyncAlertOpen(false)
  }

  const onFieldsetAutoSyncAlertOpenChange = useCallback(
    (open: boolean) => {
      setFieldsetAutoSyncAlertOpen(open)
      if (!open && pendingFieldsetAutoSyncRef.current) {
        const p = pendingFieldsetAutoSyncRef.current
        pendingFieldsetAutoSyncRef.current = null
        setPendingFieldsetAutoSyncSave(null)
        commitTemplateAssignmentsSave(p.target, p.templateIds, null)
      }
    },
    [commitTemplateAssignmentsSave]
  )

  const handleSaveTemplateAssignments = (
    templateIds: string[],
    meta?: { includeFieldsets?: boolean }
  ): boolean => {
    if (!templateAssignTarget) return true

    if (templateAssignTarget.scope === "fieldset" && templateIds.length > 0) {
      const at = globalCatalog.assetTypeTemplateAssignments
      const allTypes = globalCatalog.assetTypes
      const fieldsetsNeedingTypeSync = new Set<string>()
      for (const k of templateAssignTarget.keys) {
        const { fieldsetKey } = parseFieldsetTemplateAssignmentStorageKey(
          k,
          COMPANY_FIELDSET_CLIENTS
        )
        if (someSelectedTemplateLacksTypesForFieldset(allTypes, fieldsetKey, templateIds, at)) {
          fieldsetsNeedingTypeSync.add(fieldsetKey)
        }
      }
      if (fieldsetsNeedingTypeSync.size > 0) {
        const fieldsetLabels = [...fieldsetsNeedingTypeSync].map(
          (fk) => primaryFieldsets[fk]?.name || fk
        )
        const payload: PendingFieldsetAutoSyncSave = {
          target: templateAssignTarget,
          templateIds,
          fieldsets: fieldsetsNeedingTypeSync,
          fieldsetLabels,
        }
        pendingFieldsetAutoSyncRef.current = payload
        setPendingFieldsetAutoSyncSave(payload)
        setFieldsetAutoSyncAlertOpen(true)
        return false
      }
    }

    commitTemplateAssignmentsSave(
      templateAssignTarget,
      templateIds,
      null,
      templateAssignTarget.scope === "assetType" && meta?.includeFieldsets === true
    )
    return true
  }

  const toggleSelectAllVisibleFieldsets = (select: boolean) => {
    setFieldsetRowSelection((prev) => {
      const next = new Set(prev)
      if (select) {
        for (const id of fieldsetVisibleRowIds) next.add(id)
      } else {
        for (const id of fieldsetVisibleRowIds) next.delete(id)
      }
      return next
    })
  }

  const openEditFieldset = (row: GlobalFieldsetDisplayRow) => {
    const effectiveClient = fieldsetsByClient
      ? (row.clientId ?? COMPANY_FIELDSET_CLIENTS[0])
      : null
    if (fieldsetsByClient && effectiveClient) {
      setFieldsetSheetClient(effectiveClient)
    }
    const src =
      (effectiveClient && fieldsetsByClient?.[effectiveClient]?.[row.fieldsetKey]) ??
      primaryFieldsets[row.fieldsetKey] ??
      row.data
    setFieldsetCtx({
      fieldsetKey: row.fieldsetKey,
      data: JSON.parse(JSON.stringify(src)) as FieldsetData,
    })
    setFieldsetSheetOpen(true)
  }

  const saveFieldsetSheet = () => {
    if (!fieldsetCtx) return
    const { fieldsetKey, data } = fieldsetCtx
    const stamped = stampFieldsetMeta({
      ...data,
      name: data.name || fieldsetKey,
    })
    onUpdateGlobalCatalog((prev) => {
      if (!prev.fieldsetsByClient) {
        return {
          ...prev,
          fieldsets: {
            ...prev.fieldsets,
            [fieldsetKey]: stamped,
          },
        }
      }
      return {
        ...prev,
        fieldsetsByClient: {
          ...prev.fieldsetsByClient,
          [fieldsetSheetClient]: {
            ...prev.fieldsetsByClient[fieldsetSheetClient],
            [fieldsetKey]: stamped,
          },
        },
      }
    })
    setFieldsetSheetOpen(false)
    setFieldsetCtx(null)
  }

  const duplicateFieldset = (row: GlobalFieldsetDisplayRow) => {
    if (row.locked) return
    const newKey = `${row.fieldsetKey}_Copy_${Date.now()}`
    onUpdateGlobalCatalog((prev) => {
      if (!prev.fieldsetsByClient) {
        const copy: FieldsetData = JSON.parse(JSON.stringify(row.data))
        copy.name = `${row.data.name || row.fieldsetKey} (Copy)`
        return {
          ...prev,
          fieldsets: { ...prev.fieldsets, [newKey]: stampFieldsetMeta(copy) },
        }
      }
      const nextBy = { ...prev.fieldsetsByClient }
      for (const c of COMPANY_FIELDSET_CLIENTS) {
        const src = nextBy[c]?.[row.fieldsetKey]
        if (!src) continue
        const ccopy: FieldsetData = JSON.parse(JSON.stringify(src))
        ccopy.name = `${ccopy.name || row.fieldsetKey} (Copy)`
        nextBy[c] = { ...nextBy[c], [newKey]: stampFieldsetMeta(ccopy) }
      }
      return { ...prev, fieldsetsByClient: nextBy }
    })
  }

  const deleteFieldset = (row: GlobalFieldsetDisplayRow) => {
    if (row.locked) return
    if (countTypesUsingFieldset(assetTypes, row.fieldsetKey) > 0) return
    if (row.projectsUsingCount > 0) return
    onUpdateGlobalCatalog((prev) => {
      if (!prev.fieldsetsByClient) {
        const { [row.fieldsetKey]: _removed, ...rest } = prev.fieldsets
        return { ...prev, fieldsets: rest }
      }
      const nextBy: Record<string, Record<string, FieldsetData>> = { ...prev.fieldsetsByClient }
      for (const c of COMPANY_FIELDSET_CLIENTS) {
        if (!nextBy[c]) continue
        const { [row.fieldsetKey]: _r, ...rest } = nextBy[c]
        nextBy[c] = rest
      }
      return { ...prev, fieldsetsByClient: nextBy }
    })
  }

  const confirmCreateFieldsetKey = (): string | null => {
    const name = newFieldsetName.trim()
    if (!name) return null
    const override = newFieldsetKeyOverride.trim()
    if (override) {
      return fieldsetKeyFromDisplayName(override, takenFieldsetKeys)
    }
    return fieldsetKeyFromDisplayName(name, takenFieldsetKeys)
  }

  const applyAssignFieldset = () => {
    const key =
      assignDialog?.mode === "single"
        ? assignDialog.row.fieldsetKey
        : assignDialog?.mode === "bulk"
          ? assignDialog.activeKey
          : null
    if (!key) return
    onUpdateGlobalCatalog((prev) => {
      const map = prev.fieldsets
      const safe = key in map ? key : "Procore Default"
      const newTypes = prev.assetTypes.map((a) => {
        const should = assignSelectedIds.has(a.id)
        if (should) {
          // One fieldset per type: assigning replaces any previous fieldset key.
          return a.fieldset === safe ? a : { ...a, fieldset: safe }
        }
        if (a.fieldset === key) {
          return { ...a, fieldset: "Procore Default" }
        }
        return a
      })
      const fsSynced = syncFieldsetTemplateAssignmentsWithAssetTypes(
        prev.fieldsetTemplateAssignments ?? {},
        newTypes,
        prev.assetTypeTemplateAssignments,
        COMPANY_FIELDSET_CLIENTS,
        undefined
      )
      return {
        ...prev,
        assetTypes: newTypes,
        fieldsetTemplateAssignments: fsSynced,
      }
    })
    setAssignDialog(null)
    setFieldsetRowSelection(new Set())
  }

  const confirmCreateFieldset = () => {
    const name = newFieldsetName.trim()
    if (!name) return
    const key = confirmCreateFieldsetKey()
    if (!key) return
    const sections: FieldsetData["sections"] = [
      { name: "General Information", fields: ["Asset Name", "Asset Code", "Description"] },
      { name: "Technical", fields: ["Manufacturer", "Model", "Serial Number"] },
    ]
    onUpdateGlobalCatalog((prev) => {
      if (!prev.fieldsetsByClient) {
        const fresh = stampFieldsetMeta({
          name,
          sections: JSON.parse(JSON.stringify(sections)),
        })
        return { ...prev, fieldsets: { ...prev.fieldsets, [key]: fresh } }
      }
      const nextBy = { ...prev.fieldsetsByClient }
      for (const c of COMPANY_FIELDSET_CLIENTS) {
        const fd = stampFieldsetMeta({
          name: `${name} (${c})`,
          sections: JSON.parse(JSON.stringify(sections)),
        })
        nextBy[c] = { ...nextBy[c], [key]: fd }
      }
      return { ...prev, fieldsetsByClient: nextBy }
    })
    setCreateFieldsetOpen(false)
    setNewFieldsetName("")
    setNewFieldsetKeyOverride("")
  }

  const openCreateFieldset = () => {
    setNewFieldsetName("")
    setNewFieldsetKeyOverride("")
    setCreateFieldsetOpen(true)
  }

  const headerTabs = isTemplateView ? TEMPLATE_CATALOG_TABS : COMPANY_SETTINGS_TABS

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {templateView?.embedded ? (
        <header className="mb-4 flex flex-wrap items-end gap-10 border-b border-border bg-background">
          <nav
            className="flex min-w-0 flex-1 flex-wrap items-end gap-0"
            aria-label="Asset settings sections"
          >
            {headerTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-5 py-3 text-sm font-medium transition-colors border-b-2 border-transparent -mb-px",
                  activeTab === tab.id
                    ? "border-orange-500 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>
      ) : (
        <>
          <header className="flex flex-wrap items-end gap-10 border-b border-border bg-background">
            {!isTemplateView ? (
              <h1 className="shrink-0 pb-3 text-[20px] font-bold uppercase leading-tight tracking-tight text-foreground">
                Asset settings
              </h1>
            ) : null}
            <nav
              className="flex min-w-0 flex-1 flex-wrap items-end gap-0"
              aria-label="Asset settings sections"
            >
              {headerTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "px-5 py-3 text-sm font-medium transition-colors border-b-2 border-transparent -mb-px",
                    activeTab === tab.id
                      ? "border-orange-500 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </header>
        </>
      )}

      {(activeTab === "types" || activeTab === "fieldsets") && (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="pl-9"
          />
        </div>
        {activeTab === "types" && (
          <div className="flex flex-wrap items-center gap-2">
            {!isTemplateView && typeRowSelection.size > 0 ? (
              <Button type="button" variant="outline" onClick={openBulkTemplateAssignForSelectedTypes}>
                Bulk assign to templates ({typeRowSelection.size} type{typeRowSelection.size === 1 ? "" : "s"})
              </Button>
            ) : null}
            <Button variant="outline" onClick={handleExportCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            {!isTemplateView ? (
              <Button onClick={openCreateType} className="bg-orange-500 text-white hover:bg-orange-600">
                <Plus className="mr-2 h-4 w-4" />
                Create Type
              </Button>
            ) : null}
          </div>
        )}
        {activeTab === "fieldsets" && !isTemplateView ? (
          <div className="flex flex-wrap items-center gap-2">
            {fieldsetRowSelection.size > 0 ? (
              <>
                <Button type="button" variant="outline" onClick={openBulkAssignFromFieldsetSelection}>
                  Bulk assign to types ({fieldsetRowSelection.size} fieldset
                  {fieldsetRowSelection.size === 1 ? "" : "s"})
                </Button>
                <Button type="button" variant="outline" onClick={openBulkTemplateAssignForSelectedFieldsets}>
                  Bulk assign to templates ({fieldsetRowSelection.size} fieldset
                  {fieldsetRowSelection.size === 1 ? "" : "s"})
                </Button>
              </>
            ) : null}
            <Button onClick={openCreateFieldset} className="bg-orange-500 text-white hover:bg-orange-600">
              <Plus className="mr-2 h-4 w-4" />
              + Create Fieldset
            </Button>
          </div>
        ) : null}
      </div>
      )}

      {activeTab === "types" && (
        <div className="flex min-h-0 flex-1 flex-col">
          {filteredGlobalTypes.length === 0 ? (
            <div className="rounded-lg border bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
              {assetTypes.length === 0
                ? isTemplateView
                  ? "No asset types are assigned to this template. Assign them in Asset settings (Types tab → Assigned Templates)."
                  : "No asset types in asset settings yet."
                : "No asset types match your search."}
            </div>
          ) : (
            <AssetTypesTable
              assetTypes={filteredGlobalTypes}
              allAssetTypesForAssembly={assetTypes}
              onEdit={isTemplateView ? undefined : openEditFromGlobal}
              onDelete={isTemplateView ? undefined : onDeleteGlobal}
              onAddSubtype={isTemplateView ? undefined : handleAddSubtype}
              expandAllParentRows
              fieldsetsByClient={fieldsetsByClient}
              fieldsetClientOrder={COMPANY_FIELDSET_CLIENTS}
              fieldsetFallbackFieldsets={primaryFieldsets}
              resolveFieldsetDisplay={
                fieldsetsByClient ? undefined : (k) => primaryFieldsets[k]?.name
              }
              templateRowSelection={
                isTemplateView
                  ? undefined
                  : {
                      selectedIds: typeRowSelection,
                      onToggle: (assetTypeId, selected) => {
                        setTypeRowSelection((prev) => {
                          const n = new Set(prev)
                          const subtree = collectTypeIdsInSubtree(assetTypes, assetTypeId)
                          if (selected) {
                            for (const id of subtree) n.add(id)
                          } else {
                            for (const id of subtree) n.delete(id)
                          }
                          return n
                        })
                      },
                      visibleAssetTypeIds: visibleTypeIds,
                      onSelectAllVisible: (select) => {
                        setTypeRowSelection((prev) => {
                          const n = new Set(prev)
                          if (select) {
                            for (const id of visibleTypeIds) n.add(id)
                          } else {
                            for (const id of visibleTypeIds) n.delete(id)
                          }
                          return n
                        })
                      },
                    }
              }
              assignedTemplatesColumn={
                isTemplateView
                  ? {
                      totalTemplates,
                      assignments: effectiveAssetTypeTemplateAssignments,
                      onCellClick: () => {},
                      readOnly: true,
                    }
                  : {
                      totalTemplates,
                      assignments: effectiveAssetTypeTemplateAssignments,
                      onCellClick: openTemplateAssignForAssetType,
                    }
              }
              hideActionsColumn={isTemplateView}
            />
          )}
        </div>
      )}

      {activeTab === "fieldsets" && (
        <div className="overflow-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {!isTemplateView ? (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        allFieldsetRowsSelected
                          ? true
                          : someFieldsetRowsSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(c) => toggleSelectAllVisibleFieldsets(c === true)}
                      aria-label="Select all visible fieldsets"
                    />
                  </TableHead>
                ) : null}
                <TableHead className="min-w-[200px]">Name</TableHead>
                <TableHead>Assigned Asset Types</TableHead>
                <TableHead className="min-w-[140px]">Assigned Templates</TableHead>
                <TableHead className="min-w-[220px]">Last Modified</TableHead>
                {!isTemplateView ? (
                  <TableHead className="w-[140px] text-right">Actions</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {globalFieldsetDisplayRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isTemplateView ? 4 : 6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {isTemplateView &&
                    !catalogHasAnyFieldsetAssignmentForTemplate(
                      globalCatalog,
                      templateView!.templateId
                    )
                      ? "No fieldsets are assigned to this template. Assign them in Asset settings (Fieldsets tab → Assigned Templates)."
                      : "No fieldsets match your search."}
                  </TableCell>
                </TableRow>
              ) : (
                globalFieldsetDisplayRows.map((row) => (
                  <TableRow key={row.rowId}>
                    {!isTemplateView ? (
                      <TableCell className="w-10 align-middle">
                        <Checkbox
                          checked={fieldsetRowSelection.has(row.rowId)}
                          onCheckedChange={(c) => {
                            const on = c === true
                            setFieldsetRowSelection((prev) => {
                              const n = new Set(prev)
                              if (on) n.add(row.rowId)
                              else n.delete(row.rowId)
                              return n
                            })
                          }}
                          aria-label={`Select fieldset ${row.displayName}`}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell className="font-medium">
                      {isTemplateView ? (
                        <>
                          <span className="text-sm text-foreground">{row.displayName}</span>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{row.fieldsetKey}</p>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="text-left text-sm text-primary hover:underline"
                            onClick={() => openEditFieldset(row)}
                          >
                            {row.displayName}
                          </button>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{row.fieldsetKey}</p>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {isTemplateView ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          {row.locked ? (
                            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : null}
                          {row.assigned}/{row.totalTypes || "—"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={cn(
                            "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left transition-colors",
                            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          )}
                          onClick={() => openAssignFieldset(row)}
                          title="Assign this fieldset to asset types"
                        >
                          {row.locked ? (
                            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : null}
                          <span className="text-primary underline-offset-4 hover:underline">
                            {row.assigned}/{row.totalTypes || "—"}
                          </span>
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {isTemplateView ? (
                        <span className="text-muted-foreground">
                          {getFieldsetTemplateAssignmentList(
                            globalCatalog.fieldsetTemplateAssignments,
                            row.fieldsetKey,
                            row.clientId,
                            !!fieldsetsByClient
                          ).length}
                          /{totalTemplates} Templates
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => openTemplateAssignForFieldsetRow(row)}
                          title="Assign asset templates that use this fieldset"
                        >
                          {getFieldsetTemplateAssignmentList(
                            globalCatalog.fieldsetTemplateAssignments,
                            row.fieldsetKey,
                            row.clientId,
                            !!fieldsetsByClient
                          ).length}
                          /{totalTemplates} Templates
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatFieldsetLastModified(row.data)}
                    </TableCell>
                    {!isTemplateView ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditFieldset(row)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={row.locked}
                            onClick={() => duplicateFieldset(row)}
                            title="Duplicate"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={row.locked || row.assigned > 0 || row.projectsUsingCount > 0}
                            onClick={() => deleteFieldset(row)}
                            title={
                              row.assigned > 0
                                ? "Unassign types first"
                                : row.projectsUsingCount > 0
                                  ? "Unassign projects first"
                                  : "Delete"
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {activeTab === "customFields" && !isTemplateView ? (
        <div className="rounded-lg border bg-muted/20 px-4 py-16 text-center text-sm text-muted-foreground">
          Custom Fields are not editable in this prototype. Configure custom field mappings from the main Assets
          experience when available.
        </div>
      ) : null}
      {activeTab === "defaultFields" && !isTemplateView ? (
        <div className="rounded-lg border bg-muted/20 px-4 py-16 text-center text-sm text-muted-foreground">
          Default Fields are not editable in this prototype. Standard asset fields remain defined in fieldsets and
          templates.
        </div>
      ) : null}
      {activeTab === "statusGroups" && !isTemplateView ? (
        <div className="rounded-lg border bg-muted/20 px-4 py-16 text-center text-sm text-muted-foreground">
          Status Groups are not editable in this prototype. Types continue to use their assigned status group values.
        </div>
      ) : null}

      <AssetTypeSheet
        open={typeSheetOpen}
        onOpenChange={(o) => {
          setTypeSheetOpen(o)
          if (!o) setEditCtx(null)
        }}
        assetType={editCtx?.asset ?? null}
        allAssetTypes={assetTypes}
        onSave={handleSaveType}
        fieldsets={primaryFieldsets}
        allowFieldsetAssignment
      />

      <Sheet
        open={fieldsetSheetOpen}
        onOpenChange={(o) => {
          setFieldsetSheetOpen(o)
          if (!o) setFieldsetCtx(null)
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit fieldset</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Key: <span className="font-mono">{fieldsetCtx?.fieldsetKey}</span>
            </p>
            {fieldsetsByClient ? (
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="fs-edit-client" className="text-xs text-muted-foreground">
                  Client (definitions only)
                </Label>
                <Select
                  value={fieldsetSheetClient}
                  onValueChange={(c) => {
                    setFieldsetSheetClient(c)
                    setFieldsetCtx((prev) => {
                      if (!prev || !fieldsetsByClient[c]?.[prev.fieldsetKey]) return prev
                      return {
                        fieldsetKey: prev.fieldsetKey,
                        data: JSON.parse(
                          JSON.stringify(fieldsetsByClient[c][prev.fieldsetKey])
                        ) as FieldsetData,
                      }
                    })
                  }}
                >
                  <SelectTrigger id="fs-edit-client" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_FIELDSET_CLIENTS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Fieldset keys are shared where defined; some keys exist only on clients in that hierarchy (e.g.
                  hospital types on hospital clients). Edits apply to this client&apos;s copy only.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Edits apply to this fieldset map.</p>
            )}
          </SheetHeader>
          {fieldsetCtx ? (
            <div className="mt-6 space-y-4">
              <div>
                <Label htmlFor="fs-name">Display name</Label>
                <Input
                  id="fs-name"
                  value={fieldsetCtx.data.name}
                  onChange={(e) =>
                    setFieldsetCtx((c) => (c ? { ...c, data: { ...c.data, name: e.target.value } } : null))
                  }
                />
              </div>
              {fieldsetCtx.data.sections.map((sec, si) => (
                <div key={si} className="rounded-md border p-3">
                  <Label>Section: {sec.name}</Label>
                  <Input
                    className="mt-2"
                    value={sec.name}
                    onChange={(e) =>
                      setFieldsetCtx((c) => {
                        if (!c) return null
                        const sections = [...c.data.sections]
                        sections[si] = { ...sections[si], name: e.target.value }
                        return { ...c, data: { ...c.data, sections } }
                      })
                    }
                  />
                  <Label className="mt-3 block text-xs text-muted-foreground">Fields (one per line)</Label>
                  <textarea
                    className="mt-1 flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    value={sec.fields.join("\n")}
                    onChange={(e) =>
                      setFieldsetCtx((c) => {
                        if (!c) return null
                        const sections = [...c.data.sections]
                        const fields = e.target.value.split(/\r?\n/).map((l) => l.trim())
                        sections[si] = { ...sections[si], fields }
                        return { ...c, data: { ...c.data, sections } }
                      })
                    }
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Button type="button" onClick={saveFieldsetSheet} className="bg-orange-500 hover:bg-orange-600">
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFieldsetSheetOpen(false)
                    setFieldsetCtx(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={createFieldsetOpen} onOpenChange={setCreateFieldsetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create fieldset</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Adds this fieldset to asset settings. For data centers, use client-scoped names (e.g. PDU Fieldset
              Meta, Cooling Fieldset Oracle).
            </p>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label htmlFor="new-fs-name">Display name</Label>
              <Input
                id="new-fs-name"
                value={newFieldsetName}
                onChange={(e) => setNewFieldsetName(e.target.value)}
                placeholder="e.g. UPS Fieldset Oracle"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="new-fs-key">Object key (optional)</Label>
              <Input
                id="new-fs-key"
                value={newFieldsetKeyOverride}
                onChange={(e) => setNewFieldsetKeyOverride(e.target.value)}
                placeholder="Override auto-generated key"
                className="mt-1.5 font-mono text-sm"
              />
              {previewNewFieldsetKey ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Will use key: <span className="font-mono text-foreground">{previewNewFieldsetKey}</span>
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateFieldsetOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-orange-500 hover:bg-orange-600"
              disabled={!newFieldsetName.trim()}
              onClick={confirmCreateFieldset}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssignFieldsetToTypesDialog
        open={assignDialog !== null}
        onOpenChange={(o) => {
          if (!o) setAssignDialog(null)
        }}
        fieldsetDisplayName={assignDialogDisplayName}
        fieldsetKey={assignDialogFieldsetKey}
        assetTypes={assetTypes}
        fieldsets={primaryFieldsets}
        selectedIds={assignSelectedIds}
        onSelectedIdsChange={setAssignSelectedIds}
        onAssign={applyAssignFieldset}
        fieldsetKeyChoices={
          assignDialog?.mode === "bulk" && assignDialog.choices.length > 1
            ? assignDialog.choices
            : undefined
        }
        activeFieldsetKey={assignDialog?.mode === "bulk" ? assignDialog.activeKey : undefined}
        onActiveFieldsetKeyChange={
          assignDialog?.mode === "bulk"
            ? (k) => {
                setAssignDialog((d) => (d?.mode === "bulk" ? { ...d, activeKey: k } : d))
                setAssignSelectedIds(
                  new Set(assetTypes.filter((a) => a.fieldset === k).map((a) => a.id))
                )
              }
            : undefined
        }
      />

      <AlertDialog
        open={fieldsetAutoSyncAlertOpen}
        onOpenChange={onFieldsetAutoSyncAlertOpenChange}
      >
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Assign templates to asset types?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingFieldsetAutoSyncSave ? (
                pendingFieldsetAutoSyncSave.fieldsetLabels.length === 1 ? (
                  <>
                    This fieldset ({pendingFieldsetAutoSyncSave.fieldsetLabels[0]}) has at least one
                    selected template with no asset types using this fieldset on that template. Assign
                    the selected templates to every asset type that already uses this fieldset?
                  </>
                ) : (
                  <>
                    These fieldsets have at least one selected template with no matching asset types:{" "}
                    {pendingFieldsetAutoSyncSave.fieldsetLabels.join(", ")}. Assign the selected
                    templates to every asset type that already uses each fieldset?
                  </>
                )
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Save without assigning types</AlertDialogCancel>
            <Button
              type="button"
              className="bg-orange-500 hover:bg-orange-600"
              onClick={() => finalizeFieldsetAutoSyncAlert(true)}
            >
              Assign templates to types
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AssignTemplatesDialog
        open={templateAssignOpen}
        onOpenChange={(o) => {
          setTemplateAssignOpen(o)
          if (!o) {
            setTemplateAssignTarget(null)
            pendingFieldsetAutoSyncRef.current = null
            setPendingFieldsetAutoSyncSave(null)
            setFieldsetAutoSyncAlertOpen(false)
          }
        }}
        templates={templates}
        initialSelectedTemplateIds={templateAssignInitialIds}
        onSave={handleSaveTemplateAssignments}
        onCreateTemplate={!isTemplateView ? onCreateTemplate : undefined}
        title={
          templateAssignTarget?.scope === "fieldset"
            ? templateAssignTarget.keys.length > 1
              ? "Assign templates to fieldsets"
              : "Assign templates to fieldset"
            : templateAssignTarget && templateAssignTarget.typeIds.length > 1
              ? "Assign templates to asset types"
              : "Assign templates to asset type"
        }
        description={
          templateAssignTarget?.scope === "assetType" &&
          templateAssignTarget.typeIds.length > 1
            ? "Choose templates. Include fieldsets merges template assignments onto Fieldsets tab rows for each selected type’s current active fieldset."
            : "Choose which asset templates apply to this selection. Counts update on save."
        }
        showIncludeFieldsetsOption={templateAssignTarget?.scope === "assetType"}
      />
    </div>
  )
}
