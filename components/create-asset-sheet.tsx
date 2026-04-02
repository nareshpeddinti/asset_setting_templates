"use client"

import { useState, useEffect } from "react"
import { X, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet"
import { mergeFieldsetWithAssemblyLinkage } from "@/lib/merge-fieldset-assembly"
import {
  nearestAssemblyAncestor,
  ASSEMBLY_LINKAGE_SECTION,
  isCreatableAssetType,
} from "@/lib/assembly-asset-types"
import { TEMPLATE_ASSETS } from "@/components/assets-list"
import { cn } from "@/lib/utils"
import type { AssetType } from "@/app/page"
import { TEMPLATE_ASSET_TYPES } from "@/lib/template-asset-types"

interface FieldsetSection {
  name: string
  fields: string[]
}

interface FieldsetData {
  name: string
  sections: FieldsetSection[]
}

interface Template {
  id: string
  name: string
}

interface CreateAssetSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: Template[]
  /** Project context: single template assigned to the project — hide template picker. */
  lockedTemplateId?: string
  onSave?: (data: Record<string, string>) => void
}

// Fieldsets for each template
const TEMPLATE_FIELDSETS: Record<string, Record<string, FieldsetData>> = {
  "template-default": {
    "Procore Default": {
      name: "Procore Default",
      sections: [
        { name: "General Information", fields: ["Asset Name", "Asset Code", "Description", "Location", "Status"] },
        { name: "Technical Details", fields: ["Manufacturer", "Model Number", "Serial Number", "Installation Date"] },
      ]
    }
  },
  "template-residential": {
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
  },
  "template-commercial": {
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
  },
  "template-industrial": {
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
  "template-datacenter": {
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
  },
  "template-windfarm": {
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

const STATUS_OPTIONS = [
  "Installed",
  "Approved", 
  "IN-DESIGN",
  "In-Warehouse",
  "Commissioned",
  "IN-REVIEW",
  "ARCHIVED",
]

const TRADE_OPTIONS = [
  "Mechanical",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Fire Protection",
  "Controls",
  "General",
]

export function CreateAssetSheet({
  open,
  onOpenChange,
  templates,
  lockedTemplateId,
  onSave,
}: CreateAssetSheetProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [selectedType, setSelectedType] = useState<string>("")
  const [formData, setFormData] = useState<Record<string, string>>({})

  // Reset form when sheet opens/closes; lock template when project-scoped
  useEffect(() => {
    if (!open) {
      setSelectedTemplate("")
      setSelectedType("")
      setFormData({})
    } else if (lockedTemplateId) {
      setSelectedTemplate(lockedTemplateId)
      setSelectedType("")
      setFormData({})
    }
  }, [open, lockedTemplateId])

  // Get asset types for selected template
  const assetTypes = selectedTemplate ? TEMPLATE_ASSET_TYPES[selectedTemplate] || [] : []

  useEffect(() => {
    if (!selectedType || assetTypes.length === 0) return
    if (!isCreatableAssetType(assetTypes, selectedType)) {
      setSelectedType("")
    }
  }, [selectedType, assetTypes])

  // Get selected asset type object
  const selectedAssetType = assetTypes.find((t) => t.id === selectedType)

  // Get fieldset for selected type (injects "Assembly linkage" for types under an assembly)
  const getFieldset = (): FieldsetData | null => {
    if (!selectedTemplate || !selectedAssetType?.fieldset) return null
    const templateFieldsets = TEMPLATE_FIELDSETS[selectedTemplate]
    if (!templateFieldsets) return null
    const raw = templateFieldsets[selectedAssetType.fieldset] || null
    if (!raw || !selectedAssetType.id) return raw
    return mergeFieldsetWithAssemblyLinkage(raw, assetTypes, selectedAssetType.id)
  }

  const fieldset = getFieldset()

  const assemblyAncestor = selectedAssetType
    ? nearestAssemblyAncestor(assetTypes, selectedAssetType.id)
    : null

  const parentAssemblyOptions =
    selectedTemplate && assemblyAncestor
      ? (TEMPLATE_ASSETS[selectedTemplate] ?? []).filter(
          (a) => a.type === assemblyAncestor.name
        )
      : []

  const handleFieldChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    if (onSave) {
      onSave({
        ...formData,
        template: selectedTemplate,
        type: selectedType,
      })
    }
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">Create Asset</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Tab */}
        <div className="px-6 border-b">
          <button className="pb-3 text-sm font-medium border-b-2 border-foreground -mb-px">
            Information
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Template Selection (hidden when project has a single assigned template) */}
          <div className="mb-6 p-4 border rounded-lg bg-muted/30">
            <Label className="text-sm font-medium">
              Template <span className="text-destructive">*</span>
            </Label>
            {lockedTemplateId ? (
              <div className="mt-2 space-y-1">
                <p className="text-sm font-medium">
                  {templates.find((t) => t.id === lockedTemplateId)?.name ?? lockedTemplateId}
                </p>
                <p className="text-xs text-muted-foreground">
                  This project uses one template for the asset register. To use a different template, switch
                  project in the header or open the company register.
                </p>
              </div>
            ) : (
              <Select
                value={selectedTemplate}
                onValueChange={(val) => {
                  setSelectedTemplate(val)
                  setSelectedType("")
                  setFormData({})
                }}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select Template" />
                </SelectTrigger>
                <SelectContent>
                  {templates
                    .filter((t) => t.id !== "template-default")
                    .map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* General Information Section */}
          <div className="border rounded-lg p-5 bg-background">
            <h3 className="text-lg font-semibold mb-5">General Information</h3>
            
            {/* Photo Upload */}
            <div className="flex justify-center mb-5">
              <div className="w-40 h-28 border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-muted-foreground transition-colors cursor-pointer bg-muted/30">
                <ImageIcon className="h-8 w-8" />
                <Button variant="outline" size="sm">Select Photo</Button>
              </div>
            </div>

            {/* Type and Trade Row */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Type <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Select a leaf type or an assembly type. Intermediate groups are not selectable.
                </p>
                <Select 
                  value={selectedType} 
                  onValueChange={setSelectedType}
                  disabled={!selectedTemplate}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Asset Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {assetTypes.map((type) => {
                      const creatable = isCreatableAssetType(assetTypes, type.id)
                      return (
                        <SelectItem
                          key={type.id}
                          value={type.id}
                          disabled={!creatable}
                          className={!creatable ? "text-muted-foreground" : undefined}
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{type.code}</span>
                            <span>{type.name}</span>
                            {!creatable ? (
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                (group)
                              </span>
                            ) : null}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Trade</Label>
                <Select 
                  value={formData.trade || ""} 
                  onValueChange={(val) => handleFieldChange("trade", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Trade" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRADE_OPTIONS.map((trade) => (
                      <SelectItem key={trade} value={trade}>
                        {trade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Name, Code, Status Row */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input 
                  placeholder="Enter Name"
                  value={formData.name || ""}
                  onChange={(e) => handleFieldChange("name", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Code <span className="text-destructive">*</span>
                </Label>
                <Input 
                  placeholder="Enter Code"
                  value={formData.code || ""}
                  onChange={(e) => handleFieldChange("code", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Status <span className="text-destructive">*</span>
                </Label>
                <Select 
                  value={formData.status || ""} 
                  onValueChange={(val) => handleFieldChange("status", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-sm">Description</Label>
              <Textarea 
                placeholder="Enter Description"
                value={formData.description || ""}
                onChange={(e) => handleFieldChange("description", e.target.value)}
                rows={3}
              />
            </div>
          </div>

          {/* Dynamic Fieldset Sections */}
          {fieldset &&
            fieldset.sections
              .filter((s) => s.name !== "General Information")
              .map((section) => (
                <div
                  key={section.name}
                  className={cn(
                    "border rounded-lg p-5 mt-4",
                    section.name === ASSEMBLY_LINKAGE_SECTION
                      ? "bg-orange-500/5 border-orange-500/25"
                      : "bg-background"
                  )}
                >
                  <h3 className="text-lg font-semibold mb-2">{section.name}</h3>
                  {section.name === ASSEMBLY_LINKAGE_SECTION && assemblyAncestor && (
                    <p className="text-xs text-muted-foreground mb-4">
                      Select which{" "}
                      <span className="font-medium text-foreground">{assemblyAncestor.name}</span>{" "}
                      asset this record belongs to.
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {section.fields.map((field) => (
                      <div key={field} className="space-y-1.5">
                        <Label className="text-sm">{field}</Label>
                        {section.name === ASSEMBLY_LINKAGE_SECTION &&
                        parentAssemblyOptions.length > 0 ? (
                          <Select
                            value={formData[field] || ""}
                            onValueChange={(val) => handleFieldChange(field, val)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={`Select ${assemblyAncestor?.name ?? "assembly"}…`} />
                            </SelectTrigger>
                            <SelectContent>
                              {parentAssemblyOptions.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.name} ({a.code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : section.name === ASSEMBLY_LINKAGE_SECTION ? (
                          <Input
                            placeholder="No sample assemblies for this template — enter ID or name"
                            value={formData[field] || ""}
                            onChange={(e) => handleFieldChange(field, e.target.value)}
                          />
                        ) : (
                          <Input
                            placeholder={`Enter ${field}`}
                            value={formData[field] || ""}
                            onChange={(e) => handleFieldChange(field, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!selectedTemplate || !selectedType || !formData.name || !formData.code || !formData.status}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            Save changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
