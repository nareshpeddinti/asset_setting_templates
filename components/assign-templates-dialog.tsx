"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import type { AssetTemplate } from "@/components/asset-templates-table"
import { cn } from "@/lib/utils"

interface AssignTemplatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: AssetTemplate[]
  /** Initial selection when dialog opens */
  initialSelectedTemplateIds: string[]
  /** Return false to keep the dialog open (e.g. while a follow-up confirmation is shown). */
  onSave: (
    templateIds: string[],
    meta?: { includeFieldsets?: boolean }
  ) => boolean | void
  /** When set, shows an inline row to create a template and auto-select it without closing the dialog. */
  onCreateTemplate?: (name: string) => AssetTemplate
  /** When true (e.g. assigning from asset types), show a checkbox to also update matching fieldset rows. */
  showIncludeFieldsetsOption?: boolean
  title?: string
  description?: string
}

export function AssignTemplatesDialog({
  open,
  onOpenChange,
  templates,
  initialSelectedTemplateIds,
  onSave,
  onCreateTemplate,
  showIncludeFieldsetsOption = false,
  title = "Assign templates",
  description = "Choose which asset templates reference this selection.",
}: AssignTemplatesDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [newTemplateName, setNewTemplateName] = useState("")
  const [includeFieldsets, setIncludeFieldsets] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(new Set(initialSelectedTemplateIds))
    setNewTemplateName("")
    setIncludeFieldsets(false)
  }, [open, initialSelectedTemplateIds])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = () => {
    const close = onSave(Array.from(selected), {
      includeFieldsets: showIncludeFieldsetsOption ? includeFieldsets : undefined,
    })
    if (close !== false) onOpenChange(false)
  }

  const handleCreateInline = () => {
    if (!onCreateTemplate) return
    const name = newTemplateName.trim()
    if (!name) return
    const created = onCreateTemplate(name)
    setSelected((prev) => new Set(prev).add(created.id))
    setNewTemplateName("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border">
          <div className="max-h-[260px] overflow-y-auto">
            {templates.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {onCreateTemplate ? "No templates yet — add one below." : "No asset templates yet."}
              </p>
            ) : (
              templates.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-muted/50",
                    selected.has(t.id) && "bg-muted/30"
                  )}
                  onClick={() => toggle(t.id)}
                >
                  <Checkbox
                    checked={selected.has(t.id)}
                    onCheckedChange={() => toggle(t.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-sm">{t.name}</span>
                </div>
              ))
            )}
          </div>
          {onCreateTemplate ? (
            <div
              className="flex flex-col gap-2 border-t bg-muted/20 px-3 py-3 sm:flex-row sm:items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <Input
                placeholder="New template name"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleCreateInline()
                  }
                }}
                className="h-9 flex-1 bg-background"
                aria-label="New template name"
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                disabled={!newTemplateName.trim()}
                onClick={handleCreateInline}
              >
                Create & select
              </Button>
            </div>
          ) : null}
        </div>
        {showIncludeFieldsetsOption ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/20 px-3 py-3">
            <Checkbox
              checked={includeFieldsets}
              onCheckedChange={(v) => setIncludeFieldsets(v === true)}
              className="mt-0.5"
              aria-describedby="include-fieldsets-desc"
            />
            <span className="text-sm leading-snug">
              <span className="font-medium">Include fieldsets</span>
              <span id="include-fieldsets-desc" className="mt-1 block text-muted-foreground">
                Merge templates onto Fieldsets tab rows for each selected type&apos;s current active
                fieldset.
              </span>
            </span>
          </label>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
