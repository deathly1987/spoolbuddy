import { ChevronDown, ChevronRight, Sparkles } from 'lucide-preact'
import type { CalibrationProfile } from '../../../lib/api'
import type { PAProfileSectionProps } from './types'
import { isMatchingCalibration } from './utils'

export function PAProfileSection({
  formData,
  printersWithCalibrations,
  selectedProfiles,
  setSelectedProfiles,
  expandedPrinters,
  setExpandedPrinters,
}: PAProfileSectionProps) {
  const togglePrinterExpanded = (serial: string) => {
    setExpandedPrinters((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(serial)) next.delete(serial)
      else next.add(serial)
      return next
    })
  }

  const toggleProfileSelected = (serial: string, caliIdx: number, extruderId?: number | null) => {
    const key = `${serial}:${caliIdx}:${extruderId ?? 'null'}`
    const printerNozzleKey = `${serial}:${extruderId ?? 'null'}`

    setSelectedProfiles((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        // Remove existing profile for same printer/nozzle
        for (const existingKey of Array.from(next)) {
          const parts = existingKey.split(':')
          const existingPrinterNozzle = `${parts[0]}:${parts[2]}`
          if (existingPrinterNozzle === printerNozzleKey) {
            next.delete(existingKey)
          }
        }
        next.add(key)
      }
      return next
    })
  }

  // Auto-select best matching profiles
  const autoSelectProfiles = () => {
    const newSelection = new Set<string>()

    for (const { printer, calibrations } of printersWithCalibrations) {
      if (!printer.connected) continue

      const matchingCals = calibrations.filter(cal =>
        isMatchingCalibration(cal, formData)
      )

      // Group by extruder
      const byExtruder = new Map<string, CalibrationProfile[]>()
      for (const cal of matchingCals) {
        const extKey = `${cal.extruder_id ?? 'null'}`
        if (!byExtruder.has(extKey)) byExtruder.set(extKey, [])
        byExtruder.get(extKey)!.push(cal)
      }

      // Select best (highest K) for each extruder
      for (const [extKey, cals] of byExtruder) {
        if (cals.length > 0) {
          // Sort by k_value descending (often want the tuned value)
          const sorted = [...cals].sort((a, b) => b.k_value - a.k_value)
          const best = sorted[0]
          newSelection.add(`${printer.serial}:${best.cali_idx}:${extKey}`)
        }
      }
    }

    setSelectedProfiles(newSelection)
  }

  if (!formData.material) {
    return (
      <div class="form-section">
        <div class="form-section-content">
          <div class="p-6 bg-[var(--bg-tertiary)] rounded-lg text-center">
            <p class="text-[var(--text-secondary)]">
              Please select a material first in the Filament Info tab.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (printersWithCalibrations.length === 0) {
    return (
      <div class="form-section">
        <div class="form-section-content">
          <div class="p-6 bg-[var(--bg-tertiary)] rounded-lg text-center">
            <p class="text-[var(--text-secondary)]">
              No printers configured. Add printers in the Printers page.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Count total matching profiles
  const totalMatching = printersWithCalibrations.reduce((sum, { printer, calibrations }) => {
    if (!printer.connected) return sum
    return sum + calibrations.filter(cal => isMatchingCalibration(cal, formData)).length
  }, 0)

  const renderProfile = (printer: { serial: string }, cal: CalibrationProfile) => {
    const key = `${printer.serial}:${cal.cali_idx}:${cal.extruder_id ?? 'null'}`
    const isSelected = selectedProfiles.has(key)
    return (
      <label
        key={`${cal.cali_idx}-${cal.extruder_id}`}
        class={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
          isSelected
            ? 'bg-[var(--accent-color)]/10 border-[var(--accent-color)]/30'
            : 'bg-[var(--bg-tertiary)] border-transparent hover:bg-[var(--bg-tertiary)]/80'
        }`}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleProfileSelected(printer.serial, cal.cali_idx, cal.extruder_id)}
          class="w-4 h-4 rounded border-[var(--border-color)] text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
        />
        <div class="flex-1 min-w-0">
          <span class={`text-sm font-medium ${isSelected ? 'text-[var(--accent-color)]' : 'text-[var(--text-primary)]'}`}>
            {cal.name || cal.filament_id}
          </span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-xs font-mono px-2 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-secondary)]">
            K={cal.k_value.toFixed(3)}
          </span>
        </div>
      </label>
    )
  }

  return (
    <div class="space-y-4">
      {/* Header with auto-select */}
      <div class="flex items-center justify-between">
        <p class="text-xs text-[var(--text-muted)]">
          Matching: {formData.brand || 'Any brand'} / {formData.material} / {formData.subtype || 'Any variant'}
        </p>
        {totalMatching > 0 && (
          <button
            type="button"
            onClick={autoSelectProfiles}
            class="btn btn-sm btn-secondary flex items-center gap-1.5"
          >
            <Sparkles class="w-3.5 h-3.5" />
            Auto-select ({totalMatching})
          </button>
        )}
      </div>

      {/* Printer sections */}
      <div class="space-y-3">
        {printersWithCalibrations.map(({ printer, calibrations }) => {
          const isExpanded = expandedPrinters.has(printer.serial)
          const matchingCals = calibrations.filter(cal => isMatchingCalibration(cal, formData))
          const matchingCount = matchingCals.length

          // Multi-nozzle grouping
          const isMultiNozzle = matchingCals.some(cal =>
            cal.extruder_id !== undefined && cal.extruder_id !== null && cal.extruder_id > 0
          )
          const leftNozzleCals = matchingCals.filter(cal => cal.extruder_id === 1)
          const rightNozzleCals = matchingCals.filter(cal =>
            cal.extruder_id === 0 || cal.extruder_id === undefined || cal.extruder_id === null
          )

          return (
            <div
              key={printer.serial}
              class="border border-[var(--border-color)] rounded-lg overflow-hidden"
            >
              {/* Printer Header */}
              <button
                type="button"
                onClick={() => togglePrinterExpanded(printer.serial)}
                class="w-full px-4 py-3 flex items-center justify-between bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <div class="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown class="w-4 h-4 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronRight class="w-4 h-4 text-[var(--text-muted)]" />
                  )}
                  <span class="font-medium text-[var(--text-primary)]">
                    {printer.name || printer.serial}
                  </span>
                  {matchingCount > 0 ? (
                    <span class="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-color)]/20 text-[var(--accent-color)]">
                      {matchingCount} match{matchingCount !== 1 ? 'es' : ''}
                    </span>
                  ) : (
                    <span class="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                      No matches
                    </span>
                  )}
                </div>
                <span class={`text-xs px-2 py-1 rounded-full ${
                  printer.connected
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-[var(--text-muted)]/20 text-[var(--text-muted)]'
                }`}>
                  {printer.connected ? 'Connected' : 'Offline'}
                </span>
              </button>

              {/* Calibration Profiles */}
              {isExpanded && (
                <div class="px-4 py-3 space-y-3 bg-[var(--bg-primary)] border-t border-[var(--border-color)]">
                  {!printer.connected ? (
                    <p class="text-sm text-[var(--text-muted)] italic py-2">
                      Printer is offline. Connect to view calibration profiles.
                    </p>
                  ) : matchingCount === 0 ? (
                    <p class="text-sm text-[var(--text-muted)] italic py-2">
                      No K-profiles match {formData.brand ? `${formData.brand} ` : ''}{formData.material}{formData.subtype ? ` ${formData.subtype}` : ''}
                    </p>
                  ) : isMultiNozzle ? (
                    <>
                      {leftNozzleCals.length > 0 && (
                        <div class="space-y-2">
                          <p class="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                            Left Nozzle
                          </p>
                          <div class="space-y-2">
                            {leftNozzleCals.map(cal => renderProfile(printer, cal))}
                          </div>
                        </div>
                      )}
                      {rightNozzleCals.length > 0 && (
                        <div class="space-y-2">
                          <p class="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                            Right Nozzle
                          </p>
                          <div class="space-y-2">
                            {rightNozzleCals.map(cal => renderProfile(printer, cal))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div class="space-y-2">
                      {matchingCals.map(cal => renderProfile(printer, cal))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Summary */}
      {selectedProfiles.size > 0 && (
        <div class="p-3 bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30 rounded-lg">
          <p class="text-sm text-[var(--text-primary)]">
            <span class="font-semibold">{selectedProfiles.size}</span> calibration profile{selectedProfiles.size !== 1 ? 's' : ''} selected
          </p>
        </div>
      )}
    </div>
  )
}
