"use client"

import React, { useEffect, useState } from "react"
import { GripVertical, ChevronRight, ChevronDown, Pencil, MoreVertical, Plus } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AssetType, FieldsetData } from "@/app/page"
import type { AssetTemplate } from "@/components/asset-templates-table"
import { Badge } from "@/components/ui/badge"
import { fieldsetPrimaryAndExtraCount } from "@/lib/fieldset-client-labels"
import {
  typeRequiresParentAssemblyField,
} from "@/lib/assembly-asset-types"

interface AssetTypesTableProps {
  assetTypes: AssetType[]
  /** Full list for assembly parent resolution (defaults to `assetTypes` when omitted). */
  allAssetTypesForAssembly?: AssetType[]
  onEdit?: (asset: AssetType) => void
  onDelete?: (id: string) => void
  onAddSubtype?: (parentId: string) => void
  onToggleExpand?: (id: string) => void
  /** Merged onto the outer wrapper (e.g. `border-0 rounded-none` when nested in a card). */
  className?: string
  /**
   * When true, every row that has children starts expanded (full trees visible).
   * Useful for company level asset settings with multiple top-level hierarchies.
   */
  expandAllParentRows?: boolean
  /** When set, shows the human-readable fieldset name (e.g. per-client label) above the object key. */
  resolveFieldsetDisplay?: (fieldsetKey: string) => string | undefined
  /**
   * When set with `fieldsetClientOrder`, shows the first distinct display name plus "+N" for other
   * client-specific names (same fieldset key). Ignored if `fieldsetsByClient` is omitted.
   */
  fieldsetsByClient?: Record<string, Record<string, FieldsetData>>
  /** Client keys in display order (e.g. AWS, Meta, Oracle). */
  fieldsetClientOrder?: readonly string[]
  /** Fallback map when a key is missing from all clients (usually primary / synced flat fieldsets). */
  fieldsetFallbackFieldsets?: Record<string, FieldsetData>
  /** Hide the Fieldset column (e.g. asset template view — fieldsets live in Asset settings). */
  hideFieldsetColumn?: boolean
  /** Hide the Status Group column (e.g. asset template view). */
  hideStatusGroupColumn?: boolean
  /** Company level: checkbox column + bulk selection for template assignment */
  templateRowSelection?: {
    selectedIds: Set<string>
    onToggle: (assetTypeId: string, selected: boolean) => void
    visibleAssetTypeIds: string[]
    onSelectAllVisible: (select: boolean) => void
  }
  /** Company level: Assigned Templates column (count / total, opens picker in parent) */
  assignedTemplatesColumn?: {
    totalTemplates: number
    assignments: Record<string, string[]>
    onCellClick: (assetTypeId: string) => void
    /** When true, show count as plain text (no assignment picker). */
    readOnly?: boolean
  }
  /** Hide the Actions column (e.g. read-only template view). */
  hideActionsColumn?: boolean
}

