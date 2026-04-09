"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { AssetType, FieldsetData } from "@/app/page"
import {
  PROCORE_DEFAULT_FIELDSET_KEY,
  customFieldsetKeysAssignedAndAncestorsWithinSelection,
} from "@/lib/fieldset-keys-for-asset-type"
import {
  assetTypeQualifiesForFieldsetMergeConfirm,
  fieldsetPrimaryAndExtraCount,
} from "@/lib/fieldset-client-labels"
import { cn } from "@/lib/utils"

export {
  customFieldsetKeysAssignedAndAncestorsOnly,
  customFieldsetKeysAssignedAndAncestorsWithinSelection,
  customFieldsetKeysForAssetType,
  fieldsetKeysForAssetType,
} from "@/lib/fieldset-keys-for-asset-type"

/** True if any selected type qualifies for merge confirmation (multi-key and/or multi-client +N). */
export function anySelectedAssetTypeHasMultipleFieldsets(
  typeIds: readonly string[],
  assetTypes: AssetType[],
  opts: {
    fieldsetsByClient?: Record<string, Record<string, FieldsetData>>
    fieldsetClientOrder?: readonly string[]
    fallbackFieldsets: Record<string, FieldsetData>
  }
): boolean {
  const byId = new Map(assetTypes.map((a) => [a.id, a]))
  const scope = new Set(typeIds)
  return typeIds.some((id) => {
    const t = byId.get(id)
    return !!t && assetTypeQualifiesForFieldsetMergeConfirm(t, assetTypes, opts, scope)
  })
}

function fieldsetLabel(key: string, fieldsets: Record<string, FieldsetData>): string {
  return fieldsets[key]?.name?.trim() || key
}

export function rowKey(typeId: string, fieldsetKey: string): string {
  return `${typeId}::${fieldsetKey}`
}

function rowKeyForClient(typeId: string, fieldsetKey: string, clientId: string): string {
  return `${typeId}::${fieldsetKey}::${clientId}`
}

type MergeDialogRow = {
  type: AssetType
  fieldsetKey: string
  key: string
  displayLabel: string
  clientId?: string
}

/** One row per logical key, or one row per client when names differ across clients (matches Types “+N”). */
function buildMergeDialogRowsForType(
  t: AssetType,
  keys: string[],
  fieldsetsByClient: Record<string, Record<string, FieldsetData>> | undefined,
  fieldsetClientOrder: readonly string[],
  fallbackFieldsets: Record<string, FieldsetData>
): MergeDialogRow[] {
  const out: MergeDialogRow[] = []
  const order = fieldsetClientOrder
  for (const k of keys) {
    if (fieldsetsByClient && order.length > 0) {
      const { extraCount, primary } = fieldsetPrimaryAndExtraCount(
        k,
        fieldsetsByClient,
        order,
        fallbackFieldsets
      )
      if (extraCount > 0) {
        for (const c of order) {
          const name = fieldsetsByClient[c]?.[k]?.name?.trim()
          if (!name) continue
          out.push({
            type: t,
            fieldsetKey: k,
            key: rowKeyForClient(t.id, k, c),
            displayLabel: name,
            clientId: c,
          })
        }
      } else {
        out.push({
          type: t,
          fieldsetKey: k,
          key: rowKey(t.id, k),
          displayLabel: primary,
        })
      }
    } else {
      out.push({
        type: t,
        fieldsetKey: k,
        key: rowKey(t.id, k),
        displayLabel: fieldsetLabel(k, fallbackFieldsets),
      })
    }
  }
  return out
}

export type FieldsetMergeConfirmPayload = {
  /** Distinct logical fieldset keys to merge templates onto (excludes implicit Procore Default from unchecked rows). */
  keysForTemplateMerge: string[]
  /** Every merge-eligible type id → active fieldset after import (unchecked → Procore Default). */
  fieldsetByTypeId: Record<string, string>
}

export interface AssignTemplatesFieldsetsConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Types to list (pre-filtered to merge-eligible types, or full catalog). */
  selectedTypes: AssetType[]
  /** Full company asset-type list — required to resolve ancestor fieldsets in the hierarchy. */
  allAssetTypes: AssetType[]
  /** Per-client fieldset maps — with {@link fieldsetClientOrder}, drives the same “+N” rule as the Types table. */
  fieldsetsByClient?: Record<string, Record<string, FieldsetData>>
  fieldsetClientOrder?: readonly string[]
  fieldsets: Record<string, FieldsetData>
  /** Per eligible type: chosen fieldset key, or Procore Default when no row was checked. Keys list drives Fieldsets-tab merge only for selected custom fieldsets. */
  onConfirm: (payload: FieldsetMergeConfirmPayload) => void
}

