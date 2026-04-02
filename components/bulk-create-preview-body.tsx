"use client"

import { useState } from "react"
import { X, ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Fieldset, HierarchyItem } from "@/lib/bulk-hierarchy-types"

export function countAll(items: HierarchyItem[]): number {
  return items.reduce((n, item) => n + 1 + countAll(item.children), 0)
}

export function updateAtPath(
  items: HierarchyItem[],
  path: number[],
  updater: (item: HierarchyItem) => HierarchyItem
): HierarchyItem[] {
  return items.map((item, idx) => {
    if (idx !== path[0]) return item
    if (path.length === 1) return updater(item)
    return { ...item, children: updateAtPath(item.children, path.slice(1), updater) }
  })
}

export function deleteAtPath(items: HierarchyItem[], path: number[]): HierarchyItem[] {
  if (path.length === 1) return items.filter((_, i) => i !== path[0])
  return items.map((item, idx) => {
    if (idx !== path[0]) return item
    return { ...item, children: deleteAtPath(item.children, path.slice(1)) }
  })
}

export function findAtPath(items: HierarchyItem[], path: number[]): HierarchyItem | null {
  const item = items[path[0]]
  if (!item) return null
  if (path.length === 1) return item
  return findAtPath(item.children, path.slice(1))
}

function EditableFieldChip({
  field,
  onUpdate,
  onDelete,
}: {
  field: string
  onUpdate: (v: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(field)

  const save = () => {
    if (value.trim()) onUpdate(value.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save()
          if (e.key === "Escape") {
            setValue(field)
            setEditing(false)
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className="px-2 py-0.5 text-xs border border-blue-400 rounded bg-background focus:outline-none focus:ring-1 focus:ring-blue-500 w-28"
      />
    )
  }

  return (
    <span className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded text-xs group/chip hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors">
      <span
        className="cursor-pointer"
        title="Click to rename"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        {field}
      </span>
      <button
        title="Remove field"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="opacity-0 group-hover/chip:opacity-100 ml-0.5 hover:text-red-600 transition-opacity"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

function TreeNode({
  item,
  level = 0,
  index = 0,
  path = [],
  fieldsets,
  onUpdateItem,
  onDeleteItem,
  onUpdateField,
  onDeleteField,
  onUpdateCommonField,
  onDeleteCommonField,
}: {
  item: HierarchyItem
  level?: number
  index?: number
  path?: number[]
  fieldsets: Fieldset[]
  onUpdateItem: (path: number[], updates: Partial<HierarchyItem>) => void
  onDeleteItem: (path: number[]) => void
  onUpdateField: (path: number[], fieldIdx: number, value: string) => void
  onDeleteField: (path: number[], fieldIdx: number) => void
  onUpdateCommonField: (path: number[], fieldIdx: number, value: string) => void
  onDeleteCommonField: (path: number[], fieldIdx: number) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(item.name)

  const currentPath = [...path, index]
  const nodeKey = `n_${currentPath.join("_")}`
  const hasChildren = item.children.length > 0

  const fieldset = item.fieldsetCode
    ? fieldsets.find((fs) => fs.code === item.fieldsetCode) ?? null
    : null

  const saveName = () => {
    if (editName.trim()) onUpdateItem(currentPath, { name: editName.trim() })
    setEditing(false)
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-muted/60 group transition-colors",
          level === 0 && "font-semibold text-sm",
          level === 1 && "text-sm",
          (level === 2 || level === 3) && "text-xs"
        )}
        style={{ paddingLeft: `${level * 18 + 8}px` }}
      >
        <button
          className="shrink-0 mt-0.5 text-muted-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <div className="w-4" />
          )}
        </button>

        {(level === 1 || level === 2) && <span className="shrink-0 text-muted-foreground">•</span>}
        {level === 3 && <span className="shrink-0 text-muted-foreground">◦</span>}

        <span className="shrink-0 font-mono text-orange-600 text-xs mt-0.5 w-fit">{item.code}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {editing ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName()
                  if (e.key === "Escape") {
                    setEditName(item.name)
                    setEditing(false)
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 px-1.5 py-0.5 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            ) : (
              <span
                className="cursor-pointer hover:text-orange-600 transition-colors"
                title="Click to rename"
                onClick={() => setEditing(true)}
              >
                {item.name}
                {(level === 2 || level === 3) && item.description ? `: ${item.description}` : ""}
              </span>
            )}

            <button
              title="Remove"
              onClick={() => onDeleteItem(currentPath)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 text-red-500 transition-opacity shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {!fieldset && item.commonFields && item.commonFields.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span className="text-xs text-muted-foreground mr-1">Common fields:</span>
              {item.commonFields.map((f, fi) => (
                <EditableFieldChip
                  key={`${nodeKey}_cf${fi}`}
                  field={f}
                  onUpdate={(v) => onUpdateCommonField(currentPath, fi, v)}
                  onDelete={() => onDeleteCommonField(currentPath, fi)}
                />
              ))}
            </div>
          )}
          {fieldset && fieldset.inheritedFields && fieldset.inheritedFields.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span className="text-xs text-muted-foreground mr-1">Inherited (shared):</span>
              {fieldset.inheritedFields.map((f, fi) => (
                <span
                  key={`${nodeKey}_inh${fi}`}
                  className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded"
                >
                  {f}
                </span>
              ))}
            </div>
          )}
          {fieldset && fieldset.sections && fieldset.sections.length > 0 && (
            <div className="mt-1.5 space-y-1.5">
              {fieldset.sections.map((sec, si) => {
                let flatBase = 0
                for (let j = 0; j < si; j++) {
                  flatBase += fieldset.sections![j]!.fields.length
                }
                return (
                  <div key={`${nodeKey}_sec${si}`} className="flex flex-wrap gap-1 items-start">
                    <span className="text-xs text-muted-foreground mr-1 shrink-0 pt-0.5 min-w-[7rem]">
                      {sec.name}:
                    </span>
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                      {sec.fields.map((field, fi) => (
                        <EditableFieldChip
                          key={`${nodeKey}_s${si}_f${fi}`}
                          field={field}
                          onUpdate={(v) => onUpdateField(currentPath, flatBase + fi, v)}
                          onDelete={() => onDeleteField(currentPath, flatBase + fi)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {fieldset &&
            (!fieldset.sections || fieldset.sections.length === 0) &&
            fieldset.fields.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                <span className="text-xs text-muted-foreground mr-1">Fields:</span>
                {fieldset.fields.map((field, fi) => (
                  <EditableFieldChip
                    key={`${nodeKey}_f${fi}`}
                    field={field}
                    onUpdate={(v) => onUpdateField(currentPath, fi, v)}
                    onDelete={() => onDeleteField(currentPath, fi)}
                  />
                ))}
              </div>
            )}
        </div>
      </div>

      {expanded && hasChildren && (
        <div>
          {item.children.map((child, ci) => (
            <TreeNode
              key={`${nodeKey}_c${ci}`}
              item={child}
              level={level + 1}
              index={ci}
              path={currentPath}
              fieldsets={fieldsets}
              onUpdateItem={onUpdateItem}
              onDeleteItem={onDeleteItem}
              onUpdateField={onUpdateField}
              onDeleteField={onDeleteField}
              onUpdateCommonField={onUpdateCommonField}
              onDeleteCommonField={onDeleteCommonField}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export interface BulkCreatePreviewTreeProps {
  hierarchy: HierarchyItem[]
  fieldsets: Fieldset[]
  onUpdateItem: (path: number[], updates: Partial<HierarchyItem>) => void
  onDeleteItem: (path: number[]) => void
  onUpdateField: (path: number[], fieldIdx: number, value: string) => void
  onDeleteField: (path: number[], fieldIdx: number) => void
  onUpdateCommonField: (path: number[], fieldIdx: number, value: string) => void
  onDeleteCommonField: (path: number[], fieldIdx: number) => void
  maxHeightClass?: string
}

export function BulkCreatePreviewTree({
  hierarchy,
  fieldsets,
  onUpdateItem,
  onDeleteItem,
  onUpdateField,
  onDeleteField,
  onUpdateCommonField,
  onDeleteCommonField,
  maxHeightClass = "max-h-[55vh]",
}: BulkCreatePreviewTreeProps) {
  const itemCount = countAll(hierarchy)

  const orphanFieldsets = fieldsets.filter((fs) => {
    const allCodes = new Set<string>()
    const walk = (items: HierarchyItem[]) => {
      for (const it of items) {
        if (it.fieldsetCode) allCodes.add(it.fieldsetCode)
        walk(it.children)
      }
    }
    walk(hierarchy)
    return !allCodes.has(fs.code)
  })

  return (
    <div className={cn("border rounded-lg bg-muted/30 p-3 overflow-auto", maxHeightClass)}>
      {itemCount === 0 && fieldsets.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">
          No asset data detected. Check that your file matches one of the supported formats.
        </p>
      ) : (
        <>
          {hierarchy.map((item, idx) => (
            <TreeNode
              key={`root_${idx}`}
              item={item}
              index={idx}
              path={[]}
              fieldsets={fieldsets}
              onUpdateItem={onUpdateItem}
              onDeleteItem={onDeleteItem}
              onUpdateField={onUpdateField}
              onDeleteField={onDeleteField}
              onUpdateCommonField={onUpdateCommonField}
              onDeleteCommonField={onDeleteCommonField}
            />
          ))}

          {orphanFieldsets.map((fs) => (
            <div key={fs.code} className="px-2 py-1.5">
              <span className="text-xs font-mono text-orange-600">{fs.code}</span>
              <span className="text-xs text-muted-foreground ml-2">{fs.name}</span>
              <div className="mt-1 space-y-1">
                {fs.inheritedFields && fs.inheritedFields.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs text-muted-foreground mr-1">Inherited (shared):</span>
                    {fs.inheritedFields.map((f, fi) => (
                      <span
                        key={`i${fi}`}
                        className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                {fs.sections && fs.sections.length > 0 ? (
                  fs.sections.map((sec, si) => (
                    <div key={si} className="flex flex-wrap gap-1 items-start">
                      <span className="text-xs text-muted-foreground mr-1 shrink-0 min-w-[7rem]">
                        {sec.name}:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {sec.fields.map((f, fi) => (
                          <span
                            key={fi}
                            className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {fs.fields.map((f, fi) => (
                      <span
                        key={fi}
                        className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
