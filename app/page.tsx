"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Header } from "@/components/header"
import { AssetTemplatesTable, type AssetTemplate } from "@/components/asset-templates-table"
import { AssetTemplateSheet } from "@/components/asset-template-sheet"
import {
  AssetTemplateDetail,
  remapAssetTypesWithNewIds,
  type TemplateAssetConfig,
} from "@/components/asset-template-detail"
import { GlobalAssetSettings } from "@/components/global-asset-settings"
import { cloneTemplateConfig, createEmptyTemplateConfig } from "@/lib/clone-template-asset-config"
import { getSeedGlobalCatalog } from "@/lib/seed-global-catalog"
import {
  syncFlatFieldsetsFromPrimaryClient,
} from "@/lib/build-multi-hierarchy-global-catalog"
import { COPY_SOURCE_COMPANY_CATALOG_ID } from "@/lib/copy-template-sources"
import { stripTemplateIdFromCatalogAssignments } from "@/lib/template-catalog-assignments"
import { AssetsList } from "@/components/assets-list"
import { CreateAssetSheet } from "@/components/create-asset-sheet"
import { Button } from "@/components/ui/button"
import { Plus, ChevronDown, Package, LayoutTemplate, Layers } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ASSET_REGISTER_QUERY } from "@/lib/asset-register-link"
import { COMPANY_PROJECTS } from "@/lib/company-projects"
import { PROJECT_QUERY_PARAM, resolveTemplateIdForProject } from "@/lib/project-template"
import { cn } from "@/lib/utils"

export interface AssetType {
  id: string
  name: string
  code: string
  description: string
  /** Active fieldset object key in the catalog. */
  fieldset: string
  /**
   * Optional list of alternate fieldset keys this type may reference (e.g. catalog presets).
   * Should include {@link fieldset} or it may be merged in at runtime.
   */
  fieldsetCandidates?: string[]
  statusGroup: string
  /** When true, this type represents a whole assembly (e.g. full turbine). Child types gain a default field to link to an asset of this type. */
  isAssembly?: boolean
  hasSubtypes?: boolean
  isExpanded?: boolean
  parentId?: string
  children?: AssetType[]
}

export interface ParsedFieldset {
  code: string
  sections: {
    name: string
    fields: string[]
  }[]
}

export interface FieldsetData {
  name: string
  sections: {
    name: string
    fields: string[]
  }[]
  /** ISO timestamp; shown on Fieldsets admin table when set. */
  updatedAt?: string
  updatedBy?: string
}

const SAMPLE_PROJECTS = COMPANY_PROJECTS

