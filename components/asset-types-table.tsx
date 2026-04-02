"use client"

import React, { useState } from "react"
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
import type { AssetType } from "@/app/page"
import { Badge } from "@/components/ui/badge"
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
}

export function AssetTypesTable({ 
  assetTypes, 
  allAssetTypesForAssembly,
  onEdit, 
  onDelete,
  onAddSubtype,
  onToggleExpand 
}: AssetTypesTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const assemblyLookup = allAssetTypesForAssembly ?? assetTypes

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

    return (
      <>
        <TableRow 
          key={asset.id} 
          className={cn(
            "group",
            isExpanded && "bg-muted/30"
          )}
        >
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
          <TableCell className="text-muted-foreground">{asset.description}</TableCell>
          <TableCell className="text-muted-foreground">{asset.fieldset}</TableCell>
          <TableCell className="text-muted-foreground">{asset.statusGroup}</TableCell>
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
        </TableRow>
        {isExpanded && children.map((child) => (
          <React.Fragment key={child.id}>{renderRow(child, depth + 1)}</React.Fragment>
        ))}
      </>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
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
            <TableHead className="min-w-[200px]">Description</TableHead>
            <TableHead className="min-w-[180px]">Fieldset</TableHead>
            <TableHead className="min-w-[200px]">Status Group</TableHead>
            <TableHead className="w-48 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {topLevelAssets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center">
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
