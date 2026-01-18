import { Cloud, CloudOff } from 'lucide-preact'
import type { FilamentSectionProps } from './types'
import { MATERIALS, WEIGHTS } from './constants'
import { parsePresetName } from './utils'

export function FilamentSection({
  formData,
  updateField,
  cloudAuthenticated,
  loadingCloudPresets,
  presetInputValue,
  setPresetInputValue,
  selectedPresetOption,
  filamentOptions,
  availableBrands,
}: FilamentSectionProps) {
  return (
    <div class="form-section">
      <div class="form-section-header">
        <h3>Filament</h3>
      </div>
      <div class="form-section-content">
        {/* Slicer Preset - REQUIRED */}
        <div class="form-field">
          <div class="flex items-center justify-between mb-1">
            <label class="form-label">
              Slicer Preset <span class="text-[var(--error-color)]">*</span>
            </label>
            <span class={`flex items-center gap-1 text-xs ${cloudAuthenticated ? 'text-green-500' : 'text-[var(--text-muted)]'}`}>
              {loadingCloudPresets ? (
                <span class="flex items-center gap-1">
                  <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Loading...
                </span>
              ) : cloudAuthenticated ? (
                <><Cloud class="w-3 h-3" /> Cloud</>
              ) : (
                <><CloudOff class="w-3 h-3" /> Local</>
              )}
            </span>
          </div>

          {loadingCloudPresets ? (
            <div class="input bg-[var(--bg-tertiary)] animate-pulse h-[38px]" />
          ) : (
            <>
              <input
                type="text"
                list="slicer-presets"
                class={`input ${!formData.slicer_filament ? 'border-[var(--warning-color)]/50' : ''}`}
                placeholder="Type to search presets..."
                value={presetInputValue}
                onInput={(e) => {
                  const inputValue = (e.target as HTMLInputElement).value
                  setPresetInputValue(inputValue)

                  // Look up option by displayName first, then by code
                  let option = filamentOptions.find(o => o.displayName === inputValue)
                  if (!option) {
                    option = filamentOptions.find(o => o.code === inputValue)
                  }
                  if (!option) {
                    const inputLower = inputValue.toLowerCase()
                    option = filamentOptions.find(o => o.displayName.toLowerCase() === inputLower)
                  }

                  if (option) {
                    updateField('slicer_filament', option.code)
                    // Auto-fill from preset
                    const parsed = parsePresetName(option.name)
                    if (parsed.brand) updateField('brand', parsed.brand)
                    if (parsed.material) updateField('material', parsed.material)
                    if (parsed.variant) {
                      updateField('subtype', parsed.variant)
                    } else {
                      updateField('subtype', '')
                    }
                  } else {
                    updateField('slicer_filament', inputValue)
                  }
                }}
              />
              <datalist id="slicer-presets">
                {filamentOptions.map(({ code, displayName }) => (
                  <option key={code} value={displayName}>{displayName}</option>
                ))}
              </datalist>
            </>
          )}

          {selectedPresetOption && (
            <p class="text-xs text-[var(--accent-color)] mt-1 flex items-center gap-1">
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]" />
              {selectedPresetOption.displayName}
            </p>
          )}
          {!cloudAuthenticated && !loadingCloudPresets && !selectedPresetOption && (
            <p class="text-xs text-[var(--text-muted)] mt-1">
              Login to Bambu Cloud in Settings for custom presets
            </p>
          )}
        </div>

        {/* Material + Subtype */}
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Material</label>
            <select
              class="select"
              value={formData.material}
              onChange={(e) => updateField('material', (e.target as HTMLSelectElement).value)}
            >
              <option value="">Select...</option>
              {MATERIALS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Variant</label>
            <input
              type="text"
              class="input"
              placeholder="e.g., Silk, Matte, HF"
              value={formData.subtype}
              onInput={(e) => updateField('subtype', (e.target as HTMLInputElement).value)}
            />
          </div>
        </div>

        {/* Brand + Weight */}
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Brand</label>
            <select
              class="select"
              value={formData.brand}
              onChange={(e) => updateField('brand', (e.target as HTMLSelectElement).value)}
            >
              <option value="">Select...</option>
              {availableBrands.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Spool Weight</label>
            <select
              class="select"
              value={formData.label_weight}
              onChange={(e) => updateField('label_weight', parseInt((e.target as HTMLSelectElement).value))}
            >
              {WEIGHTS.map(w => (
                <option key={w} value={w}>{w >= 1000 ? `${w / 1000}kg` : `${w}g`}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
