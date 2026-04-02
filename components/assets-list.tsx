"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  SlidersHorizontal,
  Settings2,
  Pencil,
  Trash2,
  ChevronDown,
  Plus,
  X,
  Paperclip,
  Link2,
  Boxes,
  LayoutList,
  Map as MapIcon,
} from "lucide-react"
import { AssetDetailPanel } from "@/components/asset-detail-panel"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TEMPLATE_ASSET_TYPES } from "@/lib/template-asset-types"
import {
  resolveAssemblyTypeForAsset,
  validateBulkAssignToAssembly,
  type BulkAssignValidationResult,
} from "@/lib/assembly-asset-types"
import type { AssetType } from "@/app/page"
import { PROJECT_QUERY_PARAM } from "@/lib/project-template"

const FILTER_ALL = "__all__"

const AssetsMapViewDynamic = dynamic(
  () => import("@/components/assets-map-view").then((m) => m.AssetsMapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  }
)

function tradeLabel(a: Asset): string {
  return a.trade?.trim() || "General"
}

export interface Asset {
  id: string
  name: string
  code: string
  project: string
  type: string
  status: string
  statusColor: "blue" | "green" | "gray" | "orange" | "teal" | "yellow" | "red"
  lastModified: string
  /** Whole-asset assembly (e.g. full turbine); used for filters and register indicator. */
  isAssembly?: boolean
  /** Trade / discipline for filtering. */
  trade?: string
  /** Attachment count (demo). */
  attachmentCount?: number
  /** Linked parent assembly asset (component → assembly). */
  parentAssemblyAssetId?: string
  /** WGS84 — when set with {@link longitude}, map pins use this location. */
  latitude?: number
  longitude?: number
  /** Turbine / site position label (e.g. relative to satellite view). */
  mapPositionLabel?: string
}

export interface AssetTemplate {
  id: string
  name: string
}

