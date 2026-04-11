"use client"

import { useState, useCallback, type SetStateAction } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Search, Plus, Upload, Settings, Download, FolderInput } from "lucide-react"
import type { AssetType, FieldsetData } from "@/app/page"
import { AssetTypesTable } from "@/components/asset-types-table"
import { AssetTypeSheet } from "@/components/asset-type-sheet"
import {
  BulkCreateDialog,
  type HierarchyItem,
  type Fieldset,
} from "@/components/bulk-create-dialog"
import { EXISTING_CUSTOM_FIELDS, type CustomFieldMapping } from "@/components/custom-field-mapping"
import {
  findImportedCustomFieldTypeRaw,
  isCsvCustomFieldTypeTokenName,
  mapImportedCustomFieldTypeToApp,
} from "@/lib/map-imported-custom-field-type"
import { buildDeepHierarchyClassificationCsv } from "@/lib/export-deep-hierarchy-csv"
import type { AssetTemplate } from "@/components/asset-templates-table"
import {
  ImportFromTemplateDialog,
  type ImportFromApplyPayload,
} from "@/components/import-from-template-dialog"
import {
  buildMultiClientFieldsetDisplayName,
  FIELDSET_DISPLAY_PRIMARY_CLIENT,
} from "@/lib/fieldset-display-names"
import { GlobalAssetSettings } from "@/components/global-asset-settings"
import { COPY_SOURCE_COMPANY_CATALOG_ID } from "@/lib/copy-template-sources"
import {
  ALL_CATALOG_FIELDSET_CLIENTS,
  mergeFieldsetsMapsForFlatDisplay,
  syncFlatFieldsetsFromPrimaryClient,
} from "@/lib/build-multi-hierarchy-global-catalog"

// Default fieldsets that are always available
const DEFAULT_FIELDSETS: Record<string, FieldsetData> = {
  "Procore Default": {
    name: "Procore Default",
    sections: [
      {
        name: "General Information",
        fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"]
      },
      {
        name: "Technical Details",
        fields: ["Manufacturer", "Model Number", "Serial Number", "Installation Date"]
      }
    ]
  }
}

