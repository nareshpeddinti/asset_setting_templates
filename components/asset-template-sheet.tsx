"use client"

import { useState, useEffect } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import type { AssetTemplate } from "@/components/asset-templates-table"

interface AssetTemplateSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: AssetTemplate | null
  onSave: (data: Partial<AssetTemplate>) => void
  mode?: "edit" | "view"
}

export function AssetTemplateSheet({
  open,
  onOpenChange,
  template,
  onSave,
  mode = "edit",
}: AssetTemplateSheetProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    if (template) {
      setName(template.name)
      setIsDefault(template.isDefault || false)
    } else {
      setName("")
      setDescription("")
      setIsDefault(false)
    }
  }, [template, open])

  const handleSave = () => {
    onSave({
      name,
      isDefault,
    })
    onOpenChange(false)
  }

  const isViewMode = mode === "view"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {template
              ? isViewMode
                ? "View Template"
                : "Edit Template"
              : "Create Template"}
          </SheetTitle>
          <SheetDescription>
            {template
              ? isViewMode
                ? "View the template details."
                : "Make changes to the asset template."
              : "Create a new asset template for your projects."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">
              Template Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter template name"
              disabled={isViewMode}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter template description"
              rows={3}
              disabled={isViewMode}
            />
          </div>

          {!isViewMode && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="default">Set as Default</Label>
                <p className="text-sm text-muted-foreground">
                  Make this the default template for new projects
                </p>
              </div>
              <Switch
                id="default"
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
            </div>
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isViewMode ? "Close" : "Cancel"}
          </Button>
          {!isViewMode && (
            <Button
              onClick={handleSave}
              disabled={!name.trim()}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {template ? "Save Changes" : "Create Template"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
