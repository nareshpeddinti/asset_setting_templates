"use client"

import { Menu, HelpCircle, Monitor, LayoutGrid, Bell, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface HeaderProject {
  id: string
  name: string
}

interface HeaderProps {
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
  /** Company-level projects for the asset register (top bar project switcher). */
  projects?: HeaderProject[]
  selectedProjectId?: string | null
  onProjectChange?: (projectId: string | null) => void
  companyLabel?: string
}

export function Header({
  sidebarOpen,
  onToggleSidebar,
  projects = [],
  selectedProjectId = null,
  onProjectChange,
  companyLabel = "WJL Construction Design",
}: HeaderProps) {
  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const projectLine = selectedProject ? selectedProject.name : "Company (all projects)"

  return (
    <header className="flex items-center justify-between px-4 h-14 bg-zinc-800 text-white">
      {/* Left Section */}
      <div className="flex items-center gap-4 min-w-0">
        <button 
          onClick={onToggleSidebar}
          className="flex items-center gap-2 text-white hover:text-zinc-300 shrink-0"
        >
          <Menu className="h-5 w-5" />
          <span className="text-sm font-medium">Menu</span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <img 
            src="/images/procore-logo.png" 
            alt="Procore" 
            className="h-4 object-contain"
          />
        </div>

        {projects.length > 0 && onProjectChange ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-2 h-auto min-h-9 max-w-[min(100vw-12rem,22rem)]"
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              <div className="flex flex-col items-start min-w-0 text-left">
                <span className="text-xs text-zinc-400 truncate w-full">{companyLabel}</span>
                <span className="text-sm font-medium truncate w-full" title={projectLine}>
                  {projectLine}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 ml-1 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[min(100vw-2rem,22rem)] p-0">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground px-2 py-1.5">
              Asset register scope
            </DropdownMenuLabel>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => onProjectChange(null)}
            >
              <span className={selectedProjectId == null ? "font-semibold" : ""}>
                Company — all projects
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <ScrollArea className="max-h-[min(60vh,320px)]">
              <div className="pr-2 pb-1">
                {projects.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => onProjectChange(p.id)}
                  >
                    <span className={selectedProjectId === p.id ? "font-semibold" : ""}>
                      {p.name}
                    </span>
                  </DropdownMenuItem>
                ))}
              </div>
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
        ) : null}
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 text-white hover:bg-zinc-700 px-3 py-2"
            >
              <span className="text-sm">Apps</span>
              <span className="text-sm text-zinc-400">Select an App</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>App 1</DropdownMenuItem>
            <DropdownMenuItem>App 2</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="text-white hover:bg-zinc-700">
          <HelpCircle className="h-5 w-5" />
        </Button>

        <Button variant="ghost" size="icon" className="text-white hover:bg-zinc-700">
          <Monitor className="h-5 w-5" />
        </Button>

        <Button variant="ghost" size="icon" className="text-white hover:bg-zinc-700">
          <LayoutGrid className="h-5 w-5" />
        </Button>

        <Button variant="ghost" size="icon" className="text-white hover:bg-zinc-700">
          <Bell className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2 ml-2">
          <div className="h-8 w-8 rounded-full bg-zinc-600 flex items-center justify-center text-sm font-medium">
            NP
          </div>
          <div className="h-8 w-8 rounded overflow-hidden bg-zinc-600">
            <div className="w-full h-full bg-gradient-to-br from-amber-600 to-amber-800" />
          </div>
        </div>
      </div>
    </header>
  )
}