/**
 * After Save on “Assign templates to asset types” when a type has multiple custom fieldset keys
 * (Procore Default excluded). User selects which fieldset rows apply; keys drive Fieldsets-tab merge when “Include fieldsets” was checked.
 */
export function AssignTemplatesFieldsetsConfirmDialog({
  open,
  onOpenChange,
  selectedTypes,
  allAssetTypes,
  fieldsetsByClient,
  fieldsetClientOrder,
  fieldsets,
  onConfirm,
}: AssignTemplatesFieldsetsConfirmDialogProps) {
  const [filter, setFilter] = useState("")
  const [fieldsetNamesOnly, setFieldsetNamesOnly] = useState(false)
  const [groupByAssetType, setGroupByAssetType] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(() => new Set())
  const rangeAnchorRef = useRef<number | null>(null)
  const skipNextToggleRef = useRef(false)

  const mergeQualifyOpts = useMemo(
    () => ({
      fieldsetsByClient,
      fieldsetClientOrder,
      fallbackFieldsets: fieldsets,
    }),
    [fieldsetsByClient, fieldsetClientOrder, fieldsets]
  )

  /** Assign-templates step scope: ancestor fieldset keys only when that ancestor was also selected. */
  const assignStepSelectedTypeIds = useMemo(
    () => new Set(selectedTypes.map((t) => t.id)),
    [selectedTypes]
  )

  /** Same eligibility as Types table “+N” and multi-key hierarchy, scoped to selected types only. */
  const eligibleTypesForMerge = useMemo(
    () =>
      selectedTypes.filter((t) =>
        assetTypeQualifiesForFieldsetMergeConfirm(
          t,
          allAssetTypes,
          mergeQualifyOpts,
          assignStepSelectedTypeIds
        )
      ),
    [selectedTypes, allAssetTypes, mergeQualifyOpts, assignStepSelectedTypeIds]
  )

  const clientOrder = fieldsetClientOrder ?? []

  const mergeRowsUnfiltered = useMemo(() => {
    const out: MergeDialogRow[] = []
    for (const t of eligibleTypesForMerge) {
      const keys = customFieldsetKeysAssignedAndAncestorsWithinSelection(
        t,
        allAssetTypes,
        assignStepSelectedTypeIds
      )
      out.push(
        ...buildMergeDialogRowsForType(t, keys, fieldsetsByClient, clientOrder, fieldsets)
      )
    }
    return out
  }, [
    eligibleTypesForMerge,
    allAssetTypes,
    fieldsetsByClient,
    clientOrder,
    fieldsets,
    assignStepSelectedTypeIds,
  ])

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    let list = mergeRowsUnfiltered
    if (q) {
      list = mergeRowsUnfiltered.filter((r) => {
        if (fieldsetNamesOnly) {
          const hay = `${r.fieldsetKey} ${r.displayLabel}`.toLowerCase()
          return hay.includes(q)
        }
        const hay =
          `${r.type.name} ${r.type.code} ${r.fieldsetKey} ${r.displayLabel}`.toLowerCase()
        return hay.includes(q)
      })
    }
    const order = clientOrder
    const clientIndex = (id: string | undefined) =>
      id ? Math.max(0, order.indexOf(id)) : 0
    return [...list].sort((a, b) => {
      const n = a.type.name.localeCompare(b.type.name)
      if (n !== 0) return n
      const fk = a.fieldsetKey.localeCompare(b.fieldsetKey)
      if (fk !== 0) return fk
      return clientIndex(a.clientId) - clientIndex(b.clientId)
    })
  }, [mergeRowsUnfiltered, filter, fieldsetNamesOnly, clientOrder])

  useEffect(() => {
    if (!open) {
      setFilter("")
      setFieldsetNamesOnly(false)
      setGroupByAssetType(false)
      rangeAnchorRef.current = null
      skipNextToggleRef.current = false
      return
    }
    setSelectedRows(new Set())
  }, [open, mergeRowsUnfiltered])

  /** Stable index into `rows` for shift-range selection (unchanged when group headers are shown). */
  const rowIndexByKey = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r, i) => m.set(r.key, i))
    return m
  }, [rows])

  /** Ordered groups when “Group by asset type” is on — preserves row order within each type. */
  const groupedSections = useMemo(() => {
    if (!groupByAssetType || rows.length === 0) return null
    const orderedIds: string[] = []
    const seen = new Set<string>()
    for (const r of rows) {
      if (!seen.has(r.type.id)) {
        seen.add(r.type.id)
        orderedIds.push(r.type.id)
      }
    }
    const byId = new Map<string, MergeDialogRow[]>()
    for (const id of orderedIds) byId.set(id, [])
    for (const r of rows) {
      byId.get(r.type.id)!.push(r)
    }
    return orderedIds.map((id) => ({
      type: byId.get(id)![0]!.type,
      rows: byId.get(id)!,
    }))
  }, [rows, groupByAssetType])

  const visibleKeys = useMemo(() => new Set(rows.map((r) => r.key)), [rows])

  const selectedVisibleCountFixed = useMemo(() => {
    let n = 0
    for (const k of visibleKeys) {
      if (selectedRows.has(k)) n += 1
    }
    return n
  }, [visibleKeys, selectedRows])

  const allVisibleSelected =
    visibleKeys.size > 0 && selectedVisibleCountFixed === visibleKeys.size
  const someVisibleSelected = selectedVisibleCountFixed > 0 && !allVisibleSelected

  const toggleRow = (rowId: string, on: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (on) next.add(rowId)
      else next.delete(rowId)
      return next
    })
  }

  const toggleSelectAllVisible = (select: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (select) {
        for (const k of visibleKeys) next.add(k)
      } else {
        for (const k of visibleKeys) next.delete(k)
      }
      return next
    })
  }

  const selectRange = (fromIndex: number, toIndex: number, select: boolean) => {
    const start = Math.min(fromIndex, toIndex)
    const end = Math.max(fromIndex, toIndex)
    setSelectedRows((prev) => {
      const next = new Set(prev)
      for (let i = start; i <= end; i++) {
        const r = rows[i]
        if (!r) continue
        if (select) next.add(r.key)
        else next.delete(r.key)
      }
      return next
    })
  }

  const handleCheckboxPointerDown = (e: React.PointerEvent, rowIndex: number) => {
    if (e.shiftKey && rangeAnchorRef.current !== null && rows.length > 0) {
      e.preventDefault()
      selectRange(rangeAnchorRef.current, rowIndex, true)
      skipNextToggleRef.current = true
      return
    }
    rangeAnchorRef.current = rowIndex
  }

  /** Distinct logical fieldset keys among checked rows (full list, not filter). */
  const distinctSelectedFieldsetKeyCount = useMemo(() => {
    const keys = new Set<string>()
    for (const r of mergeRowsUnfiltered) {
      if (selectedRows.has(r.key)) keys.add(r.fieldsetKey)
    }
    return keys.size
  }, [mergeRowsUnfiltered, selectedRows])

  /** More than one fieldset row selected for the same asset type — Import is blocked until resolved. */
  const moreThanOneFieldsetRowForSameAssetType = useMemo(() => {
    const byType = new Map<string, number>()
    for (const r of mergeRowsUnfiltered) {
      if (!selectedRows.has(r.key)) continue
      byType.set(r.type.id, (byType.get(r.type.id) ?? 0) + 1)
    }
    return [...byType.values()].some((c) => c > 1)
  }, [mergeRowsUnfiltered, selectedRows])

  const handleConfirm = () => {
    if (moreThanOneFieldsetRowForSameAssetType) return
    const fieldsetByTypeId: Record<string, string> = {}
    const keysForTemplateMerge = new Set<string>()
    for (const t of eligibleTypesForMerge) {
      const selectedForType = mergeRowsUnfiltered.filter(
        (r) => r.type.id === t.id && selectedRows.has(r.key)
      )
      if (selectedForType.length === 0) {
        fieldsetByTypeId[t.id] = PROCORE_DEFAULT_FIELDSET_KEY
      } else {
        const fk = selectedForType[0]!.fieldsetKey
        fieldsetByTypeId[t.id] = fk
        if (fk !== PROCORE_DEFAULT_FIELDSET_KEY) keysForTemplateMerge.add(fk)
      }
    }
    onConfirm({
      fieldsetByTypeId,
      keysForTemplateMerge: [...keysForTemplateMerge],
    })
  }

  const canConfirm = !moreThanOneFieldsetRowForSameAssetType

  function renderDataRow(r: MergeDialogRow) {
    const index = rowIndexByKey.get(r.key) ?? 0
    return (
      <TableRow
        key={r.key}
        className={cn(
          groupByAssetType && "bg-background",
          groupByAssetType &&
            "[&>td:nth-child(2)]:border-l-2 [&>td:nth-child(2)]:border-l-primary/30"
        )}
      >
        <TableCell className="align-middle">
          <Checkbox
            checked={selectedRows.has(r.key)}
            onPointerDown={(e) => handleCheckboxPointerDown(e, index)}
            onCheckedChange={(c) => {
              if (skipNextToggleRef.current) {
                skipNextToggleRef.current = false
                return
              }
              toggleRow(r.key, c === true)
            }}
            aria-label={`Select ${r.displayLabel} for ${r.type.name}`}
          />
        </TableCell>
        <TableCell className="align-middle text-sm">
          <span className="text-foreground">{r.displayLabel}</span>
        </TableCell>
        <TableCell className="align-middle">
          <span className="font-medium">{r.type.name}</span>
          <span className="ml-2 text-sm text-muted-foreground">{r.type.code}</span>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[200] flex max-h-[90vh] max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
          <DialogTitle>Fieldsets to include in template merge</DialogTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Same idea as the Types column: types with <span className="font-medium text-foreground">multiple custom fieldset keys</span>{" "}
            (assigned + ancestors; <span className="font-medium text-foreground">Procore Default</span> excluded) or a{" "}
            <span className="font-medium text-foreground">+N</span> badge (multiple client display names for one key). Each row is a
            fieldset key to merge, including <span className="font-medium text-foreground">ancestor</span> keys. Select{" "}
            <span className="font-medium text-foreground">one fieldset row per asset type</span> to import templates onto that
            fieldset; types with <span className="font-medium text-foreground">no row checked</span> use{" "}
            <span className="font-medium text-foreground">Procore Default</span> as their active fieldset. Import stays disabled if
            multiple fieldsets are selected for the same type. Filter, header checkbox, and{" "}
            <span className="font-medium text-foreground">Shift</span>-click range work as usual.
          </p>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="relative min-w-[200px] max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={
                  fieldsetNamesOnly
                    ? "Filter by fieldset name or key"
                    : "Filter by fieldset name, key, or asset type"
                }
                className="pl-9"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                id="filter-fieldset-names-only"
                checked={fieldsetNamesOnly}
                onCheckedChange={(c) => setFieldsetNamesOnly(c === true)}
              />
              <Label htmlFor="filter-fieldset-names-only" className="cursor-pointer font-normal">
                Fieldset names only
              </Label>
            </label>
            <div className="flex items-center gap-2">
              <Switch
                id="group-by-asset-type"
                checked={groupByAssetType}
                onCheckedChange={(c) => setGroupByAssetType(c === true)}
                aria-label="Group table by asset type"
              />
              <Label htmlFor="group-by-asset-type" className="cursor-pointer font-normal">
                Group by asset type
              </Label>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {selectedVisibleCountFixed} of {visibleKeys.size || 0} visible rows selected
              {distinctSelectedFieldsetKeyCount > 0 ? (
                <span className="ml-2">
                  · {distinctSelectedFieldsetKeyCount} distinct fieldset
                  {distinctSelectedFieldsetKeyCount === 1 ? "" : "s"} selected
                </span>
              ) : null}
            </span>
            <span className="text-xs">
              Header checkbox selects all rows that match the current filter.
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted/50">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        visibleKeys.size === 0
                          ? false
                          : allVisibleSelected
                            ? true
                            : someVisibleSelected
                              ? "indeterminate"
                              : false
                      }
                      onCheckedChange={(c) => toggleSelectAllVisible(c === true)}
                      aria-label="Select all visible rows in the table"
                    />
                  </TableHead>
                  <TableHead>Fieldset</TableHead>
                  <TableHead>Asset type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligibleTypesForMerge.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      No qualifying asset types (multi-key custom fieldsets and/or multi-client +N).
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      No rows match your filter.
                    </TableCell>
                  </TableRow>
                ) : groupedSections ? (
                  <>
                    {groupedSections.map((g) => (
                      <Fragment key={g.type.id}>
                        <TableRow className="bg-muted/70 hover:bg-muted/70 border-b border-border">
                          <TableCell colSpan={3} className="py-2.5">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-sm font-semibold text-foreground">{g.type.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">{g.type.code}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {g.rows.map((r) => renderDataRow(r))}
                      </Fragment>
                    ))}
                  </>
                ) : (
                  rows.map((r) => renderDataRow(r))
                )}
              </TableBody>
            </Table>
          </div>
          {moreThanOneFieldsetRowForSameAssetType ? (
            <p className="text-sm text-destructive">
              Multiple fieldsets are selected for one or more asset types. Choose only one fieldset row per asset type to
              import.
            </p>
          ) : null}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button
            type="button"
            className="bg-orange-500 hover:bg-orange-600"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