/** Shared DC hierarchy for AWS / Meta / Oracle templates (display names align with multi-client fieldsets). */
const TEMPLATE_DATACENTER_ASSET_TYPES: AssetType[] = [
  { id: "dc-23", name: "Mechanical & HVAC", code: "23", description: "Cooling and air handling systems", fieldset: "23_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
  { id: "dc-23-gen", name: "Cooling Generation", code: "23-GEN", description: "Chilled water and cooling systems", fieldset: "23-GEN_Fieldset", statusGroup: "Procore Default", parentId: "dc-23", hasSubtypes: true },
  {
    id: "dc-23-gen-chl",
    name: "Chiller Units",
    code: "23-GEN-CHL",
    description: "Centralized cooling source for the facility",
    fieldset: "23-GEN_Fieldset",
    fieldsetCandidates: ["23-GEN_Fieldset", "23-AIR_Fieldset", "23-PMP_Fieldset"],
    statusGroup: "Procore Default",
    parentId: "dc-23-gen",
  },
  { id: "dc-23-gen-ctw", name: "Cooling Towers", code: "23-GEN-CTW", description: "Heat rejection systems for water-cooled chillers", fieldset: "23-GEN_Fieldset", statusGroup: "Procore Default", parentId: "dc-23-gen" },
  { id: "dc-23-gen-hex", name: "Heat Exchangers", code: "23-GEN-HEX", description: "Plates used for fluid-to-fluid thermal transfer", fieldset: "23-GEN_Fieldset", statusGroup: "Procore Default", parentId: "dc-23-gen" },
  { id: "dc-23-air", name: "Air Handling & Room Cooling", code: "23-AIR", description: "Computer room cooling", fieldset: "23-AIR_Fieldset", statusGroup: "Procore Default", parentId: "dc-23", hasSubtypes: true },
  { id: "dc-23-air-crc", name: "CRAC Units", code: "23-AIR-CRC", description: "DX-based Computer Room Air Conditioning", fieldset: "23-AIR_Fieldset", statusGroup: "Procore Default", parentId: "dc-23-air" },
  { id: "dc-23-air-crh", name: "CRAH Units", code: "23-AIR-CRH", description: "Chilled Water-based Computer Room Air Handlers", fieldset: "23-AIR_Fieldset", statusGroup: "Procore Default", parentId: "dc-23-air" },
  { id: "dc-23-air-irc", name: "In-Row Cooling", code: "23-AIR-IRC", description: "Cooling units placed between server racks", fieldset: "23-AIR_Fieldset", statusGroup: "Procore Default", parentId: "dc-23-air" },
  { id: "dc-23-pmp", name: "Fluid Distribution", code: "23-PMP", description: "Pumps and valves", fieldset: "23-PMP_Fieldset", statusGroup: "Procore Default", parentId: "dc-23", hasSubtypes: true },
  { id: "dc-23-pmp-cwp", name: "Chilled Water Pumps", code: "23-PMP-CWP", description: "Pumps circulating water to cooling units", fieldset: "23-PMP_Fieldset", statusGroup: "Procore Default", parentId: "dc-23-pmp" },
  { id: "dc-23-pmp-vlv", name: "Control Valves", code: "23-PMP-VLV", description: "Motorized valves for flow and pressure regulation", fieldset: "23-PMP_Fieldset", statusGroup: "Procore Default", parentId: "dc-23-pmp" },
  { id: "dc-26", name: "Electrical Systems", code: "26", description: "Power distribution and UPS", fieldset: "26_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
  { id: "dc-26-pwr", name: "Power Distribution", code: "26-PWR", description: "Critical power distribution", fieldset: "26-PWR_Fieldset", statusGroup: "Procore Default", parentId: "dc-26", hasSubtypes: true },
  { id: "dc-26-pwr-pdu", name: "PDUs", code: "26-PWR-PDU", description: "Power distribution units", fieldset: "26-PWR_Fieldset", statusGroup: "Procore Default", parentId: "dc-26-pwr" },
  { id: "dc-26-pwr-sts", name: "Static Transfer Switches", code: "26-PWR-STS", description: "Automatic transfer switches", fieldset: "26-PWR_Fieldset", statusGroup: "Procore Default", parentId: "dc-26-pwr" },
  { id: "dc-26-ups", name: "UPS Systems", code: "26-UPS", description: "Uninterruptible power supply", fieldset: "26-UPS_Fieldset", statusGroup: "Procore Default", parentId: "dc-26", hasSubtypes: true },
  { id: "dc-26-ups-mod", name: "Modular UPS", code: "26-UPS-MOD", description: "Scalable modular UPS systems", fieldset: "26-UPS_Fieldset", statusGroup: "Procore Default", parentId: "dc-26-ups" },
  { id: "dc-26-ups-bat", name: "Battery Systems", code: "26-UPS-BAT", description: "UPS battery banks", fieldset: "26-UPS_Fieldset", statusGroup: "Procore Default", parentId: "dc-26-ups" },
  { id: "dc-26-gen", name: "Emergency Power", code: "26-GEN", description: "Backup generators", fieldset: "26-GEN_Fieldset", statusGroup: "Procore Default", parentId: "dc-26", hasSubtypes: true },
  { id: "dc-26-gen-dsl", name: "Diesel Generators", code: "26-GEN-DSL", description: "Primary backup power generation", fieldset: "26-GEN_Fieldset", statusGroup: "Procore Default", parentId: "dc-26-gen" },
  { id: "dc-26-gen-ats", name: "ATS", code: "26-GEN-ATS", description: "Automatic transfer switches", fieldset: "26-GEN_Fieldset", statusGroup: "Procore Default", parentId: "dc-26-gen" },
]

// Pre-populated asset types for each template
const TEMPLATE_ASSET_TYPES: Record<string, AssetType[]> = {
  "template-default": [],
  "template-residential": [
    { id: "res-01", name: "Site & Grounds", code: "01", description: "Site infrastructure and landscaping", fieldset: "01_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "res-01-lnd", name: "Landscaping", code: "01-LND", description: "Landscaping systems", fieldset: "01_Fieldset", statusGroup: "Procore Default", parentId: "res-01", hasSubtypes: true },
    { id: "res-01-lnd-irr", name: "Irrigation Systems", code: "01-LND-IRR", description: "Automated watering systems for grounds", fieldset: "01_Fieldset", statusGroup: "Procore Default", parentId: "res-01-lnd" },
    { id: "res-01-lnd-lgt", name: "Landscape Lighting", code: "01-LND-LGT", description: "Outdoor pathway and accent lighting", fieldset: "01_Fieldset", statusGroup: "Procore Default", parentId: "res-01-lnd" },
    { id: "res-22", name: "Plumbing Systems", code: "22", description: "Domestic water and sanitary systems", fieldset: "22_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "res-22-dom", name: "Domestic Water", code: "22-DOM", description: "Domestic water distribution", fieldset: "22-DOM_Fieldset", statusGroup: "Procore Default", parentId: "res-22", hasSubtypes: true },
    { id: "res-22-dom-hwh", name: "Water Heaters", code: "22-DOM-HWH", description: "Hot water generation units", fieldset: "22-DOM_Fieldset", statusGroup: "Procore Default", parentId: "res-22-dom" },
    { id: "res-22-dom-pmp", name: "Booster Pumps", code: "22-DOM-PMP", description: "Water pressure boosting systems", fieldset: "22-DOM_Fieldset", statusGroup: "Procore Default", parentId: "res-22-dom" },
    { id: "res-23", name: "HVAC Systems", code: "23", description: "Heating, ventilation, and air conditioning", fieldset: "23_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "res-23-hva", name: "Heating & Cooling", code: "23-HVA", description: "Heating and cooling equipment", fieldset: "23-HVA_Fieldset", statusGroup: "Procore Default", parentId: "res-23", hasSubtypes: true },
    { id: "res-23-hva-rtu", name: "Rooftop Units", code: "23-HVA-RTU", description: "Packaged HVAC units", fieldset: "23-HVA_Fieldset", statusGroup: "Procore Default", parentId: "res-23-hva" },
    { id: "res-23-hva-spl", name: "Split Systems", code: "23-HVA-SPL", description: "Individual unit cooling systems", fieldset: "23-HVA_Fieldset", statusGroup: "Procore Default", parentId: "res-23-hva" },
    { id: "res-26", name: "Electrical Systems", code: "26", description: "Power distribution and lighting", fieldset: "26_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "res-26-pwr", name: "Power Distribution", code: "26-PWR", description: "Electrical power distribution", fieldset: "26-PWR_Fieldset", statusGroup: "Procore Default", parentId: "res-26", hasSubtypes: true },
    { id: "res-26-pwr-swg", name: "Switchgear", code: "26-PWR-SWG", description: "Main electrical distribution", fieldset: "26-PWR_Fieldset", statusGroup: "Procore Default", parentId: "res-26-pwr" },
    { id: "res-26-pwr-pnl", name: "Panel Boards", code: "26-PWR-PNL", description: "Branch circuit distribution", fieldset: "26-PWR_Fieldset", statusGroup: "Procore Default", parentId: "res-26-pwr" },
    { id: "res-28", name: "Life Safety", code: "28", description: "Fire protection and safety systems", fieldset: "28_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "res-28-fir", name: "Fire Protection", code: "28-FIR", description: "Fire suppression and detection", fieldset: "28-FIR_Fieldset", statusGroup: "Procore Default", parentId: "res-28", hasSubtypes: true },
    { id: "res-28-fir-spr", name: "Sprinkler Systems", code: "28-FIR-SPR", description: "Fire suppression sprinklers", fieldset: "28-FIR_Fieldset", statusGroup: "Procore Default", parentId: "res-28-fir" },
    { id: "res-28-fir-alm", name: "Fire Alarms", code: "28-FIR-ALM", description: "Detection and alarm systems", fieldset: "28-FIR_Fieldset", statusGroup: "Procore Default", parentId: "res-28-fir" },
    { id: "res-14", name: "Vertical Transportation", code: "14", description: "Elevators and lifts for residents, service, and accessibility", fieldset: "14_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "res-14-elv", name: "Elevators", code: "14-ELV", description: "Passenger, service, and MRL / hydraulic units", fieldset: "14-ELV_Fieldset", statusGroup: "Procore Default", parentId: "res-14", hasSubtypes: true },
    { id: "res-14-elv-psg", name: "Passenger Elevators", code: "14-ELV-PSG", description: "Resident and visitor cars", fieldset: "14-ELV_Fieldset", statusGroup: "Procore Default", parentId: "res-14-elv" },
    { id: "res-14-elv-svc", name: "Service & Freight Elevators", code: "14-ELV-SVC", description: "Moving, trash, and equipment lifts", fieldset: "14-ELV_Fieldset", statusGroup: "Procore Default", parentId: "res-14-elv" },
  ],
  "template-commercial": [
    { id: "com-01", name: "Site Infrastructure", code: "01", description: "Site systems and security", fieldset: "01_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "com-01-prk", name: "Parking Systems", code: "01-PRK", description: "Parking facilities and equipment", fieldset: "01-PRK_Fieldset", statusGroup: "Procore Default", parentId: "com-01", hasSubtypes: true },
    { id: "com-01-prk-gat", name: "Parking Gates", code: "01-PRK-GAT", description: "Entry/exit gate systems", fieldset: "01-PRK_Fieldset", statusGroup: "Procore Default", parentId: "com-01-prk" },
    { id: "com-01-prk-pay", name: "Payment Systems", code: "01-PRK-PAY", description: "Parking payment kiosks", fieldset: "01-PRK_Fieldset", statusGroup: "Procore Default", parentId: "com-01-prk" },
    { id: "com-14", name: "Vertical Transportation", code: "14", description: "Elevators and escalators", fieldset: "14_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "com-14-elv", name: "Elevators", code: "14-ELV", description: "Passenger and freight elevators", fieldset: "14-ELV_Fieldset", statusGroup: "Procore Default", parentId: "com-14", hasSubtypes: true },
    { id: "com-14-elv-psg", name: "Passenger Elevators", code: "14-ELV-PSG", description: "Standard passenger transport", fieldset: "14-ELV_Fieldset", statusGroup: "Procore Default", parentId: "com-14-elv" },
    { id: "com-14-elv-frt", name: "Freight Elevators", code: "14-ELV-FRT", description: "Service and freight transport", fieldset: "14-ELV_Fieldset", statusGroup: "Procore Default", parentId: "com-14-elv" },
    { id: "com-21", name: "Fire Suppression", code: "21", description: "Fire suppression systems", fieldset: "21_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "com-21-spr", name: "Sprinkler Systems", code: "21-SPR", description: "Water-based fire suppression", fieldset: "21-SPR_Fieldset", statusGroup: "Procore Default", parentId: "com-21", hasSubtypes: true },
    { id: "com-21-spr-wet", name: "Wet Pipe Systems", code: "21-SPR-WET", description: "Standard water sprinklers", fieldset: "21-SPR_Fieldset", statusGroup: "Procore Default", parentId: "com-21-spr" },
    { id: "com-21-spr-dry", name: "Dry Pipe Systems", code: "21-SPR-DRY", description: "Cold area sprinklers", fieldset: "21-SPR_Fieldset", statusGroup: "Procore Default", parentId: "com-21-spr" },
    { id: "com-23", name: "HVAC Systems", code: "23", description: "Heating and cooling systems", fieldset: "23_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "com-23-chl", name: "Central Plant", code: "23-CHL", description: "Chillers and boilers", fieldset: "23-CHL_Fieldset", statusGroup: "Procore Default", parentId: "com-23", hasSubtypes: true },
    { id: "com-23-chl-chr", name: "Chillers", code: "23-CHL-CHR", description: "Centrifugal and screw chillers", fieldset: "23-CHL_Fieldset", statusGroup: "Procore Default", parentId: "com-23-chl" },
    { id: "com-23-chl-blr", name: "Boilers", code: "23-CHL-BLR", description: "Hot water and steam boilers", fieldset: "23-CHL_Fieldset", statusGroup: "Procore Default", parentId: "com-23-chl" },
    { id: "com-26", name: "Electrical", code: "26", description: "Electrical and emergency power", fieldset: "26_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "com-26-gen", name: "Emergency Power", code: "26-GEN", description: "Backup power generation", fieldset: "26-GEN_Fieldset", statusGroup: "Procore Default", parentId: "com-26", hasSubtypes: true },
    { id: "com-26-gen-dsl", name: "Diesel Generators", code: "26-GEN-DSL", description: "Backup power generation", fieldset: "26-GEN_Fieldset", statusGroup: "Procore Default", parentId: "com-26-gen" },
    { id: "com-26-gen-ups", name: "UPS Systems", code: "26-GEN-UPS", description: "Uninterruptible power supply", fieldset: "26-GEN_Fieldset", statusGroup: "Procore Default", parentId: "com-26-gen" },
  ],
  "template-healthcare": [
    { id: "hc-11", name: "Medical Equipment", code: "11", description: "Medical and laboratory equipment", fieldset: "11_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "hc-11-img", name: "Imaging Equipment", code: "11-IMG", description: "Diagnostic imaging systems", fieldset: "11-IMG_Fieldset", statusGroup: "Procore Default", parentId: "hc-11", hasSubtypes: true },
    { id: "hc-11-img-mri", name: "MRI Systems", code: "11-IMG-MRI", description: "Magnetic resonance imaging", fieldset: "11-IMG_Fieldset", statusGroup: "Procore Default", parentId: "hc-11-img" },
    { id: "hc-11-img-xry", name: "X-Ray Systems", code: "11-IMG-XRY", description: "Radiographic imaging", fieldset: "11-IMG_Fieldset", statusGroup: "Procore Default", parentId: "hc-11-img" },
    { id: "hc-11-img-ctn", name: "CT Scanners", code: "11-IMG-CTN", description: "Computed tomography", fieldset: "11-IMG_Fieldset", statusGroup: "Procore Default", parentId: "hc-11-img" },
    { id: "hc-22", name: "Medical Gases", code: "22", description: "Medical gas distribution", fieldset: "22_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "hc-22-gas", name: "Gas Systems", code: "22-GAS", description: "Medical gas supply systems", fieldset: "22-GAS_Fieldset", statusGroup: "Procore Default", parentId: "hc-22", hasSubtypes: true },
    { id: "hc-22-gas-oxy", name: "Oxygen Systems", code: "22-GAS-OXY", description: "Medical oxygen supply", fieldset: "22-GAS_Fieldset", statusGroup: "Procore Default", parentId: "hc-22-gas" },
    { id: "hc-22-gas-vac", name: "Vacuum Systems", code: "22-GAS-VAC", description: "Medical vacuum systems", fieldset: "22-GAS_Fieldset", statusGroup: "Procore Default", parentId: "hc-22-gas" },
    { id: "hc-23", name: "HVAC Systems", code: "23", description: "Specialized HVAC systems", fieldset: "23_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "hc-23-ahu", name: "Air Handling", code: "23-AHU", description: "Air handling units", fieldset: "23-AHU_Fieldset", statusGroup: "Procore Default", parentId: "hc-23", hasSubtypes: true },
    { id: "hc-23-ahu-ort", name: "Operating Room AHUs", code: "23-AHU-ORT", description: "Surgical suite air handlers", fieldset: "23-AHU_Fieldset", statusGroup: "Procore Default", parentId: "hc-23-ahu" },
    { id: "hc-23-ahu-iso", name: "Isolation Room AHUs", code: "23-AHU-ISO", description: "Negative pressure systems", fieldset: "23-AHU_Fieldset", statusGroup: "Procore Default", parentId: "hc-23-ahu" },
    { id: "hc-26", name: "Electrical Systems", code: "26", description: "Critical power systems", fieldset: "26_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "hc-26-crt", name: "Critical Power", code: "26-CRT", description: "Life safety power systems", fieldset: "26-CRT_Fieldset", statusGroup: "Procore Default", parentId: "hc-26", hasSubtypes: true },
    { id: "hc-26-crt-gen", name: "Emergency Generators", code: "26-CRT-GEN", description: "Life safety backup", fieldset: "26-CRT_Fieldset", statusGroup: "Procore Default", parentId: "hc-26-crt" },
    { id: "hc-26-crt-ups", name: "UPS Systems", code: "26-CRT-UPS", description: "Equipment protection", fieldset: "26-CRT_Fieldset", statusGroup: "Procore Default", parentId: "hc-26-crt" },
    { id: "hc-28", name: "Life Safety", code: "28", description: "Nurse call and emergency systems", fieldset: "28_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "hc-28-nrs", name: "Nurse Call", code: "28-NRS", description: "Patient communication systems", fieldset: "28-NRS_Fieldset", statusGroup: "Procore Default", parentId: "hc-28", hasSubtypes: true },
    { id: "hc-28-nrs-std", name: "Nurse Call Stations", code: "28-NRS-STD", description: "Patient call systems", fieldset: "28-NRS_Fieldset", statusGroup: "Procore Default", parentId: "hc-28-nrs" },
    { id: "hc-28-nrs-cod", name: "Code Blue", code: "28-NRS-COD", description: "Emergency alert systems", fieldset: "28-NRS_Fieldset", statusGroup: "Procore Default", parentId: "hc-28-nrs" },
    { id: "hc-14", name: "Vertical Transportation", code: "14", description: "Patient, visitor, staff, and material vertical circulation", fieldset: "14_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "hc-14-elv", name: "Elevators", code: "14-ELV", description: "IGBC / stretcher-compliant and public lifts", fieldset: "14-ELV_Fieldset", statusGroup: "Procore Default", parentId: "hc-14", hasSubtypes: true },
    { id: "hc-14-elv-pat", name: "Patient / Bed Elevators", code: "14-ELV-PAT", description: "Stretcher-capacity cars and emergency power interface", fieldset: "14-ELV_Fieldset", statusGroup: "Procore Default", parentId: "hc-14-elv" },
    { id: "hc-14-elv-pub", name: "Public & Visitor Elevators", code: "14-ELV-PUB", description: "Lobbies, parking, and inter-building links", fieldset: "14-ELV_Fieldset", statusGroup: "Procore Default", parentId: "hc-14-elv" },
  ],
  "template-industrial": [
    { id: "ind-11", name: "Process Equipment", code: "11", description: "Production and storage equipment", fieldset: "11_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "ind-11-prd", name: "Production Equipment", code: "11-PRD", description: "Manufacturing machinery", fieldset: "11-PRD_Fieldset", statusGroup: "Procore Default", parentId: "ind-11", hasSubtypes: true },
    { id: "ind-11-prd-cnc", name: "CNC Machines", code: "11-PRD-CNC", description: "Computer numerical control machines", fieldset: "11-PRD_Fieldset", statusGroup: "Procore Default", parentId: "ind-11-prd" },
    { id: "ind-11-prd-cnv", name: "Conveyors", code: "11-PRD-CNV", description: "Material transport systems", fieldset: "11-PRD_Fieldset", statusGroup: "Procore Default", parentId: "ind-11-prd" },
    { id: "ind-11-prd-crn", name: "Cranes", code: "11-PRD-CRN", description: "Overhead bridge cranes", fieldset: "11-PRD_Fieldset", statusGroup: "Procore Default", parentId: "ind-11-prd" },
    { id: "ind-22", name: "Industrial Plumbing", code: "22", description: "Process water and waste", fieldset: "22_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "ind-22-prc", name: "Process Water", code: "22-PRC", description: "Industrial water systems", fieldset: "22-PRC_Fieldset", statusGroup: "Procore Default", parentId: "ind-22", hasSubtypes: true },
    { id: "ind-22-prc-di", name: "DI Water", code: "22-PRC-DI", description: "Deionized water systems", fieldset: "22-PRC_Fieldset", statusGroup: "Procore Default", parentId: "ind-22-prc" },
    { id: "ind-22-prc-chl", name: "Chilled Water", code: "22-PRC-CHL", description: "Process cooling water", fieldset: "22-PRC_Fieldset", statusGroup: "Procore Default", parentId: "ind-22-prc" },
    { id: "ind-23", name: "Industrial HVAC", code: "23", description: "Ventilation and dust collection", fieldset: "23_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "ind-23-vnt", name: "Ventilation", code: "23-VNT", description: "Industrial ventilation", fieldset: "23-VNT_Fieldset", statusGroup: "Procore Default", parentId: "ind-23", hasSubtypes: true },
    { id: "ind-23-vnt-exh", name: "Exhaust Systems", code: "23-VNT-EXH", description: "Fume extraction systems", fieldset: "23-VNT_Fieldset", statusGroup: "Procore Default", parentId: "ind-23-vnt" },
    { id: "ind-23-vnt-mau", name: "Makeup Air", code: "23-VNT-MAU", description: "Fresh air makeup units", fieldset: "23-VNT_Fieldset", statusGroup: "Procore Default", parentId: "ind-23-vnt" },
    { id: "ind-26", name: "Industrial Electrical", code: "26", description: "Motor control and power", fieldset: "26_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "ind-26-mcc", name: "Motor Control", code: "26-MCC", description: "Motor control centers", fieldset: "26-MCC_Fieldset", statusGroup: "Procore Default", parentId: "ind-26", hasSubtypes: true },
    { id: "ind-26-mcc-str", name: "Starters", code: "26-MCC-STR", description: "Motor starters and drives", fieldset: "26-MCC_Fieldset", statusGroup: "Procore Default", parentId: "ind-26-mcc" },
    { id: "ind-26-mcc-vfd", name: "VFDs", code: "26-MCC-VFD", description: "Variable frequency drives", fieldset: "26-MCC_Fieldset", statusGroup: "Procore Default", parentId: "ind-26-mcc" },
    { id: "ind-40", name: "Process Integration", code: "40", description: "Control and automation systems", fieldset: "40_Fieldset", statusGroup: "Procore Default", hasSubtypes: true },
    { id: "ind-40-plc", name: "Control Systems", code: "40-PLC", description: "Programmable logic controllers", fieldset: "40-PLC_Fieldset", statusGroup: "Procore Default", parentId: "ind-40", hasSubtypes: true },
    { id: "ind-40-plc-dcs", name: "DCS", code: "40-PLC-DCS", description: "Distributed control systems", fieldset: "40-PLC_Fieldset", statusGroup: "Procore Default", parentId: "ind-40-plc" },
    { id: "ind-40-plc-hmi", name: "HMI", code: "40-PLC-HMI", description: "Human machine interfaces", fieldset: "40-PLC_Fieldset", statusGroup: "Procore Default", parentId: "ind-40-plc" },
  ],
  "template-datacenter-aws": TEMPLATE_DATACENTER_ASSET_TYPES,
  "template-datacenter-meta": TEMPLATE_DATACENTER_ASSET_TYPES,
  "template-datacenter-oracle": TEMPLATE_DATACENTER_ASSET_TYPES,
  "template-windfarm": [
    {
      id: "wf-01",
      name: "Wind Turbine Systems",
      code: "WF-01",
      description: "Horizontal-axis WTGs including nacelle, rotor, tower, and foundation assets",
      fieldset: "WF_TURB_Fieldset",
      statusGroup: "Procore Default",
      isAssembly: true,
      hasSubtypes: true,
    },
    {
      id: "wf-01-nac",
      name: "Nacelle & Drivetrain",
      code: "WF-01-NAC",
      description: "Generator, gearbox, main shaft, and yaw system within the nacelle",
      fieldset: "WF_NAC_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-01",
      hasSubtypes: true,
    },
    {
      id: "wf-01-nac-gen",
      name: "Main Generator",
      code: "WF-01-NAC-GEN",
      description: "Doubly-fed or full-conversion generator; winding temps and bearing monitoring",
      fieldset: "WF_NAC_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-01-nac",
    },
    {
      id: "wf-01-nac-gbx",
      name: "Gearbox",
      code: "WF-01-NAC-GBX",
      description: "Multi-stage planetary/helical gearbox with oil filtration and vibration sensors",
      fieldset: "WF_NAC_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-01-nac",
    },
    {
      id: "wf-01-rot",
      name: "Rotor & Blades",
      code: "WF-01-ROT",
      description: "Hub, blades, pitch hydraulics or electromechanical pitch drives",
      fieldset: "WF_ROT_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-01",
      hasSubtypes: true,
    },
    {
      id: "wf-01-rot-bld",
      name: "Blade Sets",
      code: "WF-01-ROT-BLD",
      description: "Composite blades, lightning receptors, leading-edge erosion inspection",
      fieldset: "WF_ROT_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-01-rot",
    },
    {
      id: "wf-01-rot-hub",
      name: "Hub & Pitch",
      code: "WF-01-ROT-HUB",
      description: "Hub assembly, pitch motors/bearings, emergency feather",
      fieldset: "WF_ROT_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-01-rot",
    },
    {
      id: "wf-01-twr",
      name: "Tower & Foundation",
      code: "WF-01-TWR",
      description: "Steel tubular or hybrid tower, anchor cage, transition piece (offshore)",
      fieldset: "WF_TWR_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-01",
      hasSubtypes: true,
    },
    {
      id: "wf-01-twr-st",
      name: "Tower Structure",
      code: "WF-01-TWR-ST",
      description: "Bolted flanges, climb system, aviation lighting, internal cable trays",
      fieldset: "WF_TWR_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-01-twr",
    },
    {
      id: "wf-01-twr-fnd",
      name: "Foundation",
      code: "WF-01-TWR-FND",
      description: "Spread footing, rock anchor, monopile, or jacket—grout and cathodic protection",
      fieldset: "WF_TWR_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-01-twr",
    },
    {
      id: "wf-02",
      name: "Electrical & Collection",
      code: "WF-02",
      description: "Turbine LV/MV equipment, collection circuits, and step-up to project substation",
      fieldset: "WF_PWR_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "wf-02-conv",
      name: "Power Conversion",
      code: "WF-02-CONV",
      description: "Converter/inverter skids, line reactor, harmonic filters",
      fieldset: "WF_PWR_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-02",
      hasSubtypes: true,
    },
    {
      id: "wf-02-conv-ful",
      name: "Full Converter Assembly",
      code: "WF-02-CONV-FUL",
      description: "AC–DC–AC conversion chain; IGBT stack cooling and grid-side filter",
      fieldset: "WF_PWR_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-02-conv",
    },
    {
      id: "wf-02-conv-lv",
      name: "LV Converter Modules",
      code: "WF-02-CONV-LV",
      description: "Generator-side converter modules and braking chopper",
      fieldset: "WF_PWR_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-02-conv",
    },
    {
      id: "wf-02-col",
      name: "MV Collection",
      code: "WF-02-COL",
      description: "33–66 kV collection, string substations, cable joints, and grounding grid",
      fieldset: "WF_COL_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-02",
      hasSubtypes: true,
    },
    {
      id: "wf-02-col-mv",
      name: "MV Cable Systems",
      code: "WF-02-COL-MV",
      description: "XLPE submarine or land cables, GIS terminations, PD monitoring",
      fieldset: "WF_COL_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-02-col",
    },
    {
      id: "wf-02-col-ss",
      name: "Pad-Mount / String Substations",
      code: "WF-02-COL-SS",
      description: "Ring-main units, load-break switches, and protection relays per string",
      fieldset: "WF_COL_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-02-col",
    },
    {
      id: "wf-03",
      name: "Substation & Grid Interface",
      code: "WF-03",
      description: "Project substation, HV switchyard, metering, and POI to utility",
      fieldset: "WF_SUB_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "wf-03-swg",
      name: "HV Switchgear",
      code: "WF-03-SWG",
      description: "GIS or AIS breakers, disconnectors, busbars, and interlocking",
      fieldset: "WF_SUB_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-03",
    },
    {
      id: "wf-03-poi",
      name: "Point of Interconnection",
      code: "WF-03-POI",
      description: "Utility metering, sync check, ride-through settings, and grid code compliance",
      fieldset: "WF_SUB_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-03",
    },
    {
      id: "wf-03-rtc",
      name: "Reactive Compensation",
      code: "WF-03-RTC",
      description: "STATCOM, SVC, or switched capacitor banks for voltage support",
      fieldset: "WF_SUB_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-03",
    },
    {
      id: "wf-04",
      name: "Balance of Plant",
      code: "WF-04",
      description: "Met towers, O&M facilities, SCADA, and communications",
      fieldset: "WF_BOP_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "wf-04-met",
      name: "Meteorological Towers",
      code: "WF-04-MET",
      description: "Cup/sonic anemometers, wind vanes, temperature, and bat curtailment sensors",
      fieldset: "WF_BOP_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-04",
    },
    {
      id: "wf-04-om",
      name: "O&M Facilities",
      code: "WF-04-OM",
      description: "Warehouse, laydown, helipad, laydown crane pads, and spare parts storage",
      fieldset: "WF_BOP_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-04",
    },
    {
      id: "wf-04-sc",
      name: "SCADA & Telecommunications",
      code: "WF-04-SC",
      description: "Turbine PLC network, fiber ring, microwave, and remote operations center link",
      fieldset: "WF_BOP_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-04",
    },
    {
      id: "wf-05",
      name: "Site & Civil",
      code: "WF-05",
      description: "Access roads, crane pads, drainage, and environmental controls",
      fieldset: "WF_CIV_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "wf-05-rd",
      name: "Access Roads & Crane Pads",
      code: "WF-05-RD",
      description: "Aggregate or paved haul roads, turning radii, and crane hardstands",
      fieldset: "WF_CIV_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-05",
    },
    {
      id: "wf-05-drn",
      name: "Drainage & Erosion Control",
      code: "WF-05-DRN",
      description: "Culverts, silt fences, stormwater BMPs, and spill containment",
      fieldset: "WF_CIV_Fieldset",
      statusGroup: "Procore Default",
      parentId: "wf-05",
    },
  ],
  "template-highways": [
    {
      id: "hw-01",
      name: "Pavement & Surfacing",
      code: "HW-01",
      description: "Mainline and shoulder pavement assets with ride quality and structural capacity tracking",
      fieldset: "HW_PAV_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "hw-01-asp",
      name: "Asphalt Pavement",
      code: "HW-01-ASP",
      description: "HMA / WMA lifts, longitudinal joints, and thermal cracking inspection",
      fieldset: "HW_PAV_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-01",
    },
    {
      id: "hw-01-con",
      name: "Concrete Pavement",
      code: "HW-01-CON",
      description: "JPCP / CRCP panels, dowel bars, faulting, and diamond grinding history",
      fieldset: "HW_PAV_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-01",
    },
    {
      id: "hw-02",
      name: "Bridges & Structures",
      code: "HW-02",
      description: "Bridge decks, superstructure, bearings, and expansion joints per NBI / element-level inspection",
      fieldset: "HW_BRG_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "hw-02-dck",
      name: "Bridge Decks",
      code: "HW-02-DCK",
      description: "Deck surface, wearing course, drainage scuppers, and deck joints",
      fieldset: "HW_BRG_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-02",
    },
    {
      id: "hw-02-jnt",
      name: "Bearings & Expansion Joints",
      code: "HW-02-JNT",
      description: "Elastomeric or pot bearings, modular finger joints, and seismic restrainers",
      fieldset: "HW_BRG_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-02",
    },
    {
      id: "hw-03",
      name: "Drainage & Stormwater",
      code: "HW-03",
      description: "Storm sewer, culverts, ditches, and BMPs tied to hydrology models",
      fieldset: "HW_DR_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "hw-03-cul",
      name: "Culverts",
      code: "HW-03-CUL",
      description: "CMP, concrete box, or arch culverts with inlet / outlet protection",
      fieldset: "HW_DR_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-03",
    },
    {
      id: "hw-03-int",
      name: "Storm Inlets & Conveyance",
      code: "HW-03-INT",
      description: "Curb inlets, junction structures, and trunk lines to outfall",
      fieldset: "HW_DR_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-03",
    },
    {
      id: "hw-04",
      name: "ITS & Traffic Systems",
      code: "HW-04",
      description: "Signals, detection, DMS, and field cabinets on fiber or wireless backhaul",
      fieldset: "HW_ITS_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "hw-04-sig",
      name: "Traffic Signals",
      code: "HW-04-SIG",
      description: "Controllers, heads, detection loops, and battery backup for isolated or coordinated corridors",
      fieldset: "HW_ITS_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-04",
    },
    {
      id: "hw-04-vms",
      name: "Variable Message Signs",
      code: "HW-04-VMS",
      description: "Full-matrix or limited-text DMS with NTCIP compliance and pixel diagnostics",
      fieldset: "HW_ITS_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-04",
    },
    {
      id: "hw-04-cam",
      name: "CCTV & Vehicle Detection",
      code: "HW-04-CAM",
      description: "Pan-tilt-zoom cameras, AVI readers, and wrong-way detection",
      fieldset: "HW_ITS_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-04",
    },
    {
      id: "hw-05",
      name: "Lighting & Electrical",
      code: "HW-05",
      description: "High-mast and conventional roadway lighting with service cabinets and metering",
      fieldset: "HW_EL_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "hw-05-lgt",
      name: "Highway Lighting",
      code: "HW-05-LGT",
      description: "LED or HPS luminaires, photometric zones, and photocontrol schedules",
      fieldset: "HW_EL_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-05",
    },
    {
      id: "hw-05-pwr",
      name: "Electrical Service & Cabinets",
      code: "HW-05-PWR",
      description: "Pad-mounted service, disconnects, and ITS / lighting combiner cabinets",
      fieldset: "HW_EL_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-05",
    },
    {
      id: "hw-06",
      name: "Safety & Barriers",
      code: "HW-06",
      description: "Longitudinal barriers, end treatments, and crash cushions per MASH",
      fieldset: "HW_SA_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "hw-06-grd",
      name: "Guardrail & Cable Barrier",
      code: "HW-06-GRD",
      description: "W-beam, thrie-beam, or cable median barrier with post spacing and splice locations",
      fieldset: "HW_SA_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-06",
    },
    {
      id: "hw-06-att",
      name: "Crash Cushions & End Treatments",
      code: "HW-06-ATT",
      description: "QuadGuard, REACT, or sand barrels; redirective vs. gating systems",
      fieldset: "HW_SA_Fieldset",
      statusGroup: "Procore Default",
      parentId: "hw-06",
    },
  ],
  "template-airport": [
    {
      id: "ap-01",
      name: "Runways & Airfield Pavement",
      code: "AP-01",
      description: "Runway, taxiway, and apron structural sections with FAA pavement management data",
      fieldset: "AP_PAV_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "ap-01-rwy",
      name: "Runway Pavement",
      code: "AP-01-RWY",
      description: "PCN / ACN tracking, grooving, rubber removal, and friction testing",
      fieldset: "AP_PAV_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-01",
    },
    {
      id: "ap-01-twy",
      name: "Taxiway & Apron Pavement",
      code: "AP-01-TWY",
      description: "Lead-in lines, blast pads, and cargo apron heavy-load sections",
      fieldset: "AP_PAV_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-01",
    },
    {
      id: "ap-02",
      name: "Airfield Lighting",
      code: "AP-02",
      description: "Approach, runway, and taxiway lighting circuits per AC 150/5340-1",
      fieldset: "AP_AFL_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "ap-02-als",
      name: "Approach & ALS Systems",
      code: "AP-02-ALS",
      description: "MALSR, ALSF, VASI / PAPI, and constant-current regulators",
      fieldset: "AP_AFL_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-02",
    },
    {
      id: "ap-02-rel",
      name: "Runway Edge & Taxiway Lighting",
      code: "AP-02-REL",
      description: "HIRL / MIRL, taxiway edge, runway guard lights, and sign illumination",
      fieldset: "AP_AFL_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-02",
    },
    {
      id: "ap-07",
      name: "NAVAIDS & Weather Systems",
      code: "AP-07",
      description: "ILS, approach aids, DME/TACAN, and AWOS / windshear sensors per FAA orders",
      fieldset: "AP_NAV_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "ap-07-ils",
      name: "ILS / Localizer & Glideslope",
      code: "AP-07-ILS",
      description: "Localizer, glide path, marker beacons, and critical area monitoring",
      fieldset: "AP_NAV_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-07",
    },
    {
      id: "ap-07-dme",
      name: "DME / TACAN & Approach Aids",
      code: "AP-07-DME",
      description: "Distance equipment, VOR co-sited aids, and RNAV ground infrastructure",
      fieldset: "AP_NAV_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-07",
    },
    {
      id: "ap-07-met",
      name: "AWOS / ASOS & Windshear",
      code: "AP-07-MET",
      description: "Automated weather, LLWAS / TDWR interfaces, and RVR sensors",
      fieldset: "AP_NAV_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-07",
    },
    {
      id: "ap-03",
      name: "Baggage Handling",
      code: "AP-03",
      description: "Outbound and inbound BHS with PLC zones and sortation controls",
      fieldset: "AP_BHS_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "ap-03-cnv",
      name: "BHS Conveyors & Transfers",
      code: "AP-03-CNV",
      description: "Tilt trays, power curves, and make-up after check-in",
      fieldset: "AP_BHS_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-03",
    },
    {
      id: "ap-03-srt",
      name: "Sortation & Make-up",
      code: "AP-03-SRT",
      description: "HS sort, inbound claim devices, and oversize handling",
      fieldset: "AP_BHS_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-03",
    },
    {
      id: "ap-04",
      name: "Terminal Building Systems",
      code: "AP-04",
      description: "Large-scale terminal HVAC and passenger boarding bridges",
      fieldset: "AP_TRM_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "ap-04-hva",
      name: "Terminal HVAC",
      code: "AP-04-HVA",
      description: "Central plants, AHUs, and smoke control integration for concourses",
      fieldset: "AP_TRM_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-04",
    },
    {
      id: "ap-04-jbr",
      name: "Passenger Boarding Bridges",
      code: "AP-04-JBR",
      description: "Apron-drive or radial bridges with 400 Hz and PCA dock connections",
      fieldset: "AP_TRM_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-04",
    },
    {
      id: "ap-05",
      name: "Ground Support & Fuel",
      code: "AP-05",
      description: "Hydrant fueling, GPU, and pre-conditioned air for gate and hardstand operations",
      fieldset: "AP_GSE_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "ap-05-fue",
      name: "Aircraft Fueling & Hydrants",
      code: "AP-05-FUE",
      description: "Fuel pits, isolation valves, filter vessels, and emergency shutoff",
      fieldset: "AP_GSE_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-05",
    },
    {
      id: "ap-05-gpu",
      name: "Ground Power & PCA",
      code: "AP-05-GPU",
      description: "400 Hz solid-state GPU, 28 VDC, and pre-conditioned air units",
      fieldset: "AP_GSE_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-05",
    },
    {
      id: "ap-06",
      name: "Security & Perimeter",
      code: "AP-06",
      description: "AOA fencing, vehicle gates, and credentialing systems",
      fieldset: "AP_SEC_Fieldset",
      statusGroup: "Procore Default",
      hasSubtypes: true,
    },
    {
      id: "ap-06-fen",
      name: "Perimeter Fencing & Gates",
      code: "AP-06-FEN",
      description: "Intrusion-resistant fence lines, vehicle sally ports, and wildlife gates",
      fieldset: "AP_SEC_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-06",
    },
    {
      id: "ap-06-acs",
      name: "Access Control & Badging",
      code: "AP-06-ACS",
      description: "PACS readers, turnstiles, and SIDA / escort policy integration",
      fieldset: "AP_SEC_Fieldset",
      statusGroup: "Procore Default",
      parentId: "ap-06",
    },
  ],
}

const TEMPLATE_FIELDSETS_DATACENTER: Record<string, FieldsetData> = {
  ...DEFAULT_FIELDSETS,
  "23_Fieldset": {
    name: "23_Fieldset",
    sections: [
      { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
      { name: "Mechanical Data", fields: ["Design Flow Rate", "Operating Set Point", "BMS Integration Protocol"] },
    ]
  },
  "23-GEN_Fieldset": {
    name: "23-GEN_Fieldset",
    sections: [
      { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
      { name: "Mechanical Data", fields: ["Design Flow Rate", "Operating Set Point", "BMS Integration Protocol"] },
      { name: "Technical Details", fields: ["Fluid Type (Glycol/Water)", "Max Working Pressure", "Dry/Wet Weight"] },
    ]
  },
  "23-AIR_Fieldset": {
    name: "23-AIR_Fieldset",
    sections: [
      { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
      { name: "Cooling Data", fields: ["Cooling Capacity (kW)", "Airflow (CFM)", "Supply Air Temp"] },
      { name: "Operational", fields: ["Redundancy Level", "ASHRAE Compliance", "Monitoring Integration"] },
    ]
  },
  "23-PMP_Fieldset": {
    name: "23-PMP_Fieldset",
    sections: [
      { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
      { name: "Pump Data", fields: ["Flow Rate (GPM)", "Head Pressure (ft)", "Motor HP"] },
      { name: "Control", fields: ["VFD Controlled", "Redundancy Configuration", "Alarm Set Points"] },
    ]
  },
  "26_Fieldset": {
    name: "26_Fieldset",
    sections: [
      { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
      { name: "Power Specifications", fields: ["Voltage Rating", "Amperage", "Power Factor"] },
    ]
  },
  "26-PWR_Fieldset": {
    name: "26-PWR_Fieldset",
    sections: [
      { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
      { name: "Power Specifications", fields: ["Voltage Rating", "Amperage", "Power Factor"] },
      { name: "Distribution Details", fields: ["Number of Circuits", "Load Capacity (kW)", "Metering Integration"] },
    ]
  },
  "26-UPS_Fieldset": {
    name: "26-UPS_Fieldset",
    sections: [
      { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
      { name: "UPS Specifications", fields: ["Capacity (kVA)", "Runtime (Minutes)", "Efficiency Rating"] },
      { name: "Battery Details", fields: ["Battery Type", "String Count", "Expected Life (Years)"] },
    ]
  },
  "26-GEN_Fieldset": {
    name: "26-GEN_Fieldset",
    sections: [
      { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
      { name: "Generator Specifications", fields: ["Capacity (kW)", "Voltage Output", "Fuel Type"] },
      { name: "Operational Details", fields: ["Fuel Tank Capacity", "Load Bank Test Date", "Runtime Hours"] },
    ]
  },
}

// Pre-populated fieldsets for each template
const TEMPLATE_FIELDSETS: Record<string, Record<string, FieldsetData>> = {
  "template-default": {
    ...DEFAULT_FIELDSETS,
  },
  "template-residential": {
    ...DEFAULT_FIELDSETS,
    "01_Fieldset": {
      name: "01_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Site Details", fields: ["Installation Date", "Warranty Expiration", "Service Contractor"] },
      ]
    },
    "22_Fieldset": {
      name: "22_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Technical Specifications", fields: ["Flow Rate (GPM)", "Pressure Rating (PSI)", "Pipe Material"] },
      ]
    },
    "22-DOM_Fieldset": {
      name: "22-DOM_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Technical Specifications", fields: ["Flow Rate (GPM)", "Pressure Rating (PSI)", "Pipe Material"] },
        { name: "Equipment Details", fields: ["Tank Capacity (Gallons)", "Recovery Rate", "Energy Efficiency Rating"] },
      ]
    },
    "23_Fieldset": {
      name: "23_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Performance Data", fields: ["Cooling Capacity (BTU)", "Heating Capacity (BTU)", "SEER Rating"] },
      ]
    },
    "23-HVA_Fieldset": {
      name: "23-HVA_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Performance Data", fields: ["Cooling Capacity (BTU)", "Heating Capacity (BTU)", "SEER Rating"] },
        { name: "Maintenance", fields: ["Last Service Date", "Filter Size", "Refrigerant Type"] },
      ]
    },
    "26_Fieldset": {
      name: "26_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Electrical Specifications", fields: ["Voltage Rating", "Amperage", "Phase Configuration"] },
      ]
    },
    "26-PWR_Fieldset": {
      name: "26-PWR_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Electrical Specifications", fields: ["Voltage Rating", "Amperage", "Phase Configuration"] },
        { name: "Safety Information", fields: ["Arc Flash Rating", "PPE Requirements", "Last Inspection Date"] },
      ]
    },
    "28_Fieldset": {
      name: "28_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Safety Details", fields: ["Inspection Due Date", "Code Compliance", "Testing Schedule"] },
      ]
    },
    "28-FIR_Fieldset": {
      name: "28-FIR_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Safety Details", fields: ["Inspection Due Date", "Code Compliance", "Testing Schedule"] },
        { name: "System Details", fields: ["Coverage Area (sq ft)", "Flow Rate (GPM)", "Alarm Integration"] },
      ]
    },
    "14_Fieldset": {
      name: "14_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Technical Specifications", fields: ["Load Capacity (lbs)", "Speed (FPM)", "Number of Stops"] },
      ]
    },
    "14-ELV_Fieldset": {
      name: "14-ELV_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Technical Specifications", fields: ["Load Capacity (lbs)", "Speed (FPM)", "Number of Stops"] },
        { name: "Equipment Details", fields: ["Controller Type", "Motor Type", "Door Operator"] },
      ]
    },
  },
  "template-commercial": {
    ...DEFAULT_FIELDSETS,
    "01_Fieldset": {
      name: "01_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Site Details", fields: ["Installation Date", "Service Contract", "Inspection Schedule"] },
      ]
    },
    "01-PRK_Fieldset": {
      name: "01-PRK_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Parking System Details", fields: ["Capacity", "Operating Hours", "Revenue System Integration"] },
      ]
    },
    "14_Fieldset": {
      name: "14_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Technical Specifications", fields: ["Load Capacity (lbs)", "Speed (FPM)", "Number of Stops"] },
      ]
    },
    "14-ELV_Fieldset": {
      name: "14-ELV_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Technical Specifications", fields: ["Load Capacity (lbs)", "Speed (FPM)", "Number of Stops"] },
        { name: "Equipment Details", fields: ["Controller Type", "Motor Type", "Door Operator"] },
      ]
    },
    "21_Fieldset": {
      name: "21_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Fire Suppression Details", fields: ["Coverage Area", "Inspection Date", "Compliance Status"] },
      ]
    },
    "21-SPR_Fieldset": {
      name: "21-SPR_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Fire Suppression Details", fields: ["Coverage Area", "Inspection Date", "Compliance Status"] },
        { name: "Sprinkler Details", fields: ["Flow Rate (GPM)", "Pressure Rating", "Head Type"] },
      ]
    },
    "23_Fieldset": {
      name: "23_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Central Plant Data", fields: ["Design Capacity (Tons)", "Current Load", "Efficiency (kW/Ton)"] },
      ]
    },
    "23-CHL_Fieldset": {
      name: "23-CHL_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Central Plant Data", fields: ["Design Capacity (Tons)", "Current Load", "Efficiency (kW/Ton)"] },
        { name: "Chiller Specifications", fields: ["Refrigerant Type", "Refrigerant Charge (lbs)", "Compressor Type"] },
      ]
    },
    "26_Fieldset": {
      name: "26_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Power Information", fields: ["Connected Load (kVA)", "Demand (kW)", "Power Factor"] },
      ]
    },
    "26-GEN_Fieldset": {
      name: "26-GEN_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Power Information", fields: ["Connected Load (kVA)", "Demand (kW)", "Power Factor"] },
        { name: "Generator Data", fields: ["Fuel Type", "Tank Capacity (Gallons)", "Load Bank Test Date"] },
      ]
    },
  },
  "template-healthcare": {
    ...DEFAULT_FIELDSETS,
    "11_Fieldset": {
      name: "11_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Compliance Data", fields: ["Device Serial Number", "FDA Registration", "Calibration Due Date"] },
      ]
    },
    "11-IMG_Fieldset": {
      name: "11-IMG_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Compliance Data", fields: ["Device Serial Number", "FDA Registration", "Calibration Due Date"] },
        { name: "Technical Specifications", fields: ["Field Strength (Tesla)", "Helium Level", "Quench Pipe Status"] },
      ]
    },
    "22_Fieldset": {
      name: "22_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Medical Gas Details", fields: ["Gas Type", "Pressure Rating", "Flow Capacity"] },
      ]
    },
    "22-GAS_Fieldset": {
      name: "22-GAS_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Medical Gas Details", fields: ["Gas Type", "Pressure Rating", "Flow Capacity"] },
        { name: "System Parameters", fields: ["Operating Pressure (PSI)", "Purity Level", "Alarm Thresholds"] },
      ]
    },
    "23_Fieldset": {
      name: "23_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "HVAC Performance", fields: ["Air Changes Per Hour", "Pressure Differential", "Filter Type"] },
      ]
    },
    "23-AHU_Fieldset": {
      name: "23-AHU_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "HVAC Performance", fields: ["Air Changes Per Hour", "Pressure Differential", "Filter Type"] },
        { name: "Infection Control", fields: ["HEPA Efficiency", "UV Lamp Hours", "Particle Count"] },
      ]
    },
    "26_Fieldset": {
      name: "26_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Critical Power", fields: ["Voltage Rating", "Load Classification", "Transfer Time"] },
      ]
    },
    "26-CRT_Fieldset": {
      name: "26-CRT_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Critical Power", fields: ["Voltage Rating", "Load Classification", "Transfer Time"] },
        { name: "Backup Details", fields: ["Runtime (Hours)", "Fuel Capacity", "Load Test Date"] },
      ]
    },
    "28_Fieldset": {
      name: "28_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Life Safety", fields: ["Inspection Date", "Code Compliance", "Testing Schedule"] },
      ]
    },
    "28-NRS_Fieldset": {
      name: "28-NRS_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Life Safety", fields: ["Inspection Date", "Code Compliance", "Testing Schedule"] },
        { name: "System Configuration", fields: ["Zone Assignment", "Response Protocol", "Integration Status"] },
      ]
    },
    "14_Fieldset": {
      name: "14_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Code & Accessibility", fields: ["Stretcher Compliance (IGBC)", "Firefighters’ Service", "Seismic / OSHPD Tier"] },
      ]
    },
    "14-ELV_Fieldset": {
      name: "14-ELV_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Code & Accessibility", fields: ["Stretcher Compliance (IGBC)", "Firefighters’ Service", "Seismic / OSHPD Tier"] },
        { name: "Clinical Circulation", fields: ["Car Size (in)", "Door Hold / Card Reader", "Emergency Power Bus"] },
      ]
    },
  },
  "template-industrial": {
    ...DEFAULT_FIELDSETS,
    "11_Fieldset": {
      name: "11_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Production Data", fields: ["Throughput Rate", "Cycle Time", "OEE Target"] },
      ]
    },
    "11-PRD_Fieldset": {
      name: "11-PRD_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Production Data", fields: ["Throughput Rate", "Cycle Time", "OEE Target"] },
        { name: "Machine Parameters", fields: ["Spindle Speed Range", "Axis Travel", "Tool Capacity"] },
      ]
    },
    "22_Fieldset": {
      name: "22_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Process Water", fields: ["Water Type", "Flow Rate", "Treatment Method"] },
      ]
    },
    "22-PRC_Fieldset": {
      name: "22-PRC_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Process Water", fields: ["Water Type", "Flow Rate", "Treatment Method"] },
        { name: "Water Quality", fields: ["Conductivity (uS/cm)", "pH Range", "TOC Levels"] },
      ]
    },
    "23_Fieldset": {
      name: "23_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Ventilation Data", fields: ["Air Flow (CFM)", "Static Pressure", "Motor HP"] },
      ]
    },
    "23-VNT_Fieldset": {
      name: "23-VNT_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Ventilation Data", fields: ["Air Flow (CFM)", "Static Pressure", "Motor HP"] },
        { name: "Air Quality", fields: ["Capture Velocity (FPM)", "Duct Static Pressure", "LEL Monitoring"] },
      ]
    },
    "26_Fieldset": {
      name: "26_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Electrical Specifications", fields: ["Voltage Rating", "Amperage", "Phase Configuration"] },
      ]
    },
    "26-MCC_Fieldset": {
      name: "26-MCC_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Electrical Specifications", fields: ["Voltage Rating", "Amperage", "Phase Configuration"] },
        { name: "Motor Control", fields: ["Motor HP", "Full Load Amps", "Drive Type"] },
      ]
    },
    "40_Fieldset": {
      name: "40_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Control System", fields: ["PLC Model", "I/O Count", "Network Protocol"] },
      ]
    },
    "40-PLC_Fieldset": {
      name: "40-PLC_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Control System", fields: ["PLC Model", "I/O Count", "Network Protocol"] },
        { name: "Programming Details", fields: ["Software Version", "Backup Date", "Logic Documentation"] },
      ]
    },
  },
  "template-datacenter-aws": TEMPLATE_FIELDSETS_DATACENTER,
  "template-datacenter-meta": TEMPLATE_FIELDSETS_DATACENTER,
  "template-datacenter-oracle": TEMPLATE_FIELDSETS_DATACENTER,
  "template-windfarm": {
    ...DEFAULT_FIELDSETS,
    "WF_TURB_Fieldset": {
      name: "WF_TURB_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Turbine Identification",
          fields: [
            "WTG Number",
            "OEM / Manufacturer",
            "Platform Model",
            "Hub Height (m)",
            "Rotor Diameter (m)",
            "Rated Power (MW)",
            "IEC Wind Class",
            "Commissioning Date",
          ],
        },
      ],
    },
    "WF_NAC_Fieldset": {
      name: "WF_NAC_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Drivetrain & Condition",
          fields: [
            "Generator Type (DFIG / FC)",
            "Rated Speed (rpm)",
            "Gearbox Ratio",
            "Gearbox Oil ISO Grade",
            "Main Bearing Temp Alarm (°C)",
            "Generator Winding Temp Alarm (°C)",
            "CMS Vibration (ISO 10816-21)",
            "Last Oil Analysis Date",
          ],
        },
      ],
    },
    "WF_ROT_Fieldset": {
      name: "WF_ROT_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Rotor & Blades",
          fields: [
            "Blade Length (m)",
            "Pitch System (Hydraulic / E-motor)",
            "Lightning Protection Zones",
            "Leading Edge Erosion Inspection",
            "Blade Mass (kg)",
            "Ice Detection / De-icing",
          ],
        },
      ],
    },
    "WF_TWR_Fieldset": {
      name: "WF_TWR_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Structure & Foundation",
          fields: [
            "Tower Type (Steel Tubular / Hybrid)",
            "Number of Sections",
            "Foundation Type (Spread / Grouted / Monopile)",
            "Anchor Bolt Torque Check Date",
            "Aviation Lighting (L-864 / L-865)",
            "Marine Growth / CP (Offshore)",
          ],
        },
      ],
    },
    "WF_PWR_Fieldset": {
      name: "WF_PWR_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Power Conversion",
          fields: [
            "Rated Voltage (V)",
            "Rated Current (A)",
            "Grid Frequency (Hz)",
            "Power Factor Target",
            "Harmonic Filter Type",
            "Converter Cooling (Air / Water)",
            "LVRT / HVRT Test Status",
          ],
        },
      ],
    },
    "WF_COL_Fieldset": {
      name: "WF_COL_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Medium-Voltage Collection",
          fields: [
            "Nominal Voltage (kV)",
            "Cable Type (XLPE / EPR)",
            "Circuit Length (km)",
            "Joint / Termination Count",
            "Sheath Voltage Limiter",
            "Grounding Resistance (Ω)",
            "PD Monitoring (Yes / No)",
          ],
        },
      ],
    },
    "WF_SUB_Fieldset": {
      name: "WF_SUB_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Substation & Grid",
          fields: [
            "Substation Name / ID",
            "Interconnection Voltage (kV)",
            "Breaker Interrupting Rating (kA)",
            "Protection Relay Scheme",
            "Metering Point ID",
            "Grid Code (e.g. FERC 661 / EU NC)",
            "Scheduled Maintenance Outage Window",
          ],
        },
      ],
    },
    "WF_BOP_Fieldset": {
      name: "WF_BOP_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Operations & Monitoring",
          fields: [
            "Met Mast Height (m)",
            "Reference Wind Speed (m/s)",
            "SCADA Protocol (OPC UA / IEC 61850)",
            "Remote Operations Center",
            "UPS Backup Runtime (min)",
            "Spare Parts Critical List",
          ],
        },
      ],
    },
    "WF_CIV_Fieldset": {
      name: "WF_CIV_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Civil & Environmental",
          fields: [
            "Road Surface Type",
            "Design Axle Load (t)",
            "Stormwater BMP Reference",
            "Erosion Control Inspection Date",
            "Wetland / Avian Mitigation Notes",
          ],
        },
      ],
    },
  },
  "template-highways": {
    ...DEFAULT_FIELDSETS,
    "HW_PAV_Fieldset": {
      name: "HW_PAV_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Route & Section",
          fields: [
            "Route / Corridor ID",
            "Milepost From",
            "Milepost To",
            "Direction (NB/SB/EB/WB)",
            "Lane Miles",
            "Functional Class (Interstate / Arterial)",
          ],
        },
        {
          name: "Pavement Performance",
          fields: [
            "Surface Type (HMA / WMA / JPCP)",
            "IRI (in/mi)",
            "PCI / Pavement Condition",
            "Last Mill & Overlay Date",
            "Design ESALs (million)",
            "Friction / SN Test Date",
          ],
        },
      ],
    },
    "HW_BRG_Fieldset": {
      name: "HW_BRG_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Structure Identification",
          fields: [
            "NBI Structure Number",
            "Bridge Name",
            "Feature Crossed",
            "Owner Agency",
            "Inspection Frequency (mo)",
            "Next NBIS Inspection Due",
          ],
        },
        {
          name: "Capacity & Condition",
          fields: [
            "Operating Load Rating (tons)",
            "Posting Required (Y/N)",
            "Deck Material",
            "Superstructure Type",
            "Scour Countermeasure (Y/N)",
            "Fracture-Critical Member (Y/N)",
          ],
        },
      ],
    },
    "HW_DR_Fieldset": {
      name: "HW_DR_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Hydrology & Hydraulics",
          fields: [
            "Design Storm (yr return)",
            "Drainage Area (ac)",
            "Peak Flow (cfs)",
            "Hydrology Model Reference",
            "Outfall ID / Receiving Water",
            "NPDES Permit Cross-Reference",
          ],
        },
        {
          name: "Structure Details",
          fields: [
            "Structure Type (Culvert / Inlet / Manhole)",
            "Material (CMP / RCP / Box)",
            "Rise x Span or Diameter (in)",
            "Invert Elevation (ft)",
            "Embedment / Bedding Class",
          ],
        },
      ],
    },
    "HW_ITS_Fieldset": {
      name: "HW_ITS_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Field Equipment",
          fields: [
            "Device Type (Signal / DMS / CCTV / AVI)",
            "Cabinet / Comms ID",
            "NTCIP Object ID",
            "Power Source (Utility / Solar)",
            "UPS / Battery Runtime (min)",
            "Firmware Version",
          ],
        },
        {
          name: "Communications & Maintenance",
          fields: [
            "Backhaul (Fiber / Wireless)",
            "IP Address / VLAN",
            "Conflict Monitor Test Date",
            "Agency Maintenance Contract ID",
            "Mean Time Between Failure (hrs)",
          ],
        },
      ],
    },
    "HW_EL_Fieldset": {
      name: "HW_EL_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Electrical Service",
          fields: [
            "Service Voltage (V)",
            "Utility Account / Meter ID",
            "Cabinet ID",
            "Grounding Resistance Test (Ω)",
            "Arc Flash Label Date",
          ],
        },
        {
          name: "Lighting Performance",
          fields: [
            "Luminaire Type (LED / HPS)",
            "Mounting (High-mast / Mast-arm)",
            "Average Maintained Illuminance (fc)",
            "BUG Rating",
            "Dimming / Adaptive Control",
            "Annual Energy (kWh)",
          ],
        },
      ],
    },
    "HW_SA_Fieldset": {
      name: "HW_SA_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Barrier System",
          fields: [
            "Test Level (TL-1 – TL-6)",
            "System Type (W-beam / Cable / Concrete)",
            "Post Spacing (ft)",
            "Height (in)",
            "End Treatment Type",
            "Reflectivity Sheeting Grade",
          ],
        },
        {
          name: "Crash Cushions",
          fields: [
            "Manufacturer / Model",
            "Redirective vs. Gating",
            "Anchor Type",
            "Sand Barrel Count",
            "Last Impact / Reset Date",
          ],
        },
      ],
    },
  },
  "template-airport": {
    ...DEFAULT_FIELDSETS,
    "AP_PAV_Fieldset": {
      name: "AP_PAV_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Airfield Section",
          fields: [
            "Section Designator (e.g. RWY 09L/27R)",
            "Pavement Type (AC / PCC)",
            "PCN / Structural Number",
            "Subgrade Modulus (psi)",
            "Grooved Surface (Y/N)",
            "Last Rubber Removal Date",
          ],
        },
        {
          name: "Operations & Compliance",
          fields: [
            "ACN vs. Critical Aircraft",
            "Friction Mu (wet / dry)",
            "Last FCIP / PCI Survey",
            "NOTAM / Closure History Ref",
            "Snow Removal Priority Tier",
          ],
        },
      ],
    },
    "AP_AFL_Fieldset": {
      name: "AP_AFL_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Circuit & Regulator",
          fields: [
            "Circuit ID / Series",
            "CCR Type & kVA",
            "Series Current (A)",
            "Insulation Resistance Test (MΩ)",
            "Photometric Survey Due Date",
          ],
        },
        {
          name: "FAA Standards",
          fields: [
            "Light Type (L-850 / L-862 / etc.)",
            "Color (White / Red / Yellow / Blue)",
            "Frangible Mounting (Y/N)",
            "ILS Critical Area Impact",
            "L-824 Interface Test Date",
          ],
        },
      ],
    },
    "AP_NAV_Fieldset": {
      name: "AP_NAV_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "FAA Nav Aid",
          fields: [
            "Facility ID / Designator",
            "Frequency (MHz)",
            "Monitor / Remote Status",
            "Flight Check Due Date",
            "Critical Area / ILS SSM Integration",
          ],
        },
        {
          name: "Sustainment",
          fields: [
            "OEM / Maintainer Contract",
            "Spares Kit Ref",
            "Last FAR Part 171 Inspection",
            "NOTAM Coordination Contact",
          ],
        },
      ],
    },
    "AP_BHS_Fieldset": {
      name: "AP_BHS_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "System Integration",
          fields: [
            "PLC / Sort Zone ID",
            "Belt Speed (fpm)",
            "Drive Motor HP",
            "Sort Destination Count",
            "Baggage IT Interface (BSM)",
          ],
        },
        {
          name: "Maintenance",
          fields: [
            "OEM / Integrator",
            "Critical Spares List Ref",
            "Annual Downtime (hrs)",
            "Contract Maintenance ID",
            "Last BHS Safety Assessment",
          ],
        },
      ],
    },
    "AP_TRM_Fieldset": {
      name: "AP_TRM_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Terminal HVAC",
          fields: [
            "Building Zone / Concourse",
            "Cooling Tonnage",
            "Supply Airflow (CFM)",
            "Chilled Water ΔT (°F)",
            "ASHRAE Ventilation Zone",
            "LEED / Energy Benchmark",
          ],
        },
        {
          name: "Passenger Boarding Bridge",
          fields: [
            "Gate / Stand Number",
            "Bridge MARS / Docking System",
            "Reach / Slope Limits (deg)",
            "400 Hz Interlock",
            "PCA Capacity (tons cooling)",
            "Aircraft Compatibility (Group III–V)",
          ],
        },
      ],
    },
    "AP_GSE_Fieldset": {
      name: "AP_GSE_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Fuel System",
          fields: [
            "Hydrant Pit ID",
            "Operating Pressure (psi)",
            "Filter Vessel Model",
            "Water Separator Test Date",
            "Emergency Fuel Shutoff Zone",
          ],
        },
        {
          name: "Ground Power & PCA",
          fields: [
            "GPU Rating (kVA)",
            "Output Voltage / Frequency (115/200 V 400 Hz)",
            "Cable Retractor Type",
            "PCA CFM @ Gate",
            "ITW GSE Safety Interlocks",
          ],
        },
      ],
    },
    "AP_SEC_Fieldset": {
      name: "AP_SEC_Fieldset",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        {
          name: "Perimeter",
          fields: [
            "AOA Zone",
            "Fence Height (ft)",
            "Anti-climb / Intrusion Detection",
            "Vehicle Gate Type (Sally Port)",
            "Camera Coverage ID",
          ],
        },
        {
          name: "Access Control",
          fields: [
            "PACS Panel ID",
            "Reader Technology (PIV / Prox)",
            "SIDA / Escort Policy",
            "Integration with TSA / Airport Ops",
            "Last Penetration Test Date",
          ],
        },
      ],
    },
  },
}

