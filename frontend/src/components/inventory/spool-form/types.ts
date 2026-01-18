import type { Printer, CalibrationProfile, CatalogEntry } from '../../../lib/api'
import type { Dispatch, StateUpdater } from 'preact/hooks'

// Form data structure
export interface SpoolFormData {
  material: string
  subtype: string
  brand: string
  color_name: string
  rgba: string
  label_weight: number
  core_weight: number
  slicer_filament: string
  location: string
  note: string
}

export const defaultFormData: SpoolFormData = {
  material: '',
  subtype: '',
  brand: '',
  color_name: '',
  rgba: '#808080',
  label_weight: 1000,
  core_weight: 250,
  slicer_filament: '',
  location: '',
  note: '',
}

// Printer with calibrations type
export interface PrinterWithCalibrations {
  printer: Printer
  calibrations: CalibrationProfile[]
}

// Filament option from presets
export interface FilamentOption {
  code: string
  name: string
  displayName: string
  isCustom: boolean
  allCodes: string[]
}

// Color preset
export interface ColorPreset {
  name: string
  hex: string
}

// Section props base
export interface SectionProps {
  formData: SpoolFormData
  updateField: <K extends keyof SpoolFormData>(key: K, value: SpoolFormData[K]) => void
}

// Filament section props
export interface FilamentSectionProps extends SectionProps {
  cloudAuthenticated: boolean
  loadingCloudPresets: boolean
  presetInputValue: string
  setPresetInputValue: (value: string) => void
  selectedPresetOption?: FilamentOption
  filamentOptions: FilamentOption[]
  availableBrands: string[]
}

// Color section props
export interface ColorSectionProps extends SectionProps {
  recentColors: ColorPreset[]
  onColorUsed: (color: ColorPreset) => void
}

// Additional section props
export interface AdditionalSectionProps extends SectionProps {
  spoolCatalog: CatalogEntry[]
}

// PA Profile section props
export interface PAProfileSectionProps extends SectionProps {
  printersWithCalibrations: PrinterWithCalibrations[]
  selectedProfiles: Set<string>
  setSelectedProfiles: Dispatch<StateUpdater<Set<string>>>
  expandedPrinters: Set<string>
  setExpandedPrinters: Dispatch<StateUpdater<Set<string>>>
}

// Validation result
export interface ValidationResult {
  isValid: boolean
  errors: Partial<Record<keyof SpoolFormData, string>>
}

export function validateForm(formData: SpoolFormData): ValidationResult {
  const errors: Partial<Record<keyof SpoolFormData, string>> = {}

  if (!formData.slicer_filament) {
    errors.slicer_filament = 'Slicer preset is required'
  }

  if (!formData.material) {
    errors.material = 'Material is required'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}
