"use client"

import { useState } from "react"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { MoreVertical, Star } from "lucide-react"
import { cn } from "@/lib/utils"

export interface AssetTemplate {
  id: string
  name: string
  isDefault?: boolean
  assignedProjects: string[]
  totalProjects: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
}

interface AssetTemplatesTableProps {
  templates: AssetTemplate[]
  projects: Project[]
  onEdit: (template: AssetTemplate) => void
  onView: (template: AssetTemplate) => void
  onCopy: (template: AssetTemplate) => void
  onDelete: (templateId: string) => void
  onSetDefault: (templateId: string) => void
  onAssignProjects: (templateId: string, projectIds: string[]) => void
}

export function AssetTemplatesTable({
  templates,
  projects,
  onEdit,
  onView,
  onCopy,
  onDelete,
  onSetDefault,
  onAssignProjects,
}: AssetTemplatesTableProps) {
  const [projectsDialogOpen, setProjectsDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<AssetTemplate | null>(null)
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<AssetTemplate | null>(null)

  const handleAssignProjectsClick = (template: AssetTemplate) => {
    setSelectedTemplate(template)
    setSelectedProjects(template.assignedProjects)
    setProjectsDialogOpen(true)
  }

  const handleSaveProjects = () => {
    if (selectedTemplate) {
      onAssignProjects(selectedTemplate.id, selectedProjects)
    }
    setProjectsDialogOpen(false)
    setSelectedTemplate(null)
    setSelectedProjects([])
  }

  const handleDeleteClick = (template: AssetTemplate) => {
    setTemplateToDelete(template)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = () => {
    if (templateToDelete) {
      onDelete(templateToDelete.id)
    }
    setDeleteDialogOpen(false)
    setTemplateToDelete(null)
  }

  const toggleProject = (projectId: string) => {
    setSelectedProjects((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    )
  }

  return (
    <>
      <div className="border rounded-lg overflow-hidden bg-background">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-32"></TableHead>
              <TableHead className="min-w-[300px]">
                <div className="flex items-center gap-1">
                  Name
                  <button className="text-muted-foreground hover:text-foreground">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 11l5-5m0 0l5 5m-5-5v12"
                      />
                    </svg>
                  </button>
                </div>
              </TableHead>
              <TableHead className="min-w-[150px]">Created By</TableHead>
              <TableHead className="min-w-[150px]">Last Modified</TableHead>
              <TableHead className="min-w-[150px]">Assigned Projects</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <p>No templates found</p>
                    <p className="text-sm">Create a new template to get started</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              templates.map((template) => (
                <TableRow key={template.id} className="group hover:bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => onEdit(template)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => onView(template)}
                      >
                        View
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onEdit(template)}
                        className="text-blue-600 hover:underline font-medium text-left"
                      >
                        {template.name}
                      </button>
                      {template.isDefault && (
                        <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                          <Star className="h-3 w-3 fill-current" />
                          Default
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {template.createdBy}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(template.updatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleAssignProjectsClick(template)}
                      className="text-blue-600 hover:underline"
                    >
                      {template.assignedProjects.length}/{template.totalProjects} Projects
                    </button>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onCopy(template)}>
                          Copy
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onSetDefault(template.id)}
                          disabled={template.isDefault}
                        >
                          Set as Default Template
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleDeleteClick(template)}
                          disabled={template.isDefault}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Assign Projects Dialog */}
      <Dialog open={projectsDialogOpen} onOpenChange={setProjectsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Projects</DialogTitle>
            <DialogDescription>
              Select which projects will use the "{selectedTemplate?.name}" template.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto border rounded-lg">
            {projects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50",
                  selectedProjects.includes(project.id) && "bg-muted/30"
                )}
                onClick={() => toggleProject(project.id)}
              >
                <Checkbox
                  checked={selectedProjects.includes(project.id)}
                  onCheckedChange={() => toggleProject(project.id)}
                />
                <span className="text-sm">{project.name}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProjects}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{templateToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
