"use client"

import { useEffect, useState } from "react"
import { X, HelpCircle, ChevronDown, ChevronRight, Layers, Boxes } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { AssetType, FieldsetData } from "@/app/page"
import { Switch } from "@/components/ui/switch"
import { mergeFieldsetWithAssemblyLinkage } from "@/lib/merge-fieldset-assembly"

// Fieldset section structure
interface FieldsetSection {
  name: string
  fields: string[]
}

interface AssetTypeSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetType: AssetType | null
  /** Full template type list — used for assembly linkage field injection on fieldsets. */
  allAssetTypes?: AssetType[]
  onSave: (data: {
    name: string
    code: string
    description: string
    isAssembly?: boolean
  }) => void
  fieldsets: Record<string, FieldsetData>
}

function FieldsetSectionDisplay({ section, isExpanded, onToggle }: { 
  section: FieldsetSection
  isExpanded: boolean
  onToggle: () => void 
}) {
  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted text-left transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{section.name}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {section.fields.length} fields
        </span>
      </button>
      {isExpanded && (
        <div className="px-3 py-2 space-y-1 bg-background">
          {section.fields.map((field, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 text-sm text-muted-foreground py-1"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              {field}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AssetTypeSheet({
  open,
  onOpenChange,
  assetType,
  allAssetTypes = [],
  onSave,
  fieldsets,
}: AssetTypeSheetProps) {
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [isAssembly, setIsAssembly] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  // Get fieldset data for the current asset type from the passed fieldsets prop
  const rawFieldset = assetType ? fieldsets[assetType.fieldset] || fieldsets["Procore Default"] : null
  const fieldset =
    assetType && rawFieldset
      ? mergeFieldsetWithAssemblyLinkage(rawFieldset, allAssetTypes, assetType.id)
      : rawFieldset

  const toggleSection = (sectionName: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sectionName)) {
        newSet.delete(sectionName)
      } else {
        newSet.add(sectionName)
      }
      return newSet
    })
  }

  useEffect(() => {
    if (assetType) {
      setName(assetType.name)
      setCode(assetType.code)
      setDescription(assetType.description)
      setIsAssembly(!!assetType.isAssembly)
      // Expand first section by default
      const fs = fieldsets[assetType.fieldset] || fieldsets["Procore Default"]
      const merged =
        fs && mergeFieldsetWithAssemblyLinkage(fs, allAssetTypes, assetType.id)
      const firstName = merged?.sections?.[0]?.name ?? fs?.sections?.[0]?.name
      if (firstName) {
        setExpandedSections(new Set([firstName]))
      }
    } else {
      setName("")
      setCode("")
      setDescription("")
      setIsAssembly(false)
      setExpandedSections(new Set())
    }
  }, [assetType, open, fieldsets, allAssetTypes])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({ name, code, description, isAssembly })
  }

  const isEditing = !!assetType

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[450px] sm:max-w-[450px] p-0 flex flex-col gap-0 h-full min-h-0 overflow-hidden">
        <SheetHeader className="shrink-0 p-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold">
              {isEditing ? `Edit ${assetType.name}` : "Create Type"}
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full bg-zinc-800 text-white hover:bg-zinc-700"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="code" className="text-sm font-medium flex items-center gap-1">
                Code <span className="text-destructive">*</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="ml-1">
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Unique identifier code for the asset type</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter code"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description"
                rows={4}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-3 py-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-orange-600" />
                  <Label htmlFor="assembly" className="text-sm font-medium cursor-pointer">
                    Assembly
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Child types inherit a field to select a parent asset of this type (e.g. whole
                  turbine for blades and generators).
                </p>
              </div>
              <Switch
                id="assembly"
                checked={isAssembly}
                onCheckedChange={setIsAssembly}
              />
            </div>

            {/* Fieldset Display */}
            {isEditing && fieldset && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-orange-500" />
                  <Label className="text-sm font-medium">
                    Fieldset: {assetType?.fieldset}
                  </Label>
                </div>
                <div className="space-y-2">
                  {fieldset.sections.map((section) => (
                    <FieldsetSectionDisplay
                      key={section.name}
                      section={section}
                      isExpanded={expandedSections.has(section.name)}
                      onToggle={() => toggleSection(section.name)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t bg-background p-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Save
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