export function AssetTypesTable({ 
  assetTypes, 
  allAssetTypesForAssembly,
  onEdit, 
  onDelete,
  onAddSubtype,
  onToggleExpand,
  className,
  expandAllParentRows = false,
  resolveFieldsetDisplay,
  fieldsetsByClient,
  fieldsetClientOrder,
  fieldsetFallbackFieldsets,
  hideFieldsetColumn = false,
  hideStatusGroupColumn = false,
  templateRowSelection,
  assignedTemplatesColumn,
  hideActionsColumn = false,
}: AssetTypesTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const tableColumnCount =
    7 -
    (hideFieldsetColumn ? 1 : 0) -
    (hideStatusGroupColumn ? 1 : 0) +
    (templateRowSelection ? 1 : 0) +
    (assignedTemplatesColumn ? 1 : 0) -
    (hideActionsColumn ? 1 : 0)
  const assemblyLookup = allAssetTypesForAssembly ?? assetTypes

  const allVisibleTypesSelected =
    templateRowSelection &&
    templateRowSelection.visibleAssetTypeIds.length > 0 &&
    templateRowSelection.visibleAssetTypeIds.every((id) =>
      templateRowSelection.selectedIds.has(id)
    )
  const someVisibleTypesSelected =
    templateRowSelection &&
    templateRowSelection.visibleAssetTypeIds.some((id) =>
      templateRowSelection.selectedIds.has(id)
    ) &&
    !allVisibleTypesSelected

  useEffect(() => {
    if (!expandAllParentRows) return
    const withChildren = new Set<string>()
    for (const a of assetTypes) {
      if (a.parentId) withChildren.add(a.parentId)
    }
    setExpandedRows(withChildren)
  }, [expandAllParentRows, assetTypes])

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    onToggleExpand?.(id)
  }

  // Build a map of parent IDs to children
  const childrenMap = new Map<string, AssetType[]>()
  const topLevelAssets: AssetType[] = []

  assetTypes.forEach((asset) => {
    if (asset.parentId) {
      const siblings = childrenMap.get(asset.parentId) || []
      siblings.push(asset)
      childrenMap.set(asset.parentId, siblings)
    } else {
      topLevelAssets.push(asset)
    }
  })

  // Check if an asset has children
  const hasChildren = (id: string) => {
    return childrenMap.has(id) || assetTypes.some((a) => a.parentId === id)
  }

  // Render a single row
  const renderRow = (asset: AssetType, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedRows.has(asset.id)
    const children = childrenMap.get(asset.id) || []
    const showExpandIcon = asset.hasSubtypes || children.length > 0 || hasChildren(asset.id)
    const indentPadding = depth * 24

    const assignedTemplateCount = assignedTemplatesColumn
      ? (assignedTemplatesColumn.assignments[asset.id]?.length ?? 0)
      : 0
    const assignedTotal = assignedTemplatesColumn?.totalTemplates ?? 0

    return (
      <>
        <TableRow 
          key={asset.id} 
          className={cn(
            "group",
            isExpanded && "bg-muted/30"
          )}
        >
          {templateRowSelection ? (
            <TableCell className="w-10 align-middle">
              <Checkbox
                checked={templateRowSelection.selectedIds.has(asset.id)}
                onCheckedChange={(c) =>
                  templateRowSelection.onToggle(asset.id, c === true)
                }
                aria-label={`Select ${asset.name}`}
              />
            </TableCell>
          ) : null}
          <TableCell className="w-12">
            <div 
              className="flex items-center gap-1"
              style={{ paddingLeft: `${indentPadding}px` }}
            >
              <button className="cursor-grab text-muted-foreground hover:text-foreground">
                <GripVertical className="h-4 w-4" />
              </button>
              {showExpandIcon ? (
                <button 
                  onClick={() => toggleExpand(asset.id)}
                  className="text-muted-foreground hover:text-foreground transition-transform"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-orange-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <span className="w-4" />
              )}
            </div>
          </TableCell>
          <TableCell>
            <div style={{ paddingLeft: `${indentPadding}px` }}>
              <div className="flex flex-wrap items-center gap-2">
                {onEdit ? (
                  <a
                    href="#"
                    className="text-blue-600 hover:underline font-medium"
                    onClick={(e) => {
                      e.preventDefault()
                      onEdit(asset)
                    }}
                  >
                    {asset.name}
                  </a>
                ) : (
                  <span className="font-medium">{asset.name}</span>
                )}
                {asset.isAssembly && (
                  <Badge className="text-[10px] px-1.5 py-0 h-5 bg-orange-500/15 text-orange-800 border-orange-500/30">
                    Assembly
                  </Badge>
                )}
                {!asset.isAssembly &&
                  typeRequiresParentAssemblyField(assemblyLookup, asset.id) && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-muted-foreground">
                      Assembly child
                    </Badge>
                  )}
              </div>
            </div>
          </TableCell>
          <TableCell className="text-muted-foreground">{asset.code}</TableCell>
          <TableCell className="min-w-0 max-w-[100px] text-muted-foreground">
            <span className="block truncate" title={asset.description || undefined}>
              {asset.description}
            </span>
          </TableCell>
          {!hideFieldsetColumn ? (
            <TableCell className="text-muted-foreground">
              {fieldsetsByClient && fieldsetClientOrder && fieldsetFallbackFieldsets ? (
                (() => {
                  const { primary, extraCount, tooltipLines } = fieldsetPrimaryAndExtraCount(
                    asset.fieldset,
                    fieldsetsByClient,
                    fieldsetClientOrder,
                    fieldsetFallbackFieldsets
                  )
                  return (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-foreground">{primary}</span>
                        {extraCount > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="secondary"
                                className="h-5 px-1.5 text-[10px] font-normal tabular-nums"
                              >
                                +{extraCount}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs whitespace-pre-line text-left">
                              {tooltipLines.join("\n")}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{asset.fieldset}</span>
                    </div>
                  )
                })()
              ) : resolveFieldsetDisplay ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">
                    {resolveFieldsetDisplay(asset.fieldset) ?? asset.fieldset}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{asset.fieldset}</span>
                </div>
              ) : (
                asset.fieldset
              )}
            </TableCell>
          ) : null}
          {!hideStatusGroupColumn ? (
            <TableCell className="text-muted-foreground">{asset.statusGroup}</TableCell>
          ) : null}
          {assignedTemplatesColumn ? (
            <TableCell className="text-sm">
              {assignedTemplatesColumn.readOnly ? (
                <span className="text-muted-foreground">
                  {assignedTemplateCount}/{assignedTotal} Templates
                </span>
              ) : (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => assignedTemplatesColumn.onCellClick(asset.id)}
                >
                  {assignedTemplateCount}/{assignedTotal} Templates
                </button>
              )}
            </TableCell>
          ) : null}
          {!hideActionsColumn ? (
          <TableCell>
            {(onEdit || onDelete || onAddSubtype) && (
              <div className="flex items-center justify-end gap-1">
                {onAddSubtype && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={() => onAddSubtype(asset.id)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Subtype
                  </Button>
                )}
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onEdit(asset)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {(onEdit || onDelete) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onEdit && (
                        <DropdownMenuItem onClick={() => onEdit(asset)}>
                          Edit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem>Duplicate</DropdownMenuItem>
                      {onDelete && (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDelete(asset.id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </TableCell>
          ) : null}
        </TableRow>
        {isExpanded && children.map((child) => (
          <React.Fragment key={child.id}>{renderRow(child, depth + 1)}</React.Fragment>
        ))}
      </>
    )
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {templateRowSelection ? (
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allVisibleTypesSelected
                      ? true
                      : someVisibleTypesSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(c) =>
                    templateRowSelection.onSelectAllVisible(c === true)
                  }
                  aria-label="Select all visible asset types"
                />
              </TableHead>
            ) : null}
            <TableHead className="w-12"></TableHead>
            <TableHead className="min-w-[200px]">
              <div className="flex items-center gap-2">
                Name
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Sort A-Z</DropdownMenuItem>
                    <DropdownMenuItem>Sort Z-A</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TableHead>
            <TableHead className="min-w-[200px]">
              <div className="flex items-center gap-1">
                Code
                <span className="text-destructive">*</span>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Unique identifier code for the asset type</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TableHead>
            <TableHead className="min-w-[72px] max-w-[100px] w-[100px]">Description</TableHead>
            {!hideFieldsetColumn ? (
              <TableHead className="min-w-[180px]">Fieldset</TableHead>
            ) : null}
            {!hideStatusGroupColumn ? (
              <TableHead className="min-w-[200px]">Status Group</TableHead>
            ) : null}
            {assignedTemplatesColumn ? (
              <TableHead className="min-w-[150px]">Assigned Templates</TableHead>
            ) : null}
            {!hideActionsColumn ? (
              <TableHead className="w-48 text-right">Actions</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {topLevelAssets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={tableColumnCount} className="h-32 text-center">
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <p>No asset types found</p>
                  <p className="text-sm">Create a new asset type to get started</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            topLevelAssets.map((asset) => (
              <React.Fragment key={asset.id}>{renderRow(asset, 0)}</React.Fragment>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
