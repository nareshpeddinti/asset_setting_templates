"use client"

import { useState, useMemo } from "react"
import { Search, Plus, Check, Settings2 } from "lucide-react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"

// Existing custom fields that can be mapped to
export const EXISTING_CUSTOM_FIELDS = [
  { id: "cf1", name: "(CF) NEW FIELD", type: "Plain Text (Short)" },
  { id: "cf2", name: "(CF) Number", type: "Number" },
  { id: "cf3", name: "(CF) Single Select", type: "Single Select (Dropdown)" },
  { id: "cf4", name: "Orficf", type: "Plain Text (Short)" },
  { id: "cf5", name: "A", type: "Multi Select" },
  { id: "cf6", name: "adsd", type: "Number" },
  { id: "cf7", name: "Alphabet", type: "Multi Select" },
  { id: "cf8", name: "Amount of gummy bears on site", type: "Number" },
  { id: "cf9", name: "Asset", type: "Multi Select" },
  { id: "cf10", name: "Assets", type: "Company" },
]

export const FIELD_TYPES = [
  "Plain Text (Short)",
  "Plain Text (Long)",
  "Number",
  "Date",
  "Single Select (Dropdown)",
  "Multi Select",
  "Checkbox",
  "Company",
  "URL",
]

export interface CustomFieldMapping {
  id: string
  importedName: string
  mappedFieldId: string | null // null means create new
  mappedFieldName: string
  fieldType: string
  isNew: boolean
}

interface CustomFieldSelectorProps {
  value: string | null
  customFieldName: string
  onChange: (fieldId: string | null, fieldName: string, fieldType: string, isNew: boolean) => void
}

function CustomFieldSelector({ value, customFieldName, onChange }: CustomFieldSelectorProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const filteredFields = useMemo(() => {
    if (!searchValue) return EXISTING_CUSTOM_FIELDS
    return EXISTING_CUSTOM_FIELDS.filter((field) =>
      field.name.toLowerCase().includes(searchValue.toLowerCase())
    )
  }, [searchValue])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{customFieldName}</span>
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search custom fields..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>
              <div className="py-3 px-2 text-center">
                <p className="text-sm text-muted-foreground mb-2">No matching field found</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onChange(null, searchValue || customFieldName, "Plain Text (Short)", true)
                    setOpen(false)
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create "{searchValue || customFieldName}"
                </Button>
              </div>
            </CommandEmpty>
            <CommandGroup heading="Existing Custom Fields">
              {filteredFields.map((field) => (
                <CommandItem
                  key={field.id}
                  value={field.name}
                  onSelect={() => {
                    onChange(field.id, field.name, field.type, false)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === field.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{field.name}</span>
                    <span className="text-xs text-muted-foreground">{field.type}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Create New">
              <CommandItem
                onSelect={() => {
                  onChange(null, customFieldName, "Plain Text (Short)", true)
                  setOpen(false)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                <span>Create new field "{customFieldName}"</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

interface CustomFieldMappingTableProps {
  mappings: CustomFieldMapping[]
  onUpdate?: (mappings: CustomFieldMapping[]) => void
}

export function CustomFieldMappingTable({ mappings, onUpdate }: CustomFieldMappingTableProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredMappings = useMemo(() => {
    if (!searchQuery) return mappings
    return mappings.filter((m) =>
      m.importedName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.mappedFieldName.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [mappings, searchQuery])

  const updateMapping = (
    id: string,
    updates: Partial<CustomFieldMapping>
  ) => {
    if (onUpdate) {
      onUpdate(
        mappings.map((m) => (m.id === id ? { ...m, ...updates } : m))
      )
    }
  }

  const isReadOnly = !onUpdate

  if (mappings.length === 0) {
    return (
      <div className="flex-1 border rounded-lg flex items-center justify-center bg-muted/30 min-h-[400px]">
        <div className="text-center text-muted-foreground">
          <Settings2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">No imported fields to map</p>
          <p className="text-xs mt-1">
            Import fieldset data using Bulk Create to see fields for mapping
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search fields..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            {mappings.filter((m) => m.isNew).length} new fields
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {mappings.filter((m) => !m.isNew).length} mapped fields
          </span>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[300px]">Imported Field Name</TableHead>
              <TableHead className="w-[350px]">Custom Field Name</TableHead>
              <TableHead>Field Type</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMappings.map((mapping) => (
              <TableRow key={mapping.id}>
                <TableCell className="font-medium">
                  {mapping.importedName}
                </TableCell>
                <TableCell>
                  <CustomFieldSelector
                    value={mapping.mappedFieldId}
                    customFieldName={mapping.mappedFieldName}
                    onChange={(fieldId, fieldName, fieldType, isNew) => {
                      updateMapping(mapping.id, {
                        mappedFieldId: fieldId,
                        mappedFieldName: fieldName,
                        fieldType: fieldType,
                        isNew: isNew,
                      })
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={mapping.fieldType}
                    onValueChange={(value) => {
                      updateMapping(mapping.id, { fieldType: value })
                    }}
                    disabled={!mapping.isNew}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {mapping.isNew ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                      <Plus className="h-3 w-3" />
                      New
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
                      <Check className="h-3 w-3" />
                      Mapped
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