/** Sample assets per template (also used when linking child assets to assembly parents). */
export const TEMPLATE_ASSETS: Record<string, Asset[]> = {
  "template-default": [],
  "template-residential": [
    { id: "res-asset-1", name: "Main Water Heater", code: "22-DOM-HWH-001", project: "Sunset Hills Condominiums", type: "Water Heaters", status: "Installed", statusColor: "blue", lastModified: "3/11/2026" },
    { id: "res-asset-2", name: "Booster Pump Unit A", code: "22-DOM-PMP-001", project: "Sunset Hills Condominiums", type: "Booster Pumps", status: "Approved", statusColor: "green", lastModified: "3/10/2026" },
    { id: "res-asset-3", name: "Rooftop HVAC Unit 1", code: "23-HVA-RTU-001", project: "Maple Grove Apartments", type: "Rooftop Units", status: "In-Warehouse", statusColor: "blue", lastModified: "3/09/2026" },
    { id: "res-asset-4", name: "Split System - Building A", code: "23-HVA-SPL-001", project: "Maple Grove Apartments", type: "Split Systems", status: "IN-DESIGN", statusColor: "gray", lastModified: "3/08/2026" },
    { id: "res-asset-5", name: "Main Electrical Switchgear", code: "26-PWR-SWG-001", project: "Riverside Townhomes", type: "Switchgear", status: "Commissioned", statusColor: "teal", lastModified: "3/07/2026" },
    { id: "res-asset-6", name: "Panel Board - Floor 1", code: "26-PWR-PNL-001", project: "Riverside Townhomes", type: "Panel Boards", status: "Approved", statusColor: "green", lastModified: "3/06/2026" },
    { id: "res-asset-7", name: "Fire Sprinkler System", code: "28-FIR-SPR-001", project: "Harbor View Residences", type: "Sprinkler Systems", status: "Installed", statusColor: "blue", lastModified: "3/05/2026" },
    { id: "res-asset-8", name: "Fire Alarm Panel", code: "28-FIR-ALM-001", project: "Harbor View Residences", type: "Fire Alarms", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/04/2026" },
    { id: "res-asset-9", name: "Irrigation Controller", code: "01-LND-IRR-001", project: "Oak Park Senior Living", type: "Irrigation Systems", status: "Approved", statusColor: "green", lastModified: "3/03/2026" },
    { id: "res-asset-10", name: "Landscape Lighting System", code: "01-LND-LGT-001", project: "Oak Park Senior Living", type: "Landscape Lighting", status: "ARCHIVED", statusColor: "orange", lastModified: "3/02/2026" },
  ],
  "template-commercial": [
    { id: "com-asset-1", name: "Parking Gate - Entry A", code: "01-PRK-GAT-001", project: "Downtown Office Plaza", type: "Parking Gates", status: "Installed", statusColor: "blue", lastModified: "3/11/2026" },
    { id: "com-asset-2", name: "Payment Kiosk 1", code: "01-PRK-PAY-001", project: "Downtown Office Plaza", type: "Payment Systems", status: "Approved", statusColor: "green", lastModified: "3/10/2026" },
    { id: "com-asset-3", name: "Passenger Elevator 1", code: "14-ELV-PSG-001", project: "Westgate Shopping Center", type: "Passenger Elevators", status: "Commissioned", statusColor: "teal", lastModified: "3/09/2026" },
    { id: "com-asset-4", name: "Freight Elevator", code: "14-ELV-FRT-001", project: "Westgate Shopping Center", type: "Freight Elevators", status: "IN-DESIGN", statusColor: "gray", lastModified: "3/08/2026" },
    { id: "com-asset-5", name: "Wet Pipe Sprinkler - Floor 1", code: "21-SPR-WET-001", project: "Metro Business Park", type: "Wet Pipe Systems", status: "Installed", statusColor: "blue", lastModified: "3/07/2026" },
    { id: "com-asset-6", name: "Chiller Unit 1", code: "23-CHL-CHR-001", project: "Metro Business Park", type: "Chillers", status: "In-Warehouse", statusColor: "blue", lastModified: "3/06/2026" },
    { id: "com-asset-7", name: "Main Boiler", code: "23-CHL-BLR-001", project: "Central Station Retail", type: "Boilers", status: "Approved", statusColor: "green", lastModified: "3/05/2026" },
    { id: "com-asset-8", name: "Diesel Generator 1", code: "26-GEN-DSL-001", project: "Central Station Retail", type: "Diesel Generators", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/04/2026" },
    { id: "com-asset-9", name: "UPS System - Server Room", code: "26-GEN-UPS-001", project: "Lakeside Corporate Campus", type: "UPS Systems", status: "Installed", statusColor: "blue", lastModified: "3/03/2026" },
    { id: "com-asset-10", name: "Dry Pipe Sprinkler", code: "21-SPR-DRY-001", project: "Lakeside Corporate Campus", type: "Dry Pipe Systems", status: "ARCHIVED", statusColor: "orange", lastModified: "3/02/2026" },
  ],
  "template-healthcare": [
    { id: "hc-asset-1", name: "MRI Scanner - Imaging Suite", code: "11-IMG-MRI-001", project: "St. Mary's Medical Center", type: "MRI Systems", status: "Installed", statusColor: "blue", lastModified: "3/11/2026" },
    { id: "hc-asset-2", name: "X-Ray Unit - ER", code: "11-IMG-XRY-001", project: "St. Mary's Medical Center", type: "X-Ray Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/10/2026" },
    { id: "hc-asset-3", name: "CT Scanner", code: "11-IMG-CTN-001", project: "Northside Community Hospital", type: "CT Scanners", status: "Approved", statusColor: "green", lastModified: "3/09/2026" },
    { id: "hc-asset-4", name: "Medical Oxygen System", code: "22-GAS-OXY-001", project: "Northside Community Hospital", type: "Oxygen Systems", status: "Installed", statusColor: "blue", lastModified: "3/08/2026" },
    { id: "hc-asset-5", name: "Medical Vacuum System", code: "22-GAS-VAC-001", project: "Valley Health Clinic", type: "Vacuum Systems", status: "IN-DESIGN", statusColor: "gray", lastModified: "3/07/2026" },
    { id: "hc-asset-6", name: "OR Air Handler Unit 1", code: "23-AHU-ORT-001", project: "Valley Health Clinic", type: "Operating Room AHUs", status: "In-Warehouse", statusColor: "blue", lastModified: "3/06/2026" },
    { id: "hc-asset-7", name: "Isolation Room AHU", code: "23-AHU-ISO-001", project: "Children's Specialty Center", type: "Isolation Room AHUs", status: "Approved", statusColor: "green", lastModified: "3/05/2026" },
    { id: "hc-asset-8", name: "Emergency Generator", code: "26-CRT-GEN-001", project: "Children's Specialty Center", type: "Emergency Generators", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/04/2026" },
    { id: "hc-asset-9", name: "Critical UPS System", code: "26-CRT-UPS-001", project: "St. Mary's Medical Center", type: "UPS Systems", status: "Installed", statusColor: "blue", lastModified: "3/03/2026" },
    { id: "hc-asset-10", name: "Nurse Call Station - ICU", code: "28-NRS-STD-001", project: "St. Mary's Medical Center", type: "Nurse Call Stations", status: "Commissioned", statusColor: "teal", lastModified: "3/02/2026" },
  ],
  "template-industrial": [
    { id: "ind-asset-1", name: "CNC Machine - Line 1", code: "11-PRD-CNC-001", project: "Eastside Manufacturing Plant", type: "CNC Machines", status: "Installed", statusColor: "blue", lastModified: "3/11/2026" },
    { id: "ind-asset-2", name: "Main Conveyor System", code: "11-PRD-CNV-001", project: "Eastside Manufacturing Plant", type: "Conveyors", status: "Approved", statusColor: "green", lastModified: "3/10/2026" },
    { id: "ind-asset-3", name: "Overhead Bridge Crane", code: "11-PRD-CRN-001", project: "Harbor Logistics Center", type: "Cranes", status: "Commissioned", statusColor: "teal", lastModified: "3/09/2026" },
    { id: "ind-asset-4", name: "DI Water System", code: "22-PRC-DI-001", project: "Harbor Logistics Center", type: "DI Water", status: "IN-DESIGN", statusColor: "gray", lastModified: "3/08/2026" },
    { id: "ind-asset-5", name: "Process Chilled Water", code: "22-PRC-CHL-001", project: "Tech Park Data Center", type: "Chilled Water", status: "Installed", statusColor: "blue", lastModified: "3/07/2026" },
    { id: "ind-asset-6", name: "Fume Exhaust System", code: "23-VNT-EXH-001", project: "Tech Park Data Center", type: "Exhaust Systems", status: "In-Warehouse", statusColor: "blue", lastModified: "3/06/2026" },
    { id: "ind-asset-7", name: "Makeup Air Unit", code: "23-VNT-MAU-001", project: "Regional Distribution Hub", type: "Makeup Air", status: "Approved", statusColor: "green", lastModified: "3/05/2026" },
    { id: "ind-asset-8", name: "Motor Starter Panel", code: "26-MCC-STR-001", project: "Regional Distribution Hub", type: "Starters", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/04/2026" },
    { id: "ind-asset-9", name: "VFD - Pump Motor", code: "26-MCC-VFD-001", project: "Eastside Manufacturing Plant", type: "VFDs", status: "Installed", statusColor: "blue", lastModified: "3/03/2026" },
    { id: "ind-asset-10", name: "DCS Control System", code: "40-PLC-DCS-001", project: "Eastside Manufacturing Plant", type: "DCS", status: "ARCHIVED", statusColor: "orange", lastModified: "3/02/2026" },
  ],
  "template-datacenter": [
    { id: "dc-asset-1", name: "Chiller Unit 1", code: "23-GEN-CHL-001", project: "CloudFirst Data Center", type: "Chiller Units", status: "Installed", statusColor: "blue", lastModified: "3/11/2026" },
    { id: "dc-asset-2", name: "Cooling Tower A", code: "23-GEN-CTW-001", project: "CloudFirst Data Center", type: "Cooling Towers", status: "Approved", statusColor: "green", lastModified: "3/10/2026" },
    { id: "dc-asset-3", name: "Heat Exchanger - Primary", code: "23-GEN-HEX-001", project: "SecureVault Colocation", type: "Heat Exchangers", status: "Commissioned", statusColor: "teal", lastModified: "3/09/2026" },
    { id: "dc-asset-4", name: "CRAC Unit - Hall A", code: "23-AIR-CRC-001", project: "SecureVault Colocation", type: "CRAC Units", status: "Installed", statusColor: "blue", lastModified: "3/08/2026" },
    { id: "dc-asset-5", name: "CRAH Unit - Hall B", code: "23-AIR-CRH-001", project: "Enterprise Compute Facility", type: "CRAH Units", status: "IN-DESIGN", statusColor: "gray", lastModified: "3/07/2026" },
    { id: "dc-asset-6", name: "In-Row Cooling Unit 1", code: "23-AIR-IRC-001", project: "Enterprise Compute Facility", type: "In-Row Cooling", status: "In-Warehouse", statusColor: "blue", lastModified: "3/06/2026" },
    { id: "dc-asset-7", name: "Chilled Water Pump 1", code: "23-PMP-CWP-001", project: "CloudFirst Data Center", type: "Chilled Water Pumps", status: "Approved", statusColor: "green", lastModified: "3/05/2026" },
    { id: "dc-asset-8", name: "PDU - Row A", code: "26-PWR-PDU-001", project: "CloudFirst Data Center", type: "PDUs", status: "Installed", statusColor: "blue", lastModified: "3/04/2026" },
    { id: "dc-asset-9", name: "Modular UPS System", code: "26-UPS-MOD-001", project: "SecureVault Colocation", type: "Modular UPS", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/03/2026" },
    { id: "dc-asset-10", name: "Diesel Generator - Primary", code: "26-GEN-DSL-001", project: "Enterprise Compute Facility", type: "Diesel Generators", status: "Commissioned", statusColor: "teal", lastModified: "3/02/2026" },
  ],
  "template-windfarm": [
    // —— Assemblies: whole-turbine line items (demo: multiple sites & OEMs) ——
    { id: "wf-asset-wtg-05", name: "WTG-05 — Vestas V174-9.5 MW", code: "NSO-WTG-005", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/14/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 4 },
    { id: "wf-asset-wtg-06", name: "WTG-06 — Vestas V174-9.5 MW", code: "NSO-WTG-006", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/13/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-wtg-07", name: "WTG-07 — Vestas V174-9.5 MW", code: "NSO-WTG-007", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/13/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 3 },
    { id: "wf-asset-wtg-12", name: "WTG-12 — Vestas V174-9.5 MW (Row B)", code: "NSO-WTG-012", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/12/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 5 },
    { id: "wf-asset-wtg-13", name: "WTG-13 — Vestas V174-9.5 MW", code: "NSO-WTG-013", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/11/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-wtg-14", name: "WTG-14 — Vestas V174-9.5 MW", code: "NSO-WTG-014", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/11/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 1 },
    { id: "wf-asset-wtg-15", name: "WTG-15 — Vestas V174-9.5 MW", code: "NSO-WTG-015", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Approved", statusColor: "green", lastModified: "3/10/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 0 },
    { id: "wf-asset-wtg-08", name: "WTG-08 — Vestas V174-9.5 MW", code: "NSO-WTG-008", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/12/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-wtg-09", name: "WTG-09 — Vestas V174-9.5 MW", code: "NSO-WTG-009", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/11/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 3 },
    { id: "wf-asset-wtg-10", name: "WTG-10 — Vestas V174-9.5 MW", code: "NSO-WTG-010", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/11/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 1 },
    { id: "wf-asset-wtg-11", name: "WTG-11 — Vestas V174-9.5 MW", code: "NSO-WTG-011", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/10/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 0 },
    { id: "wf-asset-wtg-16", name: "WTG-16 — Vestas V174-9.5 MW", code: "NSO-WTG-016", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/09/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-wtg-17", name: "WTG-17 — Vestas V174-9.5 MW", code: "NSO-WTG-017", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/08/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 4 },
    { id: "wf-asset-wtg-18", name: "WTG-18 — Vestas V174-9.5 MW", code: "NSO-WTG-018", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/08/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 1 },
    { id: "wf-asset-wtg-19", name: "WTG-19 — Vestas V174-9.5 MW", code: "NSO-WTG-019", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Approved", statusColor: "green", lastModified: "3/07/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 0 },
    { id: "wf-asset-wtg-20", name: "WTG-20 — Vestas V174-9.5 MW", code: "NSO-WTG-020", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/07/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-wtg-21", name: "WTG-21 — Vestas V174-9.5 MW", code: "NSO-WTG-021", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "IN-DESIGN", statusColor: "gray", lastModified: "3/06/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 0 },
    { id: "wf-asset-wtg-22", name: "WTG-22 — Vestas V174-9.5 MW", code: "NSO-WTG-022", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/06/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 1 },
    { id: "wf-asset-wtg-23", name: "WTG-23 — Vestas V174-9.5 MW", code: "NSO-WTG-023", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/05/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 3 },
    { id: "wf-asset-wtg-24", name: "WTG-24 — Vestas V174-9.5 MW", code: "NSO-WTG-024", project: "North Sea Offshore Wind Phase II", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/05/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-gpe-wtg-01", name: "WTG-01 — GE Cypress 6.0-164", code: "GPE-WTG-001", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/10/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 6 },
    { id: "wf-asset-gpe-wtg-02", name: "WTG-02 — GE Cypress 6.0-164", code: "GPE-WTG-002", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/09/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 3 },
    { id: "wf-asset-gpe-wtg-03", name: "WTG-03 — GE Cypress 6.0-164", code: "GPE-WTG-003", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/09/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-gpe-wtg-04", name: "WTG-04 — GE Cypress 6.0-164", code: "GPE-WTG-004", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/08/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 1 },
    { id: "wf-asset-gpe-wtg-05", name: "WTG-05 — GE Cypress 6.0-164", code: "GPE-WTG-005", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/08/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-gpe-wtg-06", name: "WTG-06 — GE Cypress 6.0-164", code: "GPE-WTG-006", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/07/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 3 },
    { id: "wf-asset-gpe-wtg-07", name: "WTG-07 — GE Cypress 6.0-164", code: "GPE-WTG-007", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/07/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 1 },
    { id: "wf-asset-gpe-wtg-08", name: "WTG-08 — GE Cypress 6.0-164", code: "GPE-WTG-008", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "Approved", statusColor: "green", lastModified: "3/06/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 0 },
    { id: "wf-asset-gpe-wtg-09", name: "WTG-09 — GE Cypress 6.0-164", code: "GPE-WTG-009", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/06/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-gpe-wtg-10", name: "WTG-10 — GE Cypress 6.0-164", code: "GPE-WTG-010", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/05/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 1 },
    { id: "wf-asset-gpe-wtg-11", name: "WTG-11 — GE Cypress 6.0-164", code: "GPE-WTG-011", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/05/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-gpe-wtg-12", name: "WTG-12 — GE Cypress 6.0-164 (north string)", code: "GPE-WTG-012", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/04/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 4 },
    { id: "wf-asset-gpe-wtg-13", name: "WTG-13 — GE Cypress 6.0-164", code: "GPE-WTG-013", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/04/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 1 },
    { id: "wf-asset-gpe-wtg-14", name: "WTG-14 — GE Cypress 6.0-164", code: "GPE-WTG-014", project: "Great Plains Wind Energy Hub", type: "Wind Turbine Systems", status: "IN-DESIGN", statusColor: "gray", lastModified: "3/03/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 0 },
    { id: "wf-asset-wtg-c1", name: "WTG-C1 — Siemens Gamesa SG 8.0-167 DD", code: "CRR-WTG-C01", project: "Coastal Ridge Repower Project", type: "Wind Turbine Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/07/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 4 },
    { id: "wf-asset-wtg-c2", name: "WTG-C2 — Siemens Gamesa SG 8.0-167 DD", code: "CRR-WTG-C02", project: "Coastal Ridge Repower Project", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/06/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-wtg-c3", name: "WTG-C3 — Siemens Gamesa SG 8.0-167 DD", code: "CRR-WTG-C03", project: "Coastal Ridge Repower Project", type: "Wind Turbine Systems", status: "IN-DESIGN", statusColor: "gray", lastModified: "3/05/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 0 },
    { id: "wf-asset-wtg-c4", name: "WTG-C4 — Siemens Gamesa SG 8.0-167 DD", code: "CRR-WTG-C04", project: "Coastal Ridge Repower Project", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/05/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-wtg-c5", name: "WTG-C5 — Siemens Gamesa SG 8.0-167 DD", code: "CRR-WTG-C05", project: "Coastal Ridge Repower Project", type: "Wind Turbine Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/04/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 3 },
    { id: "wf-asset-wtg-c6", name: "WTG-C6 — Siemens Gamesa SG 8.0-167 DD", code: "CRR-WTG-C06", project: "Coastal Ridge Repower Project", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/04/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 1 },
    { id: "wf-asset-wtg-c7", name: "WTG-C7 — Siemens Gamesa SG 8.0-167 DD", code: "CRR-WTG-C07", project: "Coastal Ridge Repower Project", type: "Wind Turbine Systems", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/03/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 0 },
    { id: "wf-asset-wtg-c8", name: "WTG-C8 — Siemens Gamesa SG 8.0-167 DD", code: "CRR-WTG-C08", project: "Coastal Ridge Repower Project", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/03/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-wtg-c9", name: "WTG-C9 — Siemens Gamesa SG 8.0-167 DD", code: "CRR-WTG-C09", project: "Coastal Ridge Repower Project", type: "Wind Turbine Systems", status: "Approved", statusColor: "green", lastModified: "3/02/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 1 },
    { id: "wf-asset-wtg-c10", name: "WTG-C10 — Siemens Gamesa SG 8.0-167 DD", code: "CRR-WTG-C10", project: "Coastal Ridge Repower Project", type: "Wind Turbine Systems", status: "Installed", statusColor: "blue", lastModified: "3/02/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 2 },
    { id: "wf-asset-wtg-c11", name: "WTG-C11 — Siemens Gamesa SG 8.0-167 DD", code: "CRR-WTG-C11", project: "Coastal Ridge Repower Project", type: "Wind Turbine Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/01/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 4 },
    { id: "wf-asset-wtg-c12", name: "WTG-C12 — Siemens Gamesa SG 8.0-167 DD", code: "CRR-WTG-C12", project: "Coastal Ridge Repower Project", type: "Wind Turbine Systems", status: "IN-DESIGN", statusColor: "gray", lastModified: "3/01/2026", isAssembly: true, trade: "Mechanical", attachmentCount: 0 },

    // —— Linked components: WTG-12 (full rotor + nacelle + tower chain) ——
    { id: "wf-asset-blade-12a", name: "Blade set A — WTG-12 (Vestas 85.7 m)", code: "NSO-ROT-BLD-12A", project: "North Sea Offshore Wind Phase II", type: "Blade Sets", status: "Installed", statusColor: "blue", lastModified: "3/08/2026", trade: "Mechanical", attachmentCount: 2, parentAssemblyAssetId: "wf-asset-wtg-12" },
    { id: "wf-asset-blade-12b", name: "Blade set B — WTG-12", code: "NSO-ROT-BLD-12B", project: "North Sea Offshore Wind Phase II", type: "Blade Sets", status: "Installed", statusColor: "blue", lastModified: "3/08/2026", trade: "Mechanical", attachmentCount: 2, parentAssemblyAssetId: "wf-asset-wtg-12" },
    { id: "wf-asset-blade-12c", name: "Blade set C — WTG-12", code: "NSO-ROT-BLD-12C", project: "North Sea Offshore Wind Phase II", type: "Blade Sets", status: "Installed", statusColor: "blue", lastModified: "3/08/2026", trade: "Mechanical", attachmentCount: 2, parentAssemblyAssetId: "wf-asset-wtg-12" },
    { id: "wf-asset-gen-12", name: "Permanent-magnet generator — WTG-12", code: "NSO-NAC-GEN-12", project: "North Sea Offshore Wind Phase II", type: "Main Generator", status: "Commissioned", statusColor: "teal", lastModified: "3/11/2026", trade: "Electrical", attachmentCount: 1, parentAssemblyAssetId: "wf-asset-wtg-12" },
    { id: "wf-asset-gbx-12", name: "Geared drivetrain — WTG-12 (3-stage)", code: "NSO-NAC-GBX-12", project: "North Sea Offshore Wind Phase II", type: "Gearbox", status: "Installed", statusColor: "blue", lastModified: "3/09/2026", trade: "Mechanical", attachmentCount: 2, parentAssemblyAssetId: "wf-asset-wtg-12" },
    { id: "wf-asset-hub-12", name: "Hub & pitch system — WTG-12", code: "NSO-ROT-HUB-12", project: "North Sea Offshore Wind Phase II", type: "Hub & Pitch", status: "Installed", statusColor: "blue", lastModified: "3/07/2026", trade: "Mechanical", attachmentCount: 3, parentAssemblyAssetId: "wf-asset-wtg-12" },
    { id: "wf-asset-twr-12", name: "Tubular steel tower (108 m) — WTG-12", code: "NSO-TWR-ST-12", project: "North Sea Offshore Wind Phase II", type: "Tower Structure", status: "Installed", statusColor: "blue", lastModified: "3/06/2026", trade: "Mechanical", attachmentCount: 4, parentAssemblyAssetId: "wf-asset-wtg-12" },
    { id: "wf-asset-fnd-12", name: "Monopile foundation MP-12 (Ø 8.1 m)", code: "NSO-TWR-FND-12", project: "North Sea Offshore Wind Phase II", type: "Foundation", status: "Commissioned", statusColor: "teal", lastModified: "3/05/2026", trade: "Concrete", attachmentCount: 6, parentAssemblyAssetId: "wf-asset-wtg-12" },

    // —— WTG-01 Great Plains (complete BOM-style link set) ——
    { id: "wf-asset-blade-01a", name: "Blade set A — WTG-01", code: "GPE-ROT-BLD-01A", project: "Great Plains Wind Energy Hub", type: "Blade Sets", status: "Installed", statusColor: "blue", lastModified: "3/08/2026", trade: "Mechanical", attachmentCount: 1, parentAssemblyAssetId: "wf-asset-gpe-wtg-01" },
    { id: "wf-asset-blade-01b", name: "Blade set B — WTG-01", code: "GPE-ROT-BLD-01B", project: "Great Plains Wind Energy Hub", type: "Blade Sets", status: "Installed", statusColor: "blue", lastModified: "3/08/2026", trade: "Mechanical", attachmentCount: 1, parentAssemblyAssetId: "wf-asset-gpe-wtg-01" },
    { id: "wf-asset-blade-01c", name: "Blade set C — WTG-01", code: "GPE-ROT-BLD-01C", project: "Great Plains Wind Energy Hub", type: "Blade Sets", status: "Installed", statusColor: "blue", lastModified: "3/08/2026", trade: "Mechanical", attachmentCount: 1, parentAssemblyAssetId: "wf-asset-gpe-wtg-01" },
    { id: "wf-asset-gen-01", name: "Doubly-fed induction generator — WTG-01", code: "GPE-NAC-GEN-01", project: "Great Plains Wind Energy Hub", type: "Main Generator", status: "Commissioned", statusColor: "teal", lastModified: "3/09/2026", trade: "Electrical", attachmentCount: 2, parentAssemblyAssetId: "wf-asset-gpe-wtg-01" },
    { id: "wf-asset-gbx-01", name: "Gearbox — WTG-01 (Winergy)", code: "GPE-NAC-GBX-01", project: "Great Plains Wind Energy Hub", type: "Gearbox", status: "Installed", statusColor: "blue", lastModified: "3/08/2026", trade: "Mechanical", attachmentCount: 1, parentAssemblyAssetId: "wf-asset-gpe-wtg-01" },
    { id: "wf-asset-hub-01", name: "Hub & pitch — WTG-01", code: "GPE-ROT-HUB-01", project: "Great Plains Wind Energy Hub", type: "Hub & Pitch", status: "Installed", statusColor: "blue", lastModified: "3/07/2026", trade: "Mechanical", attachmentCount: 0, parentAssemblyAssetId: "wf-asset-gpe-wtg-01" },
    { id: "wf-asset-twr-01", name: "Hybrid tower (concrete + steel) — WTG-01", code: "GPE-TWR-ST-01", project: "Great Plains Wind Energy Hub", type: "Tower Structure", status: "Installed", statusColor: "blue", lastModified: "3/06/2026", trade: "Mechanical", attachmentCount: 3, parentAssemblyAssetId: "wf-asset-gpe-wtg-01" },
    { id: "wf-asset-fnd-01", name: "Rock-anchor spread footing — WTG-01", code: "GPE-TWR-FND-01", project: "Great Plains Wind Energy Hub", type: "Foundation", status: "Commissioned", statusColor: "teal", lastModified: "3/04/2026", trade: "Concrete", attachmentCount: 2, parentAssemblyAssetId: "wf-asset-gpe-wtg-01" },

    // —— WTG-13 North Sea (partial + warranty review) ——
    { id: "wf-asset-blade-13a", name: "Blade set A — WTG-13", code: "NSO-ROT-BLD-13A", project: "North Sea Offshore Wind Phase II", type: "Blade Sets", status: "Installed", statusColor: "blue", lastModified: "3/08/2026", trade: "Mechanical", attachmentCount: 1, parentAssemblyAssetId: "wf-asset-wtg-13" },
    { id: "wf-asset-blade-13b", name: "Blade set B — WTG-13", code: "NSO-ROT-BLD-13B", project: "North Sea Offshore Wind Phase II", type: "Blade Sets", status: "Installed", statusColor: "blue", lastModified: "3/08/2026", trade: "Mechanical", attachmentCount: 1, parentAssemblyAssetId: "wf-asset-wtg-13" },
    { id: "wf-asset-gen-13", name: "Main generator — WTG-13", code: "NSO-NAC-GEN-13", project: "North Sea Offshore Wind Phase II", type: "Main Generator", status: "Installed", statusColor: "blue", lastModified: "3/09/2026", trade: "Electrical", attachmentCount: 0, parentAssemblyAssetId: "wf-asset-wtg-13" },
    { id: "wf-asset-gbx-13", name: "Gearbox — WTG-13 (bearing investigation)", code: "NSO-NAC-GBX-13", project: "North Sea Offshore Wind Phase II", type: "Gearbox", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/10/2026", trade: "Mechanical", attachmentCount: 4, parentAssemblyAssetId: "wf-asset-wtg-13" },
    { id: "wf-asset-twr-13", name: "Tower — WTG-13", code: "NSO-TWR-ST-13", project: "North Sea Offshore Wind Phase II", type: "Tower Structure", status: "Installed", statusColor: "blue", lastModified: "3/06/2026", trade: "Mechanical", attachmentCount: 1, parentAssemblyAssetId: "wf-asset-wtg-13" },

    // —— WTG-14, WTG-15 (sparse — good for “link remaining” demo) ——
    { id: "wf-asset-gen-14", name: "Main generator — WTG-14", code: "NSO-NAC-GEN-14", project: "North Sea Offshore Wind Phase II", type: "Main Generator", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/09/2026", trade: "Electrical", attachmentCount: 0, parentAssemblyAssetId: "wf-asset-wtg-14" },
    { id: "wf-asset-twr-14", name: "Tower — WTG-14", code: "NSO-TWR-ST-14", project: "North Sea Offshore Wind Phase II", type: "Tower Structure", status: "Approved", statusColor: "green", lastModified: "3/07/2026", trade: "Mechanical", attachmentCount: 1, parentAssemblyAssetId: "wf-asset-wtg-14" },

    // —— WTG-C1 Coastal (repower stack) ——
    { id: "wf-asset-blade-c1a", name: "Blade set A — WTG-C1", code: "CRR-ROT-BLD-C1A", project: "Coastal Ridge Repower Project", type: "Blade Sets", status: "Installed", statusColor: "blue", lastModified: "3/07/2026", trade: "Mechanical", attachmentCount: 2, parentAssemblyAssetId: "wf-asset-wtg-c1" },
    { id: "wf-asset-blade-c1b", name: "Blade set B — WTG-C1", code: "CRR-ROT-BLD-C1B", project: "Coastal Ridge Repower Project", type: "Blade Sets", status: "Installed", statusColor: "blue", lastModified: "3/07/2026", trade: "Mechanical", attachmentCount: 2, parentAssemblyAssetId: "wf-asset-wtg-c1" },
    { id: "wf-asset-blade-c1c", name: "Blade set C — WTG-C1", code: "CRR-ROT-BLD-C1C", project: "Coastal Ridge Repower Project", type: "Blade Sets", status: "Installed", statusColor: "blue", lastModified: "3/07/2026", trade: "Mechanical", attachmentCount: 2, parentAssemblyAssetId: "wf-asset-wtg-c1" },
    { id: "wf-asset-gen-c1", name: "Medium-speed PMG — WTG-C1", code: "CRR-NAC-GEN-C1", project: "Coastal Ridge Repower Project", type: "Main Generator", status: "Commissioned", statusColor: "teal", lastModified: "3/08/2026", trade: "Electrical", attachmentCount: 1, parentAssemblyAssetId: "wf-asset-wtg-c1" },
    { id: "wf-asset-gbx-c1", name: "Integrated medium-speed gearbox — WTG-C1", code: "CRR-NAC-GBX-C1", project: "Coastal Ridge Repower Project", type: "Gearbox", status: "Installed", statusColor: "blue", lastModified: "3/07/2026", trade: "Mechanical", attachmentCount: 1, parentAssemblyAssetId: "wf-asset-wtg-c1" },
    { id: "wf-asset-hub-c1", name: "Hub & pitch — WTG-C1", code: "CRR-ROT-HUB-C1", project: "Coastal Ridge Repower Project", type: "Hub & Pitch", status: "Installed", statusColor: "blue", lastModified: "3/06/2026", trade: "Mechanical", attachmentCount: 0, parentAssemblyAssetId: "wf-asset-wtg-c1" },
    { id: "wf-asset-twr-c1", name: "Tower — WTG-C1", code: "CRR-TWR-ST-C1", project: "Coastal Ridge Repower Project", type: "Tower Structure", status: "Installed", statusColor: "blue", lastModified: "3/05/2026", trade: "Mechanical", attachmentCount: 2, parentAssemblyAssetId: "wf-asset-wtg-c1" },
    { id: "wf-asset-fnd-c1", name: "Gravity-base foundation — WTG-C1", code: "CRR-TWR-FND-C1", project: "Coastal Ridge Repower Project", type: "Foundation", status: "Commissioned", statusColor: "teal", lastModified: "3/04/2026", trade: "Concrete", attachmentCount: 3, parentAssemblyAssetId: "wf-asset-wtg-c1" },

    // —— Unlinked components (same projects — use “Link Items” to attach to an assembly) ——
    { id: "wf-asset-gbx-spare-02", name: "Spare gearbox — stock (GE Cypress)", code: "GPE-NAC-GBX-SPL", project: "Great Plains Wind Energy Hub", type: "Gearbox", status: "In-Warehouse", statusColor: "blue", lastModified: "3/02/2026", trade: "Mechanical", attachmentCount: 0 },
    { id: "wf-asset-gen-pending-03", name: "Main generator — awaiting install WTG-03", code: "GPE-NAC-GEN-PND", project: "Great Plains Wind Energy Hub", type: "Main Generator", status: "In-Warehouse", statusColor: "blue", lastModified: "3/03/2026", trade: "Electrical", attachmentCount: 1 },
    { id: "wf-asset-blade-spare-ns", name: "Blade pair — quarantine (lightning strike)", code: "NSO-ROT-BLD-QRN", project: "North Sea Offshore Wind Phase II", type: "Blade Sets", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/01/2026", trade: "Mechanical", attachmentCount: 2 },

    // —— Balance of plant / collection (not under turbine assembly) ——
    { id: "wf-asset-mv-01", name: "33 kV MV feeder — String 04 (WTG-05…08)", code: "NSO-MV-STR-04", project: "North Sea Offshore Wind Phase II", type: "MV Cable Systems", status: "Commissioned", statusColor: "teal", lastModified: "3/05/2026", trade: "Electrical", attachmentCount: 3 },
    { id: "wf-asset-mv-02", name: "33 kV MV feeder — String 05 (WTG-09…12)", code: "NSO-MV-STR-05", project: "North Sea Offshore Wind Phase II", type: "MV Cable Systems", status: "Installed", statusColor: "blue", lastModified: "3/05/2026", trade: "Electrical", attachmentCount: 2 },
    { id: "wf-asset-mv-03", name: "33 kV MV feeder — String 06 (WTG-13…16)", code: "NSO-MV-STR-06", project: "North Sea Offshore Wind Phase II", type: "MV Cable Systems", status: "Approved", statusColor: "green", lastModified: "3/04/2026", trade: "Electrical", attachmentCount: 0 },
    { id: "wf-asset-conv-01", name: "Full converter skid — Row B OSS tie-in", code: "NSO-CONV-FUL-01", project: "North Sea Offshore Wind Phase II", type: "Full Converter Assembly", status: "Installed", statusColor: "blue", lastModified: "3/03/2026", trade: "Electrical", attachmentCount: 2 },
    { id: "wf-asset-ss-01", name: "Pad-mount string SS — Hilltop collector", code: "GPE-SS-HILL-01", project: "Great Plains Wind Energy Hub", type: "Pad-Mount / String Substations", status: "Installed", statusColor: "blue", lastModified: "3/04/2026", trade: "Electrical", attachmentCount: 2 },
    { id: "wf-asset-ss-02", name: "Pad-mount SS — North ridge", code: "GPE-SS-NRD-02", project: "Great Plains Wind Energy Hub", type: "Pad-Mount / String Substations", status: "Installed", statusColor: "blue", lastModified: "3/03/2026", trade: "Electrical", attachmentCount: 1 },
    { id: "wf-asset-sub-poi", name: "POC breaker — POC-01 (POI with utility)", code: "GPE-POI-01", project: "Great Plains Wind Energy Hub", type: "Point of Interconnection", status: "Commissioned", statusColor: "teal", lastModified: "3/03/2026", trade: "Electrical", attachmentCount: 5 },
    { id: "wf-asset-sub-swg", name: "GIS HV switchgear — 138 kV export", code: "CRR-SWG-138-01", project: "Coastal Ridge Repower Project", type: "HV Switchgear", status: "Installed", statusColor: "blue", lastModified: "3/02/2026", trade: "Electrical", attachmentCount: 1 },
    { id: "wf-asset-rtc-01", name: "STATCOM — reactive support", code: "CRR-RTC-01", project: "Coastal Ridge Repower Project", type: "Reactive Compensation", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/01/2026", trade: "Electrical", attachmentCount: 2 },
    { id: "wf-asset-met-01", name: "IEC 61400 met mast — Row A (80 m)", code: "GPE-MET-ROWA", project: "Great Plains Wind Energy Hub", type: "Meteorological Towers", status: "Installed", statusColor: "blue", lastModified: "3/01/2026", trade: "Controls", attachmentCount: 0 },
    { id: "wf-asset-met-02", name: "LiDAR vertical profiler — offshore met", code: "NSO-MET-LIDAR", project: "North Sea Offshore Wind Phase II", type: "Meteorological Towers", status: "Commissioned", statusColor: "teal", lastModified: "2/28/2026", trade: "Controls", attachmentCount: 1 },
    { id: "wf-asset-om-01", name: "O&M warehouse — spare parts & tools", code: "GPE-OM-WH-01", project: "Great Plains Wind Energy Hub", type: "O&M Facilities", status: "Approved", statusColor: "green", lastModified: "2/27/2026", trade: "General", attachmentCount: 0 },
    { id: "wf-asset-scada", name: "SCADA historian + HMI — primary server", code: "NSO-SCADA-FE-01", project: "North Sea Offshore Wind Phase II", type: "SCADA & Telecommunications", status: "Approved", statusColor: "green", lastModified: "3/11/2026", trade: "Controls", attachmentCount: 2 },
    { id: "wf-asset-road", name: "Access road & crane pad — Sector 7", code: "CRR-RD-SEC07", project: "Coastal Ridge Repower Project", type: "Access Roads & Crane Pads", status: "Installed", statusColor: "blue", lastModified: "2/28/2026", trade: "General", attachmentCount: 1 },
    { id: "wf-asset-drn-01", name: "Slope drainage — eastern lease line", code: "CRR-DRN-E01", project: "Coastal Ridge Repower Project", type: "Drainage & Erosion Control", status: "Installed", statusColor: "blue", lastModified: "2/26/2026", trade: "General", attachmentCount: 0 },
  ],
  "template-highways": [
    { id: "hw-asset-1", name: "NB Mainline HMA — MP 12.4–14.8", code: "I95-NB-HMA-124", project: "I-95 North Corridor Reconstruction", type: "Asphalt Pavement", status: "Installed", statusColor: "blue", lastModified: "3/12/2026", trade: "General" },
    { id: "hw-asset-2", name: "JPCP Panel Replacement — SB Lane 2", code: "I95-SB-JPCP-089", project: "I-95 North Corridor Reconstruction", type: "Concrete Pavement", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/11/2026", trade: "General" },
    { id: "hw-asset-3", name: "Bridge B-240 — Deck Overlay", code: "B240-DCK-001", project: "Mountain Pass Expressway Phase 3", type: "Bridge Decks", status: "Approved", statusColor: "green", lastModified: "3/10/2026", trade: "Structural" },
    { id: "hw-asset-4", name: "Modular Expansion Joint — Pier 3", code: "B240-JNT-P3", project: "Mountain Pass Expressway Phase 3", type: "Bearings & Expansion Joints", status: "Installed", statusColor: "blue", lastModified: "3/09/2026", trade: "Structural" },
    { id: "hw-asset-5", name: "RC Box Culvert — Mile 44.2", code: "MPX-CUL-442", project: "Mountain Pass Expressway Phase 3", type: "Culverts", status: "Commissioned", statusColor: "teal", lastModified: "3/08/2026", trade: "Drainage" },
    { id: "hw-asset-6", name: "Inlet CB-17 — Trunk Line T-4", code: "BEL-INT-CB17", project: "Urban Beltway ITS & Safety Upgrade", type: "Storm Inlets & Conveyance", status: "Installed", statusColor: "blue", lastModified: "3/07/2026", trade: "Drainage" },
    { id: "hw-asset-7", name: "Adaptive Signal — Oak Ave / Beltway", code: "ITS-SIG-OAK-01", project: "Urban Beltway ITS & Safety Upgrade", type: "Traffic Signals", status: "Commissioned", statusColor: "teal", lastModified: "3/06/2026", trade: "Electrical" },
    { id: "hw-asset-8", name: "DMS — Northbound Advance (1 mi)", code: "ITS-VMS-NB1", project: "Urban Beltway ITS & Safety Upgrade", type: "Variable Message Signs", status: "Approved", statusColor: "green", lastModified: "3/05/2026", trade: "Electrical" },
    { id: "hw-asset-9", name: "CCTV Pan-Tilt — MM 8.2 NB", code: "ITS-CAM-MM82", project: "Urban Beltway ITS & Safety Upgrade", type: "CCTV & Vehicle Detection", status: "Installed", statusColor: "blue", lastModified: "3/04/2026", trade: "Electrical" },
    { id: "hw-asset-10", name: "LED High-Mast — Interchange G", code: "EL-LGT-HMG-07", project: "I-95 North Corridor Reconstruction", type: "Highway Lighting", status: "Installed", statusColor: "blue", lastModified: "3/03/2026", trade: "Electrical" },
    { id: "hw-asset-11", name: "Service Cabinet — Fiber Ring Node 3", code: "EL-PWR-SC-N3", project: "Urban Beltway ITS & Safety Upgrade", type: "Electrical Service & Cabinets", status: "IN-DESIGN", statusColor: "gray", lastModified: "3/02/2026", trade: "Electrical" },
    { id: "hw-asset-12", name: "MASH TL-3 Guardrail — MP 22–24", code: "SA-GRD-TL3-22", project: "Mountain Pass Expressway Phase 3", type: "Guardrail & Cable Barrier", status: "Approved", statusColor: "green", lastModified: "3/01/2026", trade: "Safety" },
    { id: "hw-asset-13", name: "REACT 350 Crash Cushion — Ramp D", code: "SA-ATT-R350-D", project: "I-95 North Corridor Reconstruction", type: "Crash Cushions & End Treatments", status: "Installed", statusColor: "blue", lastModified: "2/28/2026", trade: "Safety" },
  ],
  "template-airport": [
    { id: "ap-asset-1", name: "RWY 09L/27R — Structural Section C", code: "RWY09L-SEC-C", project: "Regional Airport Runway 09L/27R Rehabilitation", type: "Runway Pavement", status: "Commissioned", statusColor: "teal", lastModified: "3/12/2026", trade: "Pavement" },
    { id: "ap-asset-2", name: "TWY K — Full-Depth PCC Panel", code: "TWYK-PCC-01", project: "Midcontinent International Terminal Expansion", type: "Taxiway & Apron Pavement", status: "Installed", statusColor: "blue", lastModified: "3/11/2026", trade: "Pavement" },
    { id: "ap-asset-3", name: "MALSR Approach — RWY 09L", code: "ALS-09L-MALSR", project: "Regional Airport Runway 09L/27R Rehabilitation", type: "Approach & ALS Systems", status: "Approved", statusColor: "green", lastModified: "3/10/2026", trade: "Electrical" },
    { id: "ap-asset-4", name: "HIRL Circuit 2 — RWY 09L Edge", code: "REL-09L-C2", project: "Regional Airport Runway 09L/27R Rehabilitation", type: "Runway Edge & Taxiway Lighting", status: "Installed", statusColor: "blue", lastModified: "3/09/2026", trade: "Electrical" },
    { id: "ap-asset-5", name: "Outbound BHS — Tilt Tray Line A", code: "BHS-OUT-TTA", project: "Midcontinent International Terminal Expansion", type: "BHS Conveyors & Transfers", status: "In-Warehouse", statusColor: "blue", lastModified: "3/08/2026", trade: "Mechanical" },
    { id: "ap-asset-6", name: "Inbound Sort — Claim 3 Devices", code: "BHS-IN-SRT3", project: "Midcontinent International Terminal Expansion", type: "Sortation & Make-up", status: "IN-REVIEW", statusColor: "yellow", lastModified: "3/07/2026", trade: "Mechanical" },
    { id: "ap-asset-7", name: "Concourse B — Primary AHU-401", code: "TRM-B-AHU401", project: "Midcontinent International Terminal Expansion", type: "Terminal HVAC", status: "Installed", statusColor: "blue", lastModified: "3/06/2026", trade: "HVAC" },
    { id: "ap-asset-8", name: "Gate B12 — Passenger Boarding Bridge", code: "JBR-B12-4010", project: "Midcontinent International Terminal Expansion", type: "Passenger Boarding Bridges", status: "Commissioned", statusColor: "teal", lastModified: "3/05/2026", trade: "Mechanical" },
    { id: "ap-asset-9", name: "Hydrant Pit HP-18 — Cargo Apron", code: "FUE-HP18-CG", project: "Pacific Hub Cargo & Apron Modernization", type: "Aircraft Fueling & Hydrants", status: "Installed", statusColor: "blue", lastModified: "3/04/2026", trade: "Plumbing" },
    { id: "ap-asset-10", name: "GPU 90 kVA — Hardstand 7", code: "GSE-GPU-HS7", project: "Pacific Hub Cargo & Apron Modernization", type: "Ground Power & PCA", status: "Approved", statusColor: "green", lastModified: "3/03/2026", trade: "Electrical" },
    { id: "ap-asset-11", name: "AOA Perimeter — Sector 4 Fence", code: "SEC-FEN-S4", project: "Pacific Hub Cargo & Apron Modernization", type: "Perimeter Fencing & Gates", status: "Installed", statusColor: "blue", lastModified: "3/02/2026", trade: "Security" },
    { id: "ap-asset-12", name: "SIDA Access — Badging Enrollment Station", code: "SEC-ACS-BDG1", project: "Midcontinent International Terminal Expansion", type: "Access Control & Badging", status: "IN-DESIGN", statusColor: "gray", lastModified: "3/01/2026", trade: "Security" },
  ],
}

const STATUS_COLORS: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  green: "bg-green-100 text-green-700 border-green-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  teal: "bg-teal-100 text-teal-700 border-teal-200",
  yellow: "bg-yellow-100 text-yellow-700 border-yellow-200",
  red: "bg-red-100 text-red-700 border-red-200",
}

interface AssetsListProps {
  templates: AssetTemplate[]
  /** Open Assets nav + template + detail sheet (e.g. `?template=&asset=` from a new tab). */
  deepLink?: { templateId: string; assetId: string } | null
  /** When set (project context), register uses this template only — no template dropdown. */
  lockedTemplateId?: string
  /** When set, only assets for this project name are shown (matches `Asset.project`). */
  projectScope?: { id: string; name: string } | null
  /** Fired when project map view is shown/hidden — parent can lock main scroll (full-viewport map). */
  onMapViewActiveChange?: (active: boolean) => void
}

export function AssetsList({
  templates,
  deepLink,
  lockedTemplateId,
  projectScope,
  onMapViewActiveChange,
}: AssetsListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const urlSearchParams = useSearchParams()
  const deepLinkHandled = useRef(false)

  useEffect(() => {
    deepLinkHandled.current = false
  }, [deepLink?.templateId, deepLink?.assetId])

  useEffect(() => {
    if (projectScope) setFilterProject(FILTER_ALL)
  }, [projectScope?.id])

  const [projectRegisterView, setProjectRegisterView] = useState<"list" | "map">("list")
  const [mapFlyToId, setMapFlyToId] = useState<string | null>(null)

  useEffect(() => {
    if (!projectScope) setProjectRegisterView("list")
  }, [projectScope])

  const isMapView = Boolean(projectScope && projectRegisterView === "map")

  useEffect(() => {
    onMapViewActiveChange?.(isMapView)
    return () => onMapViewActiveChange?.(false)
  }, [isMapView, onMapViewActiveChange])

  const handleMapFlyDone = useCallback(() => setMapFlyToId(null), [])
  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    lockedTemplateId ?? (templates[0]?.id || "")
  )
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedAssets, setSelectedAssets] = useState<string[]>([])
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null)

  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)
  const [bulkAssignTargetId, setBulkAssignTargetId] = useState("")
  const [bulkAssignError, setBulkAssignError] = useState<string | null>(null)
  const [bulkAssignValidation, setBulkAssignValidation] =
    useState<BulkAssignValidationResult | null>(null)
  const [reassignConfirmOpen, setReassignConfirmOpen] = useState(false)

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterType, setFilterType] = useState(FILTER_ALL)
  const [filterStatus, setFilterStatus] = useState(FILTER_ALL)
  const [filterProject, setFilterProject] = useState(FILTER_ALL)
  const [filterTrade, setFilterTrade] = useState(FILTER_ALL)
  const [assemblyFilter, setAssemblyFilter] = useState<"all" | "assemblies" | "components">("all")

  const [liveAssets, setLiveAssets] = useState<Asset[]>([])

  useEffect(() => {
    setLiveAssets([...(TEMPLATE_ASSETS[selectedTemplate] || [])])
  }, [selectedTemplate])

  useEffect(() => {
    if (deepLink) return
    if (lockedTemplateId) {
      setSelectedTemplate(lockedTemplateId)
    }
  }, [lockedTemplateId, deepLink])

  useEffect(() => {
    if (!deepLink) return
    setSelectedTemplate(deepLink.templateId)
  }, [deepLink])

  const assets = liveAssets

  const assetTypesForTemplate = useMemo(
    () => (TEMPLATE_ASSET_TYPES[selectedTemplate] ?? []) as AssetType[],
    [selectedTemplate]
  )

  const assemblyRegisterRows = useMemo(
    () => assets.filter((a) => a.isAssembly),
    [assets]
  )

  const updateAsset = (id: string, patch: Partial<Asset>) => {
    setLiveAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  useEffect(() => {
    setDetailAsset((d) => {
      if (!d) return null
      const next = liveAssets.find((a) => a.id === d.id)
      return next ?? d
    })
  }, [liveAssets])

  useEffect(() => {
    if (!deepLink || deepLinkHandled.current) return
    const row = liveAssets.find((a) => a.id === deepLink.assetId)
    if (!row) return
    setDetailAsset(row)
    deepLinkHandled.current = true
    const keep = new URLSearchParams()
    const proj = urlSearchParams.get(PROJECT_QUERY_PARAM)
    if (proj) keep.set(PROJECT_QUERY_PARAM, proj)
    const q = keep.toString()
    router.replace(q ? `${pathname || "/"}?${q}` : pathname || "/", { scroll: false })
  }, [deepLink, liveAssets, pathname, router, urlSearchParams])

  const filterOptionLists = useMemo(() => {
    const types = [...new Set(assets.map((a) => a.type))].sort()
    const statuses = [...new Set(assets.map((a) => a.status))].sort()
    const projects = [...new Set(assets.map((a) => a.project))].sort()
    const trades = [...new Set(assets.map(tradeLabel))].sort()
    return { types, statuses, projects, trades }
  }, [assets])

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return assets.filter((asset) => {
      if (projectScope && asset.project !== projectScope.name) return false
      if (q) {
        const blob = `${asset.name} ${asset.code} ${asset.project} ${asset.type} ${tradeLabel(asset)}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      if (filterType !== FILTER_ALL && asset.type !== filterType) return false
      if (filterStatus !== FILTER_ALL && asset.status !== filterStatus) return false
      if (filterProject !== FILTER_ALL && asset.project !== filterProject) return false
      if (filterTrade !== FILTER_ALL && tradeLabel(asset) !== filterTrade) return false
      if (assemblyFilter === "assemblies" && !asset.isAssembly) return false
      if (assemblyFilter === "components" && asset.isAssembly) return false
      return true
    })
  }, [
    assets,
    searchQuery,
    filterType,
    filterStatus,
    filterProject,
    filterTrade,
    assemblyFilter,
    projectScope,
  ])

  /** Wind map: show turbine assemblies only so pins match WTG strings on satellite (BOP still in table view). */
  const mapViewAssets = useMemo(() => {
    if (projectScope?.id.startsWith("wf-")) {
      return filteredAssets.filter((a) => a.isAssembly)
    }
    return filteredAssets
  }, [filteredAssets, projectScope?.id])

  /** Register-wide count of assets linked to each assembly (parentAssemblyAssetId). */
  const componentCountByAssemblyId = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of assets) {
      const pid = a.parentAssemblyAssetId
      if (pid) m.set(pid, (m.get(pid) ?? 0) + 1)
    }
    return m
  }, [assets])

  const totalInTemplate = assets.length
  const totalAssets = filteredAssets.length

  const clearFilters = () => {
    setFilterType(FILTER_ALL)
    setFilterStatus(FILTER_ALL)
    setFilterProject(FILTER_ALL)
    setFilterTrade(FILTER_ALL)
    setAssemblyFilter("all")
  }

  const hasActiveFilters =
    filterType !== FILTER_ALL ||
    filterStatus !== FILTER_ALL ||
    filterProject !== FILTER_ALL ||
    filterTrade !== FILTER_ALL ||
    assemblyFilter !== "all"

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedAssets(filteredAssets.map((a) => a.id))
    } else {
      setSelectedAssets([])
    }
  }

  const handleSelectAsset = (assetId: string, checked: boolean) => {
    if (checked) {
      setSelectedAssets((prev) => [...prev, assetId])
    } else {
      setSelectedAssets((prev) => prev.filter((id) => id !== assetId))
    }
  }

  const isAllSelected = filteredAssets.length > 0 && selectedAssets.length === filteredAssets.length

  const selectedTemplateName =
    templates.find((t) => t.id === selectedTemplate)?.name ?? "Template"

  const runBulkAssign = (assetIds: string[], parentAssemblyId: string) => {
    assetIds.forEach((id) => updateAsset(id, { parentAssemblyAssetId: parentAssemblyId }))
    setSelectedAssets([])
    setBulkAssignOpen(false)
    setReassignConfirmOpen(false)
    setBulkAssignTargetId("")
    setBulkAssignError(null)
    setBulkAssignValidation(null)
  }

  const handleBulkAssignApply = () => {
    const target = assets.find((a) => a.id === bulkAssignTargetId)
    if (!target?.isAssembly) {
      setBulkAssignError("Select a valid assembly.")
      setBulkAssignValidation(null)
      return
    }
    const selectedRows = assets.filter((a) => selectedAssets.includes(a.id))
    const catalog = resolveAssemblyTypeForAsset(assetTypesForTemplate, target.type)
    const result = validateBulkAssignToAssembly(assetTypesForTemplate, selectedRows, target, catalog)
    setBulkAssignValidation(result)
    setBulkAssignError(null)

    if (result.invalid.length > 0) {
      return
    }
    if (result.toAssign.length === 0) {
      setBulkAssignError(
        result.alreadyOnTarget.length > 0
          ? "All selected rows are already linked to this assembly."
          : "Nothing to assign."
      )
      return
    }

    if (result.needsReassign.length > 0) {
      setReassignConfirmOpen(true)
    } else {
      runBulkAssign(
        result.toAssign.map((x) => x.id),
        target.id
      )
    }
  }

  const handleConfirmReassign = () => {
    const target = assets.find((a) => a.id === bulkAssignTargetId)
    if (!bulkAssignValidation?.toAssign.length || !target?.isAssembly) {
      setReassignConfirmOpen(false)
      return
    }
    runBulkAssign(
      bulkAssignValidation.toAssign.map((x) => x.id),
      target.id
    )
  }

  return (
    <div
      className={
        isMapView
          ? "relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
          : "relative space-y-4"
      }
    >
      {/* Toolbar */}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-48 min-w-[12rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <Button
            variant={filtersOpen ? "secondary" : "outline"}
            className="gap-2 h-9"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                •
              </span>
            )}
          </Button>

          {projectScope ? (
            <div className="flex h-9 items-center rounded-md border bg-muted/40 p-0.5">
              <Button
                type="button"
                variant={projectRegisterView === "list" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-2.5"
                onClick={() => setProjectRegisterView("list")}
              >
                <LayoutList className="h-4 w-4" />
                List
              </Button>
              <Button
                type="button"
                variant={projectRegisterView === "map" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-2.5"
                onClick={() => setProjectRegisterView("map")}
              >
                <MapIcon className="h-4 w-4" />
                Map
              </Button>
            </div>
          ) : null}

          {selectedAssets.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="gap-2 h-9 border-orange-500/40 text-orange-800 dark:text-orange-200"
              onClick={() => {
                setBulkAssignOpen(true)
                setBulkAssignError(null)
                setBulkAssignValidation(null)
                setBulkAssignTargetId("")
              }}
              disabled={assemblyRegisterRows.length === 0}
              title={
                assemblyRegisterRows.length === 0
                  ? projectScope
                    ? "No assembly assets in this project’s register."
                    : "No assembly assets in this template register."
                  : undefined
              }
            >
              <Link2 className="h-4 w-4" />
              Assign to assembly ({selectedAssets.length})
            </Button>
          )}

          {/* Template picker: company register only. Project register uses the single template assigned to that project. */}
          {!lockedTemplateId && (
            <Select
              value={selectedTemplate}
              onValueChange={(id) => {
                setSelectedTemplate(id)
                clearFilters()
                setSearchQuery("")
              }}
            >
              <SelectTrigger className="w-[220px] h-9">
                <SelectValue placeholder="Select Template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <Button variant="ghost" className="gap-2 text-muted-foreground h-9">
            <Settings2 className="h-4 w-4" />
            Configure
          </Button>
          <div className="text-sm text-muted-foreground text-right">
            <div>
              Total Assets{" "}
              <span className="font-medium text-foreground tabular-nums">
                {totalAssets.toLocaleString()}
              </span>
              {hasActiveFilters || searchQuery.trim() || projectScope ? (
                <span className="text-muted-foreground">
                  {" "}
                  <span className="text-xs">
                    {projectScope ? (
                      <>
                        (of {totalInTemplate.toLocaleString()} in this project · {selectedTemplateName})
                      </>
                    ) : (
                      <> (of {totalInTemplate.toLocaleString()} in template)</>
                    )}
                  </span>
                </span>
              ) : null}
            </div>
            {selectedTemplate === "template-windfarm" && !lockedTemplateId && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Wind Farm register: {totalInTemplate.toLocaleString()} assets
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={
          isMapView
            ? "flex min-h-0 flex-1 items-stretch gap-4 overflow-hidden"
            : "flex items-start gap-4"
        }
      >
        {/* Filters sidebar */}
        {filtersOpen && (
          <aside className="w-full sm:w-72 shrink-0 rounded-lg border bg-card shadow-sm flex flex-col max-h-[calc(100vh-12rem)]">
            <div className="flex items-center justify-between border-b px-3 py-2.5 gap-2">
              <h3 className="text-sm font-semibold">Filters</h3>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-orange-600 hover:text-orange-700"
                  onClick={clearFilters}
                >
                  Clear All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setFiltersOpen(false)}
                  aria-label="Close filters"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="p-3 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select Asset Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTER_ALL}>All types</SelectItem>
                    {filterOptionLists.types.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTER_ALL}>All statuses</SelectItem>
                    {filterOptionLists.statuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!projectScope ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Project</label>
                  <Select value={filterProject} onValueChange={setFilterProject}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select Project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FILTER_ALL}>All projects</SelectItem>
                      {filterOptionLists.projects.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Project</label>
                  <p className="text-sm font-medium text-foreground py-1.5 px-2 rounded-md bg-muted/50 border">
                    {projectScope.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Scoped to this project only</p>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Trade</label>
                <Select value={filterTrade} onValueChange={setFilterTrade}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select Trade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTER_ALL}>All trades</SelectItem>
                    {filterOptionLists.trades.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Assembly</label>
                <Select
                  value={assemblyFilter}
                  onValueChange={(v) => setAssemblyFilter(v as "all" | "assemblies" | "components")}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Assembly" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All assets</SelectItem>
                    <SelectItem value="assemblies">Assemblies only</SelectItem>
                    <SelectItem value="components">Non-assemblies</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full h-9 gap-1">
                    Add Filter
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem disabled>Custom filters (coming soon)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </aside>
        )}

        {/* Main register: list table or project-level satellite map */}
        <div
          className={
            isMapView
              ? "flex min-h-0 min-w-0 flex-1 flex-col space-y-0 overflow-hidden"
              : "min-w-0 flex-1 space-y-0"
          }
        >
          {projectScope && projectRegisterView === "map" ? (
            <AssetsMapViewDynamic
              assets={mapViewAssets}
              projectId={projectScope.id}
              projectName={projectScope.name}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              hasActiveFilters={hasActiveFilters}
              onOpenFilters={() => setFiltersOpen(true)}
              selectedAssetId={detailAsset?.id ?? null}
              onSelectAsset={(a) => setDetailAsset(a)}
              flyToAssetId={mapFlyToId}
              onFlyToConsumed={handleMapFlyDone}
              onRequestFlyTo={(id) => setMapFlyToId(id)}
              templateId={selectedTemplate}
              registerAssets={assets}
            />
          ) : (
      <div className="border rounded-lg overflow-hidden bg-background">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-12">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead className="min-w-[200px]">Name</TableHead>
              <TableHead className="min-w-[180px]">Code</TableHead>
              <TableHead className="min-w-[200px]">
                <div className="flex items-center gap-1">
                  Project
                  <button className="text-muted-foreground hover:text-foreground">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="6" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="18" r="2" />
                    </svg>
                  </button>
                </div>
              </TableHead>
              <TableHead className="min-w-[180px]">
                <div className="flex items-center gap-1">
                  Type
                  <button className="text-muted-foreground hover:text-foreground">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="6" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="18" r="2" />
                    </svg>
                  </button>
                </div>
              </TableHead>
              <TableHead className="min-w-[130px]">
                <div className="flex items-center gap-1">
                  Status
                  <button className="text-muted-foreground hover:text-foreground">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="6" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="18" r="2" />
                    </svg>
                  </button>
                </div>
              </TableHead>
              <TableHead className="min-w-[120px]">
                <div className="flex items-center gap-1">
                  Last Modified
                  <button className="text-muted-foreground hover:text-foreground">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="6" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="18" r="2" />
                    </svg>
                  </button>
                </div>
              </TableHead>
              <TableHead className="min-w-[160px]">Assembly</TableHead>
              <TableHead className="w-24 text-center">
                <span className="inline-flex items-center justify-center gap-1" title="Components">
                  <Boxes className="h-3.5 w-3.5" aria-hidden />
                </span>
              </TableHead>
              <TableHead className="w-24 text-center">
                <span className="inline-flex items-center justify-center gap-1">
                  <Paperclip className="h-3.5 w-3.5" aria-hidden />
                </span>
              </TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAssets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <p>No assets found</p>
                    <p className="text-sm">
                      {projectScope
                        ? "No assets match your filters for this project."
                        : "No assets for this template."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredAssets.map((asset) => (
                <TableRow
                  key={asset.id}
                  className={cn(
                    "hover:bg-muted/30 cursor-pointer",
                    selectedAssets.includes(asset.id) && "bg-blue-50/80 dark:bg-blue-950/30",
                    detailAsset?.id === asset.id && "bg-muted/50"
                  )}
                  onClick={() => setDetailAsset(asset)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedAssets.includes(asset.id)}
                      onCheckedChange={(checked) => handleSelectAsset(asset.id, checked as boolean)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-blue-600 font-medium hover:underline truncate">
                        {asset.name}
                      </span>
                      {asset.isAssembly && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px] px-1.5 py-0 h-5 border-orange-500/40 text-orange-800 bg-orange-500/10"
                        >
                          Assembly
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">
                    {asset.code}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {asset.project}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {asset.type}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[asset.statusColor]}`}>
                      {asset.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {asset.lastModified}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px]">
                    <span className="truncate block" title={asset.isAssembly ? undefined : asset.parentAssemblyAssetId ? (assets.find((a) => a.id === asset.parentAssemblyAssetId)?.name ?? "") : undefined}>
                      {asset.isAssembly
                        ? "—"
                        : asset.parentAssemblyAssetId
                          ? assets.find((a) => a.id === asset.parentAssemblyAssetId)?.name ?? "—"
                          : "—"}
                    </span>
                  </TableCell>
                  <TableCell
                    className="text-center text-muted-foreground text-xs tabular-nums"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="inline-flex items-center gap-1 justify-center">
                      <Boxes className="h-3.5 w-3.5 opacity-60" aria-hidden />
                      {asset.isAssembly
                        ? String(componentCountByAssemblyId.get(asset.id) ?? 0).padStart(2, "0")
                        : "—"}
                    </span>
                  </TableCell>
                  <TableCell
                    className="text-center text-muted-foreground text-xs tabular-nums"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="inline-flex items-center gap-1 justify-center">
                      <Paperclip className="h-3.5 w-3.5 opacity-60" aria-hidden />
                      {String(asset.attachmentCount ?? 0).padStart(2, "0")}
                    </span>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
          )}
        </div>
      </div>

      <Dialog
        open={bulkAssignOpen}
        onOpenChange={(open) => {
          setBulkAssignOpen(open)
          if (!open) {
            setBulkAssignError(null)
            setBulkAssignValidation(null)
            setBulkAssignTargetId("")
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign to assembly</DialogTitle>
            <DialogDescription>
              Link selected register rows as components of an assembly. Only types allowed under that
              assembly in Asset Settings can be assigned; assembly rows cannot be selected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-assembly">Target assembly</Label>
              <Select value={bulkAssignTargetId} onValueChange={setBulkAssignTargetId}>
                <SelectTrigger id="bulk-assembly" className="w-full">
                  <SelectValue placeholder="Select assembly…" />
                </SelectTrigger>
                <SelectContent>
                  {assemblyRegisterRows.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {bulkAssignError ? (
              <Alert variant="destructive">
                <AlertTitle>Cannot assign</AlertTitle>
                <AlertDescription>{bulkAssignError}</AlertDescription>
              </Alert>
            ) : null}
            {bulkAssignValidation && bulkAssignValidation.invalid.length > 0 ? (
              <Alert variant="destructive">
                <AlertTitle>These rows cannot be assigned</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 max-h-40 list-disc space-y-2 overflow-y-auto pl-4 text-sm">
                    {bulkAssignValidation.invalid.map((row) => (
                      <li key={row.asset.id}>
                        <span className="font-medium">{row.asset.name}</span> ({row.asset.code}) —{" "}
                        {row.reason}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
            {bulkAssignValidation &&
            bulkAssignValidation.invalid.length === 0 &&
            bulkAssignValidation.alreadyOnTarget.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {bulkAssignValidation.alreadyOnTarget.length} row(s) already linked to this assembly
                (skipped).
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setBulkAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-orange-500 hover:bg-orange-600"
              disabled={!bulkAssignTargetId}
              onClick={handleBulkAssignApply}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={reassignConfirmOpen} onOpenChange={setReassignConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reassign from another assembly?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-left">
              <span className="block text-sm text-muted-foreground">
                {bulkAssignValidation?.needsReassign.length} row(s) are already linked to a different
                assembly parent. Continue to move them to the selected assembly?
              </span>
              <ul className="max-h-36 list-inside list-disc overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-xs text-foreground">
                {bulkAssignValidation?.needsReassign.map((r) => (
                  <li key={r.id}>
                    {r.name} — {r.code}
                  </li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-500 hover:bg-orange-600"
              onClick={handleConfirmReassign}
            >
              Reassign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AssetDetailPanel
        open={detailAsset !== null}
        onOpenChange={(open) => {
          if (!open) setDetailAsset(null)
        }}
        asset={detailAsset}
        templateName={selectedTemplateName}
        templateId={selectedTemplate}
        templateAssets={assets}
        onUpdateAsset={updateAsset}
      />
    </div>
  )
}