/** Deep clone preset asset types + fieldsets for a template id (used by Copy from). */
export function getTemplateSourceData(templateId: string): {
  assetTypes: AssetType[]
  fieldsets: Record<string, FieldsetData>
} {
  const rawTypes = TEMPLATE_ASSET_TYPES[templateId] ?? []
  const rawFs = TEMPLATE_FIELDSETS[templateId] ?? DEFAULT_FIELDSETS
  const assetTypes: AssetType[] = JSON.parse(JSON.stringify(rawTypes))
  const fieldsets: Record<string, FieldsetData> = JSON.parse(JSON.stringify(rawFs))
  for (const key of Object.keys(fieldsets)) {
    const fd = fieldsets[key]
    if (fd) {
      const namingKey =
        templateId === "template-healthcare" && key.startsWith("11") && !key.includes("IMG")
          ? `HOSP_${key}`
          : key
      fd.name = buildMultiClientFieldsetDisplayName(namingKey, FIELDSET_DISPLAY_PRIMARY_CLIENT)
    }
  }
  return { assetTypes, fieldsets }
}

export type TemplateAssetConfig = {
  assetTypes: AssetType[]
  fieldsets: Record<string, FieldsetData>
  /**
   * Same asset types and fieldset **keys** for every client; each client has its own `FieldsetData` (labels, sections).
   * When absent, only `fieldsets` applies.
   */
  fieldsetsByClient?: Record<string, Record<string, FieldsetData>>
  /**
   * Company level asset settings: project id → fieldset object key. Omitted ids use **Procore Default**.
   */
  projectFieldsetKeys?: Record<string, string>
  /**
   * Company level: fieldset object key → template ids that reference this fieldset in catalog admin.
   */
  fieldsetTemplateAssignments?: Record<string, string[]>
  /**
   * Company level: asset type id → template ids that reference this type in catalog admin.
   */
  assetTypeTemplateAssignments?: Record<string, string[]>
}