// Initial templates with meaningful data
const initialTemplates: AssetTemplate[] = [
  {
    id: "template-default",
    name: "Procore Default Template",
    isDefault: true,
    assignedProjects: [],
    totalProjects: SAMPLE_PROJECTS.length,
    createdBy: "System Admin",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "template-residential",
    name: "Greystar Residential Template",
    isDefault: false,
    assignedProjects: ["res-1", "res-2", "res-3", "res-4", "res-5"],
    totalProjects: SAMPLE_PROJECTS.length,
    createdBy: "John Smith",
    createdAt: "2025-08-15T10:30:00.000Z",
    updatedAt: "2026-02-20T14:45:00.000Z",
  },
  {
    id: "template-commercial",
    name: "Metro Commercial Building Template",
    isDefault: false,
    assignedProjects: ["com-1", "com-2", "com-3", "com-4", "com-5"],
    totalProjects: SAMPLE_PROJECTS.length,
    createdBy: "Sarah Johnson",
    createdAt: "2025-09-01T09:00:00.000Z",
    updatedAt: "2026-03-01T11:20:00.000Z",
  },
  {
    id: "template-healthcare",
    name: "HCA Hospital Template",
    isDefault: false,
    assignedProjects: ["hc-1", "hc-2", "hc-3", "hc-4"],
    totalProjects: SAMPLE_PROJECTS.length,
    createdBy: "Michael Chen",
    createdAt: "2025-10-10T08:15:00.000Z",
    updatedAt: "2026-02-28T16:30:00.000Z",
  },
  {
    id: "template-industrial",
    name: "Eastside Manufacturing & Logistics Template",
    isDefault: false,
    assignedProjects: ["ind-1", "ind-2", "ind-3", "ind-4"],
    totalProjects: SAMPLE_PROJECTS.length,
    createdBy: "Emily Davis",
    createdAt: "2025-11-05T13:45:00.000Z",
    updatedAt: "2026-01-15T10:00:00.000Z",
  },
  {
    id: "template-datacenter-aws",
    name: "AWS Data Centre Template",
    isDefault: false,
    assignedProjects: ["dc-1"],
    totalProjects: SAMPLE_PROJECTS.length,
    createdBy: "Robert Wilson",
    createdAt: "2025-12-01T11:00:00.000Z",
    updatedAt: "2026-03-05T09:30:00.000Z",
  },
  {
    id: "template-datacenter-meta",
    name: "Meta Data Centre Template",
    isDefault: false,
    assignedProjects: ["dc-2"],
    totalProjects: SAMPLE_PROJECTS.length,
    createdBy: "Robert Wilson",
    createdAt: "2025-12-01T11:00:00.000Z",
    updatedAt: "2026-03-05T09:30:00.000Z",
  },
  {
    id: "template-datacenter-oracle",
    name: "Oracle Data Centre Template",
    isDefault: false,
    assignedProjects: ["dc-3"],
    totalProjects: SAMPLE_PROJECTS.length,
    createdBy: "Robert Wilson",
    createdAt: "2025-12-01T11:00:00.000Z",
    updatedAt: "2026-03-05T09:30:00.000Z",
  },
  {
    id: "template-windfarm",
    name: "North Sea Offshore Wind Template",
    isDefault: false,
    assignedProjects: ["wf-1", "wf-2", "wf-3"],
    totalProjects: SAMPLE_PROJECTS.length,
    createdBy: "Elena Vasquez",
    createdAt: "2025-11-18T14:20:00.000Z",
    updatedAt: "2026-03-10T08:15:00.000Z",
  },
  {
    id: "template-highways",
    name: "Interstate Highway & Corridor Template",
    isDefault: false,
    assignedProjects: ["hw-1", "hw-2", "hw-3"],
    totalProjects: SAMPLE_PROJECTS.length,
    createdBy: "Daniel Okonkwo",
    createdAt: "2025-12-08T09:00:00.000Z",
    updatedAt: "2026-03-12T11:00:00.000Z",
  },
  {
    id: "template-airport",
    name: "DNATA Airport & Airfield Template",
    isDefault: false,
    assignedProjects: ["ap-1", "ap-2", "ap-3"],
    totalProjects: SAMPLE_PROJECTS.length,
    createdBy: "Priya Natarajan",
    createdAt: "2026-01-14T13:30:00.000Z",
    updatedAt: "2026-03-14T10:20:00.000Z",
  },
]

type CompanyNav = "assets" | "templates" | "globalAssetSettings"

function AssetsPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false)
  /** When true, project register map view fills viewport — main column scroll is disabled. */
  const [assetsMapViewportLock, setAssetsMapViewportLock] = useState(false)
  
  // Navigation: assets register | template list | asset settings (types + fieldsets)
  const [activeNav, setActiveNav] = useState<CompanyNav>("globalAssetSettings")
  const [activeMainTab, setActiveMainTab] = useState<"list" | "recycle-bin">("list")

  // Template state — each template holds a snapshot; edited from Asset settings in the nav
  const [templates, setTemplates] = useState<AssetTemplate[]>(initialTemplates)
  const [globalCatalog, setGlobalCatalog] = useState<TemplateAssetConfig>(() =>
    cloneTemplateConfig(getSeedGlobalCatalog())
  )
  const [templateAssetConfig, setTemplateAssetConfig] = useState<Record<string, TemplateAssetConfig>>(() =>
    Object.fromEntries(initialTemplates.map((t) => [t.id, createEmptyTemplateConfig()]))
  )
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<AssetTemplate | null>(null)
  
  // Template detail view state
  const [selectedTemplate, setSelectedTemplate] = useState<AssetTemplate | null>(null)
  const [templateViewMode, setTemplateViewMode] = useState<"edit" | "view">("edit")
  
  // Create Asset sheet state
  const [createAssetSheetOpen, setCreateAssetSheetOpen] = useState(false)

  const deepLinkTemplate = searchParams.get(ASSET_REGISTER_QUERY.template)
  const deepLinkAsset = searchParams.get(ASSET_REGISTER_QUERY.asset)
  const assetRegisterDeepLink =
    deepLinkTemplate && deepLinkAsset
      ? { templateId: deepLinkTemplate, assetId: deepLinkAsset }
      : null

  const projectParam = searchParams.get(PROJECT_QUERY_PARAM)
  const selectedProjectId = useMemo(() => {
    if (!projectParam) return null
    return COMPANY_PROJECTS.some((p) => p.id === projectParam) ? projectParam : null
  }, [projectParam])

  const selectedProject = useMemo(
    () => (selectedProjectId ? COMPANY_PROJECTS.find((p) => p.id === selectedProjectId) ?? null : null),
    [selectedProjectId]
  )

  const setProjectInUrl = useCallback(
    (projectId: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (projectId) {
        params.set(PROJECT_QUERY_PARAM, projectId)
      } else {
        params.delete(PROJECT_QUERY_PARAM)
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname || "/", { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const lockedTemplateIdForProject = useMemo(() => {
    if (!selectedProjectId) return null
    return resolveTemplateIdForProject(selectedProjectId, templates)
  }, [selectedProjectId, templates])

  useEffect(() => {
    setTemplateAssetConfig((prev) => {
      const next = { ...prev }
      for (const t of templates) {
        if (!next[t.id]) next[t.id] = createEmptyTemplateConfig()
      }
      for (const id of Object.keys(next)) {
        if (!templates.some((tm) => tm.id === id)) delete next[id]
      }
      return next
    })
  }, [templates, globalCatalog])

  const resolveTemplateConfig = useCallback(
    (id: string): TemplateAssetConfig =>
      id === COPY_SOURCE_COMPANY_CATALOG_ID
        ? syncFlatFieldsetsFromPrimaryClient(cloneTemplateConfig(globalCatalog))
        : templateAssetConfig[id] ?? createEmptyTemplateConfig(),
    [templateAssetConfig, globalCatalog]
  )

  useEffect(() => {
    if (assetRegisterDeepLink) {
      setActiveNav("assets")
    }
  }, [assetRegisterDeepLink])

  useEffect(() => {
    if (selectedProjectId) {
      setActiveNav("assets")
    }
  }, [selectedProjectId])

  /** Asset Settings / template detail exist only at company (no project in URL). */
  const isCompanyLevel = !selectedProjectId

  useEffect(() => {
    if (selectedProjectId && selectedTemplate) {
      setSelectedTemplate(null)
    }
  }, [selectedProjectId, selectedTemplate])

  useEffect(() => {
    if (activeNav !== "assets") setAssetsMapViewportLock(false)
  }, [activeNav])

  // Template handlers
  const handleCreateTemplate = () => {
    setEditingTemplate(null)
    setTemplateSheetOpen(true)
  }

  const handleEditTemplate = (template: AssetTemplate) => {
    setSelectedTemplate(template)
    setTemplateViewMode("edit")
  }

  const handleViewTemplate = (template: AssetTemplate) => {
    setSelectedTemplate(template)
    setTemplateViewMode("view")
  }

  const handleBackToList = () => {
    setSelectedTemplate(null)
  }

  const handleSaveTemplateSettings = (data: Partial<AssetTemplate>) => {
    if (editingTemplate) {
      setTemplates((prev) =>
        prev.map((t) => {
          if (t.id === editingTemplate.id) {
            if (data.isDefault && !editingTemplate.isDefault) {
              return { ...t, ...data, updatedAt: new Date().toISOString() }
            }
            return { ...t, ...data, updatedAt: new Date().toISOString() }
          }
          if (data.isDefault) {
            return { ...t, isDefault: false }
          }
          return t
        })
      )
    } else {
      const newTemplate: AssetTemplate = {
        id: `template-${Date.now()}`,
        name: data.name || "New Template",
        isDefault: data.isDefault || false,
        assignedProjects: [],
        totalProjects: SAMPLE_PROJECTS.length,
        createdBy: "Current User",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      setTemplateAssetConfig((prev) => ({
        ...prev,
        [newTemplate.id]: createEmptyTemplateConfig(),
      }))

      if (newTemplate.isDefault) {
        setTemplates((prev) => [
          ...prev.map((t) => ({ ...t, isDefault: false })),
          newTemplate,
        ])
      } else {
        setTemplates((prev) => [...prev, newTemplate])
      }
    }
    setTemplateSheetOpen(false)
    setEditingTemplate(null)
  }

  const createTemplateFromName = useCallback((name: string): AssetTemplate => {
    const trimmed = name.trim() || "New Template"
    const newTemplate: AssetTemplate = {
      id: `template-${Date.now()}`,
      name: trimmed,
      isDefault: false,
      assignedProjects: [],
      totalProjects: SAMPLE_PROJECTS.length,
      createdBy: "Current User",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setTemplateAssetConfig((prev) => ({
      ...prev,
      [newTemplate.id]: createEmptyTemplateConfig(),
    }))
    setTemplates((prev) => [...prev, newTemplate])
    return newTemplate
  }, [])

  const handleSaveTemplateDetail = (template: AssetTemplate) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === template.id ? template : t))
    )
  }

  const handleCopyTemplate = (template: AssetTemplate) => {
    const copiedTemplate: AssetTemplate = {
      ...template,
      id: `template-${Date.now()}`,
      name: `${template.name} (Copy)`,
      isDefault: false,
      assignedProjects: [],
      createdBy: "Current User",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const base = templateAssetConfig[template.id] ?? createEmptyTemplateConfig()
    const clonedTypes = JSON.parse(JSON.stringify(base.assetTypes)) as AssetType[]
    const clonedFs = JSON.parse(JSON.stringify(base.fieldsets)) as TemplateAssetConfig["fieldsets"]
    const clonedByClient = base.fieldsetsByClient
      ? (JSON.parse(JSON.stringify(base.fieldsetsByClient)) as NonNullable<
          TemplateAssetConfig["fieldsetsByClient"]
        >)
      : undefined
    const clonedProj = base.projectFieldsetKeys
      ? (JSON.parse(JSON.stringify(base.projectFieldsetKeys)) as Record<string, string>)
      : undefined
    setTemplateAssetConfig((prev) => ({
      ...prev,
      [copiedTemplate.id]: {
        assetTypes: remapAssetTypesWithNewIds(clonedTypes),
        fieldsets: clonedFs,
        ...(clonedByClient ? { fieldsetsByClient: clonedByClient } : {}),
        ...(clonedProj ? { projectFieldsetKeys: clonedProj } : {}),
      },
    }))
    setTemplates((prev) => [...prev, copiedTemplate])
  }

  const handleDeleteTemplate = (templateId: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== templateId))
    setTemplateAssetConfig((prev) => {
      const { [templateId]: _removed, ...rest } = prev
      return rest
    })
    setGlobalCatalog((prev) =>
      syncFlatFieldsetsFromPrimaryClient(stripTemplateIdFromCatalogAssignments(prev, templateId))
    )
  }

  const handleSetDefaultTemplate = (templateId: string) => {
    setTemplates((prev) =>
      prev.map((t) => ({
        ...t,
        isDefault: t.id === templateId,
      }))
    )
  }

  const handleAssignProjects = (templateId: string, projectIds: string[]) => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === templateId
          ? { ...t, assignedProjects: projectIds, updatedAt: new Date().toISOString() }
          : t
      )
    )
  }

  

  const headerProps = {
    projects: SAMPLE_PROJECTS,
    selectedProjectId,
    onProjectChange: (id: string | null) => {
      setProjectInUrl(id)
      if (id) {
        setActiveNav("assets")
        setSelectedTemplate(null)
      }
    },
  }

  // If a template is selected, show the detail view
  if (selectedTemplate) {
    const detailConfig =
      templateAssetConfig[selectedTemplate.id] ?? createEmptyTemplateConfig()
    return (
      <div className="min-h-screen bg-background">
        <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} {...headerProps} />
        <div className="flex">
          {/* Collapsible Left Navigation Sidebar */}
          <aside 
            className={`${
              sidebarOpen ? "w-56" : "w-0"
            } border-r bg-muted/30 min-h-[calc(100vh-56px)] overflow-hidden transition-all duration-300`}
          >
            <nav className="p-3 space-y-1 w-56">
              <button
                onClick={() => {
                  setSelectedTemplate(null)
                  setActiveNav("assets")
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeNav === "assets"
                    ? "bg-orange-500 text-white"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <Package className="h-4 w-4" />
                Assets
              </button>
              {isCompanyLevel ? (
                <>
                  <button
                    onClick={() => {
                      handleBackToList()
                      setActiveNav("templates")
                      setSidebarOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeNav === "templates"
                        ? "bg-orange-500 text-white"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <LayoutTemplate className="h-4 w-4" />
                    Templates
                  </button>
                  <button
                    onClick={() => {
                      handleBackToList()
                      setActiveNav("globalAssetSettings")
                      setSidebarOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeNav === "globalAssetSettings"
                        ? "bg-orange-500 text-white"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <Layers className="h-4 w-4" />
                    Asset settings
                  </button>
                </>
              ) : null}
            </nav>
          </aside>
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <AssetTemplateDetail
              template={selectedTemplate}
              templates={templates}
              onBack={handleBackToList}
              onSave={handleSaveTemplateDetail}
              mode={templateViewMode}
              templateConfig={detailConfig}
              catalogReadOnly
              globalCatalog={globalCatalog}
              onTemplateConfigChange={(updater) => {
                setTemplateAssetConfig((prev) => {
                  const tid = selectedTemplate.id
                  const cur = prev[tid] ?? createEmptyTemplateConfig()
                  return { ...prev, [tid]: updater(cur) }
                })
              }}
              resolveTemplateConfig={resolveTemplateConfig}
            />
          </div>
        </div>
      </div>
    )
  }

  // Main view — h-dvh + overflow-hidden keeps the shell in the viewport so map view doesn’t scroll the page
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} {...headerProps} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Collapsible Left Navigation Sidebar */}
        <aside
          className={`${
            sidebarOpen ? "w-56" : "w-0"
          } shrink-0 border-r bg-muted/30 overflow-hidden transition-all duration-300`}
        >
          <nav className="p-3 space-y-1 w-56">
            <button
              onClick={() => {
                setActiveNav("assets")
                setSidebarOpen(false)
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeNav === "assets"
                  ? "bg-orange-500 text-white"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <Package className="h-4 w-4" />
              Assets
            </button>
            {isCompanyLevel ? (
              <>
                <button
                  onClick={() => {
                    setActiveNav("templates")
                    setSidebarOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeNav === "templates"
                      ? "bg-orange-500 text-white"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <LayoutTemplate className="h-4 w-4" />
                  Templates
                </button>
                <button
                  onClick={() => {
                    setActiveNav("globalAssetSettings")
                    setSidebarOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeNav === "globalAssetSettings"
                      ? "bg-orange-500 text-white"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Layers className="h-4 w-4" />
                  Asset settings
                </button>
              </>
            ) : null}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main
          className={cn(
            "flex min-h-0 flex-1 flex-col px-6 py-4",
            activeNav === "assets" && assetsMapViewportLock
              ? "overflow-hidden overscroll-none"
              : "overflow-y-auto"
          )}
        >
          {/* Assets List View */}
          {activeNav === "assets" && (
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col",
                assetsMapViewportLock && "overflow-hidden"
              )}
            >
              {/* Page Title with Create button — tighter margin in map view so the map gets remaining height */}
              <div
                className={cn(
                  "flex shrink-0 items-center justify-between",
                  assetsMapViewportLock ? "mb-3" : "mb-6"
                )}
              >
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Assets</h1>
                  {selectedProject ? (
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">{selectedProject.name}</span>
                      {" — "}
                      Showing assets for the template assigned to this project:{" "}
                      <span className="font-medium text-foreground">
                        {templates.find((t) => t.id === lockedTemplateIdForProject)?.name ?? "—"}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">
                      Company asset register — choose a template in the toolbar to load that template
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => setCreateAssetSheetOpen(true)}
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Create Asset
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="gap-1">
                        Import
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Import from CSV</DropdownMenuItem>
                      <DropdownMenuItem>Import from Excel</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Assets List — fills remaining height; map view locks scroll to the panel */}
              <div
                className={cn(
                  "flex min-h-0 flex-1 flex-col",
                  assetsMapViewportLock && "min-h-0 overflow-hidden"
                )}
              >
                <AssetsList
                  templates={templates.map((t) => ({ id: t.id, name: t.name }))}
                  deepLink={assetRegisterDeepLink}
                  lockedTemplateId={lockedTemplateIdForProject ?? undefined}
                  projectScope={
                    selectedProject ? { id: selectedProject.id, name: selectedProject.name } : null
                  }
                  onMapViewActiveChange={setAssetsMapViewportLock}
                />
              </div>
            </div>
          )}

          {/* Templates list (assign projects, open template detail) */}
          {activeNav === "templates" && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* Page Title with Create button */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded bg-muted">
                    <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <h1 className="text-2xl font-bold text-foreground">Asset Templates</h1>
                </div>
                <Button
                  onClick={handleCreateTemplate}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Plus className="h-4 w-4" />
                  Create
                </Button>
              </div>

              {/* Sub-tabs: List | Recycle Bin */}
              <div className="flex items-center gap-6 border-b mb-6">
                <button
                  onClick={() => setActiveMainTab("list")}
                  className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeMainTab === "list"
                      ? "text-foreground border-foreground"
                      : "text-muted-foreground hover:text-foreground border-transparent"
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setActiveMainTab("recycle-bin")}
                  className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeMainTab === "recycle-bin"
                      ? "text-foreground border-foreground"
                      : "text-muted-foreground hover:text-foreground border-transparent"
                  }`}
                >
                  Recycle Bin
                </button>
              </div>

              {/* Templates Table */}
              {activeMainTab === "list" && (
                <AssetTemplatesTable
                  templates={templates}
                  projects={SAMPLE_PROJECTS}
                  onEdit={handleEditTemplate}
                  onView={handleViewTemplate}
                  onCopy={handleCopyTemplate}
                  onDelete={handleDeleteTemplate}
                  onSetDefault={handleSetDefaultTemplate}
                  onAssignProjects={handleAssignProjects}
                />
              )}

              {activeMainTab === "recycle-bin" && (
                <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/30">
                  <p className="text-muted-foreground">No deleted templates</p>
                </div>
              )}
            </div>
          )}

          {activeNav === "globalAssetSettings" && (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <GlobalAssetSettings
                templates={templates}
                globalCatalog={globalCatalog}
                onUpdateGlobalCatalog={(updater) =>
                  setGlobalCatalog((prev) => syncFlatFieldsetsFromPrimaryClient(updater(prev)))
                }
                onCreateTemplate={createTemplateFromName}
              />
            </div>
          )}
        </main>
      </div>

      {/* Template Create/Edit Sheet */}
      <AssetTemplateSheet
        open={templateSheetOpen}
        onOpenChange={setTemplateSheetOpen}
        template={editingTemplate}
        onSave={handleSaveTemplateSettings}
        mode="edit"
      />

      {/* Create Asset Sheet */}
      <CreateAssetSheet
        open={createAssetSheetOpen}
        onOpenChange={setCreateAssetSheetOpen}
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        lockedTemplateId={lockedTemplateIdForProject ?? undefined}
        onSave={(data) => {
          console.log("Asset created:", data)
          // Handle asset creation here
        }}
      />
    </div>
  )
}

export default function AssetsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <AssetsPageContent />
    </Suspense>
  )
}
