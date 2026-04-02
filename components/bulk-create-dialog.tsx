"use client"

import { useState, useMemo, useRef } from "react"
import { X, CheckCircle2, FolderTree, Upload, File, ClipboardCopy } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { parseAssetData } from "@/lib/asset-data-parser"
import { extractTextFromFile, ACCEPTED_FILE_EXTENSIONS } from "@/lib/file-extractors"
import type { Fieldset, HierarchyItem } from "@/lib/bulk-hierarchy-types"
import {
  BulkCreatePreviewTree,
  countAll,
  findAtPath,
  updateAtPath,
  deleteAtPath,
} from "@/components/bulk-create-preview-body"
import {
  deleteFieldsetAtFlatIndex,
  updateFieldsetAtFlatIndex,
} from "@/lib/fieldset-section-helpers"
import {
  buildBulkImportCopyPrompt,
  buildBulkImportFormatHelperPrompt,
} from "@/lib/bulk-import-copy-prompt"

export type { HierarchyItem, Fieldset } from "@/lib/bulk-hierarchy-types"

interface BulkCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (items: HierarchyItem[], fieldsets: Fieldset[]) => void
}

export function BulkCreateDialog({
  open,
  onOpenChange,
  onImport,
}: BulkCreateDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [hierarchy, setHierarchy] = useState<HierarchyItem[]>([])
  const [fieldsets, setFieldsets] = useState<Fieldset[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  /** Raw extracted text from last upload — used for "Copy prompt for LLM". */
  const [uploadedRawText, setUploadedRawText] = useState("")
  const [copyPromptStatus, setCopyPromptStatus] = useState<"idle" | "copied" | "error">("idle")

  const itemCount = useMemo(() => countAll(hierarchy), [hierarchy])

  const convertItem = (src: ReturnType<typeof parseAssetData>["hierarchy"][number]): HierarchyItem => ({
    code: src.code,
    name: src.name,
    description: src.description,
    level: src.level,
    parentCode: src.parentCode,
    fieldsetCode: src.fieldsetCode,
    commonFields: src.commonFields ? [...src.commonFields] : undefined,
    children: src.children.map(convertItem),
  })

  const processContent = (content: string, name: string) => {
    const result = parseAssetData(content)
    const hierarchyNext = result.hierarchy.map(convertItem)
    const fieldsetsNext = result.fieldsets.map((fs) => ({
      code: fs.code,
      name: fs.name,
      fields: [...fs.fields],
      inheritedFields: fs.inheritedFields ? [...fs.inheritedFields] : undefined,
      sections: fs.sections
        ? fs.sections.map((s) => ({ name: s.name, fields: [...s.fields] }))
        : undefined,
      importedFieldTypes: fs.importedFieldTypes
        ? { ...fs.importedFieldTypes }
        : undefined,
    }))

    setHierarchy(hierarchyNext)
    setFieldsets(fieldsetsNext)
    setFilename(name)
    setShowPreview(true)
  }

  const handleFile = async (file: File) => {
    if (!file) return
    setIsProcessing(true)
    setCopyPromptStatus("idle")
    try {
      const content = await extractTextFromFile(file)
      setUploadedRawText(content)
      if (!content.trim()) {
        alert("The uploaded file appears to be empty or no text could be extracted.")
        return
      }
      processContent(content, file.name)
    } catch (e) {
      alert(`Error reading file: ${e instanceof Error ? e.message : "Unknown error"}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ""
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleUpdateItem = (path: number[], updates: Partial<HierarchyItem>) => {
    setHierarchy((prev) => updateAtPath(prev, path, (item) => ({ ...item, ...updates })))
  }

  const handleDeleteItem = (path: number[]) => {
    setHierarchy((prev) => deleteAtPath(prev, path))
  }

  const handleUpdateField = (itemPath: number[], fieldIdx: number, value: string) => {
    const item = findAtPath(hierarchy, itemPath)
    if (!item?.fieldsetCode) return
    const code = item.fieldsetCode
    setFieldsets((prev) =>
      prev.map((fs) => (fs.code !== code ? fs : updateFieldsetAtFlatIndex(fs, fieldIdx, value)))
    )
  }

  const handleDeleteField = (itemPath: number[], fieldIdx: number) => {
    const item = findAtPath(hierarchy, itemPath)
    if (!item?.fieldsetCode) return
    const code = item.fieldsetCode
    setFieldsets((prev) =>
      prev.map((fs) => (fs.code !== code ? fs : deleteFieldsetAtFlatIndex(fs, fieldIdx)))
    )
  }

  const handleUpdateCommonField = (itemPath: number[], fieldIdx: number, value: string) => {
    setHierarchy((prev) =>
      updateAtPath(prev, itemPath, (item) => {
        const cf = item.commonFields ?? []
        const next = cf.map((f, i) => (i === fieldIdx ? value : f))
        return { ...item, commonFields: next }
      })
    )
  }

  const handleDeleteCommonField = (itemPath: number[], fieldIdx: number) => {
    setHierarchy((prev) =>
      updateAtPath(prev, itemPath, (item) => {
        const cf = item.commonFields ?? []
        const next = cf.filter((_, i) => i !== fieldIdx)
        return { ...item, commonFields: next.length ? next : undefined }
      })
    )
  }

  const copyStringToClipboard = async (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.setAttribute("readonly", "")
      ta.style.position = "fixed"
      ta.style.left = "-9999px"
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
  }

  /** After preview: fix parse + skill + file + current hierarchy snapshot. */
  const handleCopyPromptForLlm = async () => {
    const text = buildBulkImportCopyPrompt({
      filename,
      uploadedRawText,
    })
    try {
      await copyStringToClipboard(text)
      setCopyPromptStatus("copied")
      window.setTimeout(() => setCopyPromptStatus("idle"), 2500)
    } catch {
      setCopyPromptStatus("error")
      window.setTimeout(() => setCopyPromptStatus("idle"), 3000)
    }
  }

  /** Upload step: prompt LLM to format any source file into Export CSV shape (embeds file text if already loaded). */
  const handleCopyFormatHelperPrompt = async () => {
    const text = buildBulkImportFormatHelperPrompt({
      filename,
      uploadedRawText,
    })
    try {
      await copyStringToClipboard(text)
      setCopyPromptStatus("copied")
      window.setTimeout(() => setCopyPromptStatus("idle"), 2500)
    } catch {
      setCopyPromptStatus("error")
      window.setTimeout(() => setCopyPromptStatus("idle"), 3000)
    }
  }

  const handleImport = () => {
    const fieldsetsToImport: Fieldset[] = fieldsets.map((fs) => ({
      code: fs.code,
      name: fs.name,
      fields: [...fs.fields],
      inheritedFields: fs.inheritedFields ? [...fs.inheritedFields] : undefined,
      sections: fs.sections
        ? fs.sections.map((s) => ({ name: s.name, fields: [...s.fields] }))
        : undefined,
      importedFieldTypes: fs.importedFieldTypes
        ? { ...fs.importedFieldTypes }
        : undefined,
    }))
    onImport(hierarchy, fieldsetsToImport)
    onOpenChange(false)
    setFilename(null)
    setHierarchy([])
    setFieldsets([])
    setShowPreview(false)
    setUploadedRawText("")
    setCopyPromptStatus("idle")
  }

  const reset = () => {
    setShowPreview(false)
    setFilename(null)
    setHierarchy([])
    setFieldsets([])
    setUploadedRawText("")
    setCopyPromptStatus("idle")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          "p-0 flex flex-col overflow-hidden h-auto max-h-[92vh]",
          showPreview ? "min-w-[90vw] max-w-[1800px] w-[95vw]" : "max-w-2xl"
        )}
      >
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold">
                Import Asset Hierarchy &amp; Fieldsets
              </DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 shrink-0"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {!showPreview && (
          <div className="p-6 space-y-6">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_EXTENSIONS}
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing}
            />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all",
                isDragging
                  ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20"
                  : "border-muted-foreground/25 bg-muted/50 hover:border-orange-300"
              )}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <Upload className="h-8 w-8 text-orange-600" />
                </div>
                <div>
                  <p className="text-base font-semibold">Upload Asset Data</p>
                  <p className="text-sm text-muted-foreground mt-1">Drag &amp; drop or click to browse</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Supports TXT, CSV, TSV, JSON, XLSX, XLS, PDF, images (PNG, JPG, WEBP, GIF)
                </p>
                {isProcessing && <p className="text-sm text-orange-600 animate-pulse">Processing…</p>}
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg space-y-3 border border-border">
              <p className="text-sm font-medium text-foreground">Format file for import</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Use an external LLM to convert your spreadsheet or notes into the required CSV (same shape
                as <strong>Export CSV</strong> /{" "}
                <code className="text-xs bg-background px-1 rounded">Asset_Classification_Deep_Hierarchy</code>
                ). Copy the prompt, paste it into ChatGPT or Claude, get a downloadable{" "}
                <code className="text-xs bg-background px-1 rounded">.csv</code>, then upload that file here.
                If you already chose a file below, the prompt can include its text — copy again after selecting.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 w-full sm:w-auto"
                onClick={handleCopyFormatHelperPrompt}
                disabled={isProcessing}
                title="Copies a prompt to format your data into the import CSV shape via an external LLM."
              >
                <ClipboardCopy className="h-4 w-4" />
                Copy LLM prompt to format file
                {copyPromptStatus === "copied" && (
                  <span className="text-xs text-green-600 dark:text-green-400">Copied</span>
                )}
                {copyPromptStatus === "error" && (
                  <span className="text-xs text-destructive">Failed</span>
                )}
              </Button>
            </div>
          </div>
        )}

        {showPreview && (
          <div className="flex-1 overflow-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-2 text-base">
                  <File className="h-4 w-4 text-orange-600" />
                  {filename}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {itemCount > 0 && `${itemCount} asset types`}
                  {itemCount > 0 && fieldsets.length > 0 && " · "}
                  {fieldsets.length > 0 && `${fieldsets.length} fieldsets`}
                  <span className="ml-2 text-xs text-muted-foreground">· Built-in parser</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPromptForLlm}
                  className="gap-1.5"
                  title="Copies a prompt for ChatGPT, Claude, etc.: ask for a downloadable .csv file matching Export CSV, then upload that file here."
                >
                  <ClipboardCopy className="h-4 w-4" />
                  Copy prompt for LLM
                  {copyPromptStatus === "copied" && (
                    <span className="text-xs text-green-600 dark:text-green-400">Copied</span>
                  )}
                  {copyPromptStatus === "error" && (
                    <span className="text-xs text-destructive">Failed</span>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={reset}>
                  Upload different file
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <FolderTree className="h-4 w-4 text-orange-600" />
                Preview
              </Label>
              <div className="ml-auto flex gap-3">
                {itemCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    {itemCount} items
                  </span>
                )}
                {fieldsets.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-blue-600">
                    <CheckCircle2 className="h-3 w-3" />
                    {fieldsets.length} fieldsets
                  </span>
                )}
              </div>
            </div>

            <BulkCreatePreviewTree
              hierarchy={hierarchy}
              fieldsets={fieldsets}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              onUpdateField={handleUpdateField}
              onDeleteField={handleDeleteField}
              onUpdateCommonField={handleUpdateCommonField}
              onDeleteCommonField={handleDeleteCommonField}
            />
          </div>
        )}

        {showPreview && (
          <div className="flex items-center justify-between p-6 border-t shrink-0 bg-background">
            <p className="text-sm text-muted-foreground">
              {itemCount > 0 && `${itemCount} asset types`}
              {itemCount > 0 && fieldsets.length > 0 && " · "}
              {fieldsets.length > 0 && `${fieldsets.length} fieldsets`}
              {(itemCount > 0 || fieldsets.length > 0) && " will be imported"}
            </p>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handleImport}
                disabled={itemCount === 0 && fieldsets.length === 0}
              >
                Import
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