/** New stable ids for copied hierarchy (parentId remapped). */
export function remapAssetTypesWithNewIds(types: AssetType[]): AssetType[] {
  if (types.length === 0) return []
  const idMap = new Map<string, string>()
  const prefix = `cf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  types.forEach((t, i) => {
    const safe = String(t.code).replace(/[^a-zA-Z0-9-_]/g, "")
    idMap.set(t.id, `${prefix}-${i}-${safe}`)
  })
  return types.map((t) => ({
    ...t,
    id: idMap.get(t.id)!,
    parentId: t.parentId ? idMap.get(t.parentId) : undefined,
  }))
}

/** Include ancestors so parentId chain is valid. */
function filterAssetTypesWithAncestors(all: AssetType[], selectedIds: Set<string>): AssetType[] {
  const include = new Set<string>()
  for (const id of selectedIds) {
    let cur: AssetType | undefined = all.find((a) => a.id === id)
    while (cur) {
      include.add(cur.id)
      const pid = cur.parentId
      cur = pid ? all.find((a) => a.id === pid) : undefined
    }
  }
  return all.filter((a) => include.has(a.id))
}

function fieldsetKeysForAssetTypes(types: AssetType[]): Set<string> {
  const keys = new Set<string>()
  keys.add("Procore Default")
  types.forEach((t) => {
    if (t.fieldset) keys.add(t.fieldset)
  })
  return keys
}

function pickFieldsetsByKeys(
  src: Record<string, FieldsetData>,
  keys: Set<string>
): Record<string, FieldsetData> {
  const out: Record<string, FieldsetData> = {}
  for (const k of Object.keys(src)) {
    if (keys.has(k)) {
      out[k] = JSON.parse(JSON.stringify(src[k])) as FieldsetData
    }
  }
  return out
}

function pickFieldsetsByKeysForAllClients(
  byClient: Record<string, Record<string, FieldsetData>>,
  keys: Set<string>,
  clients: readonly string[]
): Record<string, Record<string, FieldsetData>> {
  const out: Record<string, Record<string, FieldsetData>> = {}
  for (const c of clients) {
    out[c] = pickFieldsetsByKeys(byClient[c] ?? {}, keys)
  }
  return out
}

/** Source project → fieldset key rows where the key is part of this import. */
function pickProjectFieldsetKeysForImportedFieldsets(
  src: Record<string, string> | undefined,
  importedFieldsetKeys: Set<string>
): Record<string, string> {
  if (!src) return {}
  const out: Record<string, string> = {}
  for (const [projectId, key] of Object.entries(src)) {
    if (importedFieldsetKeys.has(key)) out[projectId] = key
  }
  return out
}

/** Same code + name (case-insensitive trim) identifies a duplicate asset type for Copy from. */
function assetTypeMatchKey(t: AssetType): string {
  return `${String(t.code).trim().toLowerCase()}|${String(t.name).trim().toLowerCase()}`
}

/**
 * Remove types that match incoming keys and any descendants (so parent replace does not leave orphans).
 */
function removeAssetTypesReplacedByIncoming(
  prev: AssetType[],
  incomingKeys: Set<string>
): AssetType[] {
  const removeIds = new Set<string>()
  for (const t of prev) {
    if (incomingKeys.has(assetTypeMatchKey(t))) {
      removeIds.add(t.id)
    }
  }
  let growing = true
  while (growing) {
    growing = false
    for (const t of prev) {
      if (t.parentId && removeIds.has(t.parentId) && !removeIds.has(t.id)) {
        removeIds.add(t.id)
        growing = true
      }
    }
  }
  return prev.filter((t) => !removeIds.has(t.id))
}

function cloneFieldsetSections(sections: { name: string; fields: string[] }[]) {
  return sections.map((s) => ({ name: s.name, fields: [...s.fields] }))
}

/** Merge fieldset definitions: union sections by name; union fields within a section. */
function mergeFieldsetRecords(
  prev: Record<string, FieldsetData>,
  incoming: Record<string, FieldsetData>
): Record<string, FieldsetData> {
  const out: Record<string, FieldsetData> = {}
  for (const k of new Set([...Object.keys(prev), ...Object.keys(incoming)])) {
    const a = prev[k]
    const b = incoming[k]
    if (!a && b) {
      out[k] = JSON.parse(JSON.stringify(b)) as FieldsetData
      continue
    }
    if (a && !b) {
      out[k] = JSON.parse(JSON.stringify(a)) as FieldsetData
      continue
    }
    if (a && b) {
      const mergedSections = cloneFieldsetSections(a.sections)
      for (const ns of b.sections) {
        const existing = mergedSections.find((s) => s.name === ns.name)
        if (existing) {
          for (const f of ns.fields) {
            if (!existing.fields.includes(f)) existing.fields.push(f)
          }
        } else {
          mergedSections.push({ name: ns.name, fields: [...ns.fields] })
        }
      }
      out[k] = { name: b.name || a.name, sections: mergedSections }
    }
  }
  return out
}

function mergeFieldsetsByClientMaps(
  prev: Record<string, Record<string, FieldsetData>> | undefined,
  incoming: Record<string, Record<string, FieldsetData>>,
  clients: readonly string[]
): Record<string, Record<string, FieldsetData>> {
  const out: Record<string, Record<string, FieldsetData>> = {}
  for (const c of clients) {
    out[c] = mergeFieldsetRecords(prev?.[c] ?? {}, incoming[c] ?? {})
  }
  return out
}

interface AssetTemplateDetailProps {
  template: AssetTemplate
  /** All templates (for Copy from source picker). */
  templates: AssetTemplate[]
  onBack: () => void
  onSave: (template: AssetTemplate) => void
  mode: "edit" | "view"
  templateConfig: TemplateAssetConfig
  onTemplateConfigChange: (updater: (prev: TemplateAssetConfig) => TemplateAssetConfig) => void
  resolveTemplateConfig: (templateId: string) => TemplateAssetConfig
  /**
   * When true, asset types and fieldset-changing flows are view-only; manage them under Asset settings.
   */
  catalogReadOnly?: boolean
  /** Company catalog (assignments determine which types/fieldsets appear when `catalogReadOnly`). */
  globalCatalog?: TemplateAssetConfig
}

export function AssetTemplateDetail({
  template,
  templates: allTemplates,
  onBack,
  onSave,
  mode,
  templateConfig,
  onTemplateConfigChange,
  resolveTemplateConfig,
  catalogReadOnly = false,
  globalCatalog,
}: AssetTemplateDetailProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const { assetTypes, fieldsets } = templateConfig
  /** One shared type tree; show AWS fieldset labels by default when per-client maps exist. */
  /** Merged flat map already unions all clients; use it when present. */
  const fieldsetsForUi = fieldsets

  const setAssetTypes = useCallback(
    (action: SetStateAction<AssetType[]>) => {
      onTemplateConfigChange((prev) => ({
        ...prev,
        assetTypes: typeof action === "function" ? action(prev.assetTypes) : action,
      }))
    },
    [onTemplateConfigChange]
  )

  const setFieldsets = useCallback(
    (action: SetStateAction<Record<string, FieldsetData>>) => {
      onTemplateConfigChange((prev) => ({
        ...prev,
        fieldsets: typeof action === "function" ? action(prev.fieldsets) : action,
      }))
    },
    [onTemplateConfigChange]
  )

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<AssetType | null>(null)
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [customFieldMappings, setCustomFieldMappings] = useState<CustomFieldMapping[]>([])

  const filteredAssetTypes = assetTypes.filter(
    (asset) =>
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleExportDeepHierarchyCsv = () => {
    const csv = buildDeepHierarchyClassificationCsv({
      assetTypes,
      fieldsets: fieldsetsForUi,
      customFieldMappings,
    })
    const normalized = csv.replace(/^\uFEFF/, "")
    const dataLines = normalized.split(/\r?\n/).filter((l) => l.trim())
    if (dataLines.length <= 1) {
      alert(
        "Nothing to export: add asset types with fieldsets (sections and fields), or switch to a template that includes them."
      )
      return
    }
    const safeName = template.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "template"
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Asset_Classification_Deep_Hierarchy_${safeName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCreateType = () => {
    setEditingAsset(null)
    setSheetOpen(true)
  }

  const handleEditType = (asset: AssetType) => {
    setEditingAsset(asset)
    setSheetOpen(true)
  }

  const handleSaveType = (data: {
    name: string
    code: string
    description: string
    isAssembly?: boolean
  }) => {
    if (editingAsset) {
      setAssetTypes((prev) =>
        prev.map((asset) =>
          asset.id === editingAsset.id
            ? { ...asset, ...data, isAssembly: data.isAssembly ?? false }
            : asset
        )
      )
    } else {
      const newAsset: AssetType = {
        id: String(Date.now()),
        name: data.name,
        code: data.code,
        description: data.description,
        fieldset: "Procore Default",
        statusGroup: "Procore Default",
        isAssembly: data.isAssembly ?? false,
      }
      setAssetTypes((prev) => [...prev, newAsset])
    }
    setSheetOpen(false)
    setEditingAsset(null)
  }

  const handleDeleteType = (id: string) => {
    setAssetTypes((prev) => prev.filter((asset) => asset.id !== id))
  }

  const handleAddSubtype = (parentId: string) => {
    const parent = assetTypes.find((a) => a.id === parentId)
    if (parent) {
      const newSubtype: AssetType = {
        id: `${parentId}-${Date.now()}`,
        name: `New Subtype`,
        code: `${parent.code}.`,
        description: "",
        fieldset: parent.fieldset,
        statusGroup: parent.statusGroup,
        parentId,
        isAssembly: false,
      }
      setAssetTypes((prev) =>
        prev.map((a) => (a.id === parentId ? { ...a, hasSubtypes: true } : a))
      )
      setAssetTypes((prev) => [...prev, newSubtype])
      setEditingAsset(newSubtype)
      setSheetOpen(true)
    }
  }

  const handleBulkImport = (items: HierarchyItem[], fieldsetsFromDialog: Fieldset[]) => {
    // App shape: code + sections (imported-only slices; ancestors merged in build step)
    type ParsedFieldsetWithSections = { code: string; name: string; sections: { name: string; fields: string[] }[] }

    const cloneSections = (sections: { name: string; fields: string[] }[]): { name: string; fields: string[] }[] => {
      return sections.map(s => ({ name: s.name, fields: [...s.fields] }))
    }

    const mergeSectionsAdditive = (
      existingSections: { name: string; fields: string[] }[],
      newSections: { name: string; fields: string[] }[]
    ): { name: string; fields: string[] }[] => {
      const mergedSections = cloneSections(existingSections)
      newSections.forEach((newSection) => {
        const existingSection = mergedSections.find(s => s.name === newSection.name)
        if (existingSection) {
          newSection.fields.forEach((field) => {
            if (!existingSection.fields.includes(field)) existingSection.fields.push(field)
          })
        } else {
          mergedSections.push({ name: newSection.name, fields: [...newSection.fields] })
        }
      })
      return mergedSections
    }

    /**
     * Path-prefixed codes (e.g. 26-20-30): ancestor prefixes.
     * Per-level codes (e.g. AHU only): use hierarchy walk — see getAncestorCodesFromHierarchy.
     */
    const getAncestorCodesFromHyphenPath = (code: string): string[] => {
      const parts = code.split("-")
      const ancestors: string[] = []
      for (let i = 1; i < parts.length; i++) {
        ancestors.push(parts.slice(0, i).join("-"))
      }
      return ancestors
    }

    /** Walk tree to find path to an asset type by code or fieldsetCode (handles MECH / AH / AHU, not only MECH-AH-AHU). */
    const findPathToCode = (
      nodes: HierarchyItem[],
      targetCode: string,
      path: HierarchyItem[] = []
    ): HierarchyItem[] | null => {
      for (const n of nodes) {
        const nextPath = [...path, n]
        if (n.code === targetCode || n.fieldsetCode === targetCode) return nextPath
        if (n.children?.length) {
          const found = findPathToCode(n.children, targetCode, nextPath)
          if (found) return found
        }
      }
      return null
    }

    /**
     * Ancestor asset type codes from root → parent (so Air Handling fields cascade into AHU).
     * Uses hierarchy when available; falls back to hyphen prefixes for path-style codes.
     */
    const getAncestorCodesForFieldset = (assetCode: string): string[] => {
      if (items.length > 0) {
        const path = findPathToCode(items, assetCode)
        if (path && path.length > 1) {
          return path.slice(0, -1).map((n) => n.code)
        }
      }
      return getAncestorCodesFromHyphenPath(assetCode)
    }

    // Leaf own sections: custom fields for this type only (inheritedFields merged via ancestor chain + default)
    const importedFieldsets: ParsedFieldsetWithSections[] = fieldsetsFromDialog.map((fs) => ({
      code: fs.code,
      name: fs.name,
      sections:
        fs.sections && fs.sections.length > 0
          ? fs.sections.map((s) => ({ name: s.name, fields: [...s.fields] }))
          : fs.fields.length > 0
            ? [{ name: "Fields", fields: [...fs.fields] }]
            : [{ name: "Fields", fields: [] }],
    }))

    // Parent rows: sections used only to cascade into leaf fieldsets (no separate FieldsetData per parent).
    const parentFieldsetDefs: ParsedFieldsetWithSections[] = []
    function collectFieldsUnder(node: HierarchyItem): string[] {
      if (node.fieldsetCode) {
        const dlg = fieldsetsFromDialog.find((f) => f.code === node.fieldsetCode)
        if (dlg) {
          const own = dlg.sections?.length
            ? dlg.sections.flatMap((s) => s.fields)
            : dlg.fields
          return [...(dlg.inheritedFields ?? []), ...own]
        }
        const fs = importedFieldsets.find((f) => f.code === node.fieldsetCode)
        if (fs) return fs.sections.flatMap((s) => s.fields)
        return []
      }
      return (node.children ?? []).flatMap(collectFieldsUnder)
    }
    function walkForParentFieldsets(nodes: HierarchyItem[]): void {
      nodes.forEach((item) => {
        const hasOwnFieldset = !!item.fieldsetCode
        const hasCommonFields = item.commonFields && item.commonFields.length > 0
        const hasChildren = item.children && item.children.length > 0
        if (hasOwnFieldset) return // leaf, already in importedFieldsets
        if (hasCommonFields) {
          parentFieldsetDefs.push({
            code: item.code,
            name: item.name,
            sections: [{ name: "Default", fields: [...(item.commonFields ?? [])] }]
          })
        } else if (hasChildren) {
          const allFields = Array.from(new Set(collectFieldsUnder(item)))
          if (allFields.length > 0) {
            parentFieldsetDefs.push({
              code: item.code,
              name: item.name,
              sections: [{ name: "Default", fields: allFields }]
            })
          }
        }
        if (item.children?.length) walkForParentFieldsets(item.children)
      })
    }
    walkForParentFieldsets(items)
    const allDefsForLeafMerge = [...parentFieldsetDefs, ...importedFieldsets]

    /**
     * Each leaf fieldset key `${code}_Fieldset` = Procore Default + each ancestor's slices + that leaf's own fields.
     * Only leaf nodes reference these keys; parents stay on Procore Default.
     */
    const buildCombinedFieldsetForCode = (
      ownSections: { name: string; fields: string[] }[],
      code: string,
      defaultSections: { name: string; fields: string[] }[],
      definitions: ParsedFieldsetWithSections[]
    ): FieldsetData => {
      let base = cloneSections(defaultSections)
      for (const anc of getAncestorCodesForFieldset(code)) {
        const ancestorDef = definitions.find((f) => f.code === anc)
        if (ancestorDef) {
          base = mergeSectionsAdditive(base, cloneSections(ancestorDef.sections))
        }
      }
      const own = ownSections.length ? ownSections : [{ name: "Fields", fields: [] }]
      base = mergeSectionsAdditive(base, cloneSections(own))
      const fieldsetName = `${code}_Fieldset`
      return { name: fieldsetName, sections: base }
    }

    // Persist fieldset objects only for leaf codes (template/global catalog keeps client-specific copies separately).
    if (importedFieldsets.length > 0) {
      setFieldsets((prev) => {
        const defaultSections = cloneSections(
          prev["Procore Default"]?.sections ?? DEFAULT_FIELDSETS["Procore Default"].sections
        )
        const next: Record<string, FieldsetData> = { ...prev }
        if (!next["Procore Default"]) {
          next["Procore Default"] = { ...DEFAULT_FIELDSETS["Procore Default"] }
        }

        const defs = allDefsForLeafMerge
        for (const fs of importedFieldsets) {
          const fieldsetName = `${fs.code}_Fieldset`
          next[fieldsetName] = buildCombinedFieldsetForCode(fs.sections, fs.code, defaultSections, defs)
        }
        return next
      })
    }

    const findMatchingLeafFieldset = (code: string): string | null => {
      const exactMatch = importedFieldsets.find((fs) => fs.code === code)
      if (exactMatch) return `${exactMatch.code}_Fieldset`
      const sortedFieldsets = [...importedFieldsets].sort((a, b) => b.code.length - a.code.length)
      for (const fs of sortedFieldsets) {
        if (code.startsWith(fs.code)) return `${fs.code}_Fieldset`
      }
      return null
    }

    if (items.length > 0) {
      const flattenHierarchy = (nodes: HierarchyItem[], parentId?: string): AssetType[] => {
        const result: AssetType[] = []

        nodes.forEach((item) => {
          const hasChildren = !!(item.children && item.children.length > 0)
          const fieldsetName = hasChildren
            ? "Procore Default"
            : (item.fieldsetCode ? `${item.fieldsetCode}_Fieldset` : null) ||
              findMatchingLeafFieldset(item.code) ||
              "Procore Default"

          const assetType: AssetType = {
            id: `bulk-${Date.now()}-${item.code}-${Math.random().toString(36).substr(2, 9)}`,
            name: item.name,
            code: item.code,
            description: item.description || "",
            fieldset: fieldsetName,
            statusGroup: "Procore Default",
            hasSubtypes: hasChildren,
            parentId,
          }

          result.push(assetType)

          if (item.children?.length) {
            result.push(...flattenHierarchy(item.children, assetType.id))
          }
        })

        return result
      }

      const newAssetTypes = flattenHierarchy(items)
      setAssetTypes((prev) => [...prev, ...newAssetTypes])
    }

    if (importedFieldsets.length > 0 && items.length === 0) {
      setAssetTypes((prev) => {
        return prev.map((asset) => {
          const matchingFieldset = findMatchingLeafFieldset(asset.code)
          if (matchingFieldset) {
            return { ...asset, fieldset: matchingFieldset }
          }
          return asset
        })
      })
    }

    if (fieldsetsFromDialog.length > 0) {
      const allFields = new Set<string>()
      fieldsetsFromDialog.forEach((fs) => {
        ;(fs.inheritedFields ?? []).forEach((f) => allFields.add(f))
        fs.fields.forEach((f) => allFields.add(f))
      })

      setCustomFieldMappings((prev) => {
        const existingImportedNames = new Set(prev.map((m) => m.importedName))
        const newMappings: CustomFieldMapping[] = []

        Array.from(allFields).forEach((fieldName) => {
          if (isCsvCustomFieldTypeTokenName(fieldName)) return
          if (!existingImportedNames.has(fieldName)) {
            const matchingField = EXISTING_CUSTOM_FIELDS.find(
              (cf) => cf.name.toLowerCase() === fieldName.toLowerCase()
            )

            const csvTypeRaw = findImportedCustomFieldTypeRaw(fieldName, fieldsetsFromDialog)
            const fallbackType = matchingField?.type || "Plain Text (Short)"
            const resolvedType = mapImportedCustomFieldTypeToApp(csvTypeRaw, fallbackType)

            newMappings.push({
              id: `mapping-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              importedName: fieldName,
              mappedFieldId: matchingField?.id || null,
              mappedFieldName: matchingField?.name || fieldName,
              fieldType: resolvedType,
              isNew: !matchingField,
            })
          }
        })

        return [...prev, ...newMappings]
      })
    }
  }

  const getAssetTypesForTemplate = useCallback(
    (id: string) => resolveTemplateConfig(id).assetTypes,
    [resolveTemplateConfig]
  )

  const getFieldsetsForTemplate = useCallback(
    (id: string) => {
      const cfg = resolveTemplateConfig(id)
      if (cfg.fieldsetsByClient && Object.keys(cfg.fieldsetsByClient).length > 0) {
        return mergeFieldsetsMapsForFlatDisplay(cfg.fieldsetsByClient)
      }
      return cfg.fieldsets
    },
    [resolveTemplateConfig]
  )

  const handleImportApply = (payload: ImportFromApplyPayload) => {
    const src = resolveTemplateConfig(payload.sourceTemplateId)
    const { assetTypes: srcTypes, fieldsets: srcFs, fieldsetsByClient: srcByClient } = src
    const srcFlat: Record<string, FieldsetData> =
      srcByClient && Object.keys(srcByClient).length > 0
        ? mergeFieldsetsMapsForFlatDisplay(srcByClient)
        : srcFs

    const importTypes = payload.selectedAssetTypeIds.length > 0 && srcTypes.length > 0
    let typesToCopy: AssetType[] = []
    if (importTypes) {
      typesToCopy = filterAssetTypesWithAncestors(srcTypes, new Set(payload.selectedAssetTypeIds))
    }

    const remapped = remapAssetTypesWithNewIds(typesToCopy)
    const typesForAppend = importTypes ? remapped : []

    const incomingKeys = new Set(typesForAppend.map(assetTypeMatchKey))

    let allFieldsetKeys = new Set<string>()
    if (importTypes && typesToCopy.length > 0) {
      allFieldsetKeys = fieldsetKeysForAssetTypes(typesToCopy)
    } else if (!importTypes && payload.selectedFieldsetKeys?.length) {
      for (const k of payload.selectedFieldsetKeys) {
        if (Object.prototype.hasOwnProperty.call(srcFlat, k)) allFieldsetKeys.add(k)
      }
    }

    const incomingProjectKeys = pickProjectFieldsetKeysForImportedFieldsets(
      src.projectFieldsetKeys,
      allFieldsetKeys
    )

    let fieldsetsToApply: Record<string, FieldsetData> = {}
    let fieldsetsToApplyByClient: Record<string, Record<string, FieldsetData>> | null = null
    let shouldApplyFieldsets = false

    if (allFieldsetKeys.size > 0) {
      fieldsetsToApply = pickFieldsetsByKeys(srcFlat, allFieldsetKeys)
      fieldsetsToApplyByClient = srcByClient
        ? pickFieldsetsByKeysForAllClients(srcByClient, allFieldsetKeys, ALL_CATALOG_FIELDSET_CLIENTS)
        : null
      const pickedByClient = fieldsetsToApplyByClient
      const hasClientPayload =
        !!pickedByClient &&
        ALL_CATALOG_FIELDSET_CLIENTS.some((c) => Object.keys(pickedByClient[c] ?? {}).length > 0)
      shouldApplyFieldsets = Object.keys(fieldsetsToApply).length > 0 || hasClientPayload
    }

    onTemplateConfigChange((prev) => {
      let nextFieldsets = prev.fieldsets
      let nextByClient = prev.fieldsetsByClient
      let nextAssetTypes = prev.assetTypes
      let nextProjectFieldsetKeys = prev.projectFieldsetKeys

      if (Object.keys(incomingProjectKeys).length > 0) {
        nextProjectFieldsetKeys = { ...(prev.projectFieldsetKeys ?? {}), ...incomingProjectKeys }
      }

      if (shouldApplyFieldsets) {
        if (payload.mode === "replace") {
          nextFieldsets = { ...prev.fieldsets }
          for (const [k, v] of Object.entries(fieldsetsToApply)) {
            nextFieldsets[k] = JSON.parse(JSON.stringify(v)) as FieldsetData
          }
          if (fieldsetsToApplyByClient) {
            nextByClient = { ...(prev.fieldsetsByClient ?? {}) }
            for (const c of ALL_CATALOG_FIELDSET_CLIENTS) {
              nextByClient[c] = { ...(nextByClient[c] ?? {}) }
              for (const [k, v] of Object.entries(fieldsetsToApplyByClient[c] ?? {})) {
                nextByClient[c][k] = JSON.parse(JSON.stringify(v)) as FieldsetData
              }
            }
          }
        } else {
          nextFieldsets = mergeFieldsetRecords(prev.fieldsets, fieldsetsToApply)
          if (fieldsetsToApplyByClient) {
            nextByClient = mergeFieldsetsByClientMaps(
              prev.fieldsetsByClient,
              fieldsetsToApplyByClient,
              ALL_CATALOG_FIELDSET_CLIENTS
            )
          }
        }
      }

      if (importTypes && srcTypes.length > 0) {
        if (payload.mode === "replace") {
          const withoutReplaced = removeAssetTypesReplacedByIncoming(prev.assetTypes, incomingKeys)
          nextAssetTypes = [...withoutReplaced, ...typesForAppend]
        } else {
          const existingKeys = new Set(prev.assetTypes.map(assetTypeMatchKey))
          const toAdd = typesForAppend.filter((t) => !existingKeys.has(assetTypeMatchKey(t)))
          nextAssetTypes = [...prev.assetTypes, ...toAdd]
        }
      }

      const draft: TemplateAssetConfig = {
        ...prev,
        assetTypes: nextAssetTypes,
        fieldsets: nextFieldsets,
        fieldsetsByClient: nextByClient,
        projectFieldsetKeys: nextProjectFieldsetKeys,
      }
      return draft.fieldsetsByClient
        ? syncFlatFieldsetsFromPrimaryClient(draft)
        : draft
    })
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      {/* Template Header */}
      <div className="border-b bg-background">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Templates
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Settings className="h-6 w-6 text-muted-foreground" />
              <h1 className="text-2xl font-bold text-foreground">{template.name}</h1>
              {mode === "view" && (
                <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                  View Only
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-auto px-6 py-4">
          {catalogReadOnly && globalCatalog ? (
            <GlobalAssetSettings
              templates={allTemplates}
              globalCatalog={globalCatalog}
              onUpdateGlobalCatalog={() => {}}
              templateView={{ templateId: template.id, embedded: true }}
            />
          ) : (
            <>
              {catalogReadOnly && (
                <div className="mb-4 rounded-md border border-muted bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  Asset types and fieldsets are maintained in{" "}
                  <span className="font-medium text-foreground">Asset settings</span>. This template uses a
                  snapshot from when it was created or last updated. Use{" "}
                  <span className="font-medium text-foreground">Import</span> below to pull from asset settings
                  or another template (types, fieldsets, and project fieldset assignments when present). Export below reflects
                  this template&apos;s copy.
                </div>
              )}
              <div className="mb-4 flex items-center justify-between">
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {mode === "edit" && !catalogReadOnly && (
                    <Button variant="outline" onClick={() => setBulkCreateOpen(true)}>
                      <Upload className="h-4 w-4" />
                      Bulk Create
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleExportDeepHierarchyCsv}
                    title="Download Asset_Classification_Deep_Hierarchy.csv (hierarchy + fieldsets)"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                  {mode === "edit" && !catalogReadOnly && (
                    <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                      <FolderInput className="h-4 w-4" />
                      Import
                    </Button>
                  )}
                  {mode === "edit" && !catalogReadOnly && (
                    <Button
                      onClick={handleCreateType}
                      className="bg-orange-500 text-white hover:bg-orange-600"
                    >
                      <Plus className="h-4 w-4" />
                      Create Type
                    </Button>
                  )}
                </div>
              </div>

              <AssetTypesTable
                assetTypes={filteredAssetTypes}
                allAssetTypesForAssembly={assetTypes}
                hideFieldsetColumn
                hideStatusGroupColumn
                onEdit={mode === "edit" && !catalogReadOnly ? handleEditType : undefined}
                onDelete={mode === "edit" && !catalogReadOnly ? handleDeleteType : undefined}
                onAddSubtype={mode === "edit" && !catalogReadOnly ? handleAddSubtype : undefined}
              />
            </>
          )}
        </main>

      {/* Asset Type Edit Sheet */}
      {!catalogReadOnly && (
        <AssetTypeSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          assetType={editingAsset}
          allAssetTypes={assetTypes}
          onSave={handleSaveType}
          fieldsets={fieldsetsForUi}
        />
      )}

      {mode === "edit" && !catalogReadOnly && (
        <ImportFromTemplateDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          templates={allTemplates}
          currentTemplateId={template.id}
          getAssetTypesForTemplate={getAssetTypesForTemplate}
          getFieldsetsForTemplate={getFieldsetsForTemplate}
          onApply={handleImportApply}
          catalogSources={[
            {
              id: COPY_SOURCE_COMPANY_CATALOG_ID,
              label: "Asset settings",
            },
          ]}
        />
      )}

      {!catalogReadOnly && (
        <BulkCreateDialog
          open={bulkCreateOpen}
          onOpenChange={setBulkCreateOpen}
          onImport={handleBulkImport}
        />
      )}
    </div>
  )
}
