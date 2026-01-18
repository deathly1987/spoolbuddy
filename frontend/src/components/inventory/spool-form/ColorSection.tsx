import { useState, useMemo } from 'preact/hooks'
import { ChevronDown, ChevronUp, Search, Clock } from 'lucide-preact'
import type { ColorSectionProps } from './types'
import { QUICK_COLORS, ALL_COLORS } from './constants'

export function ColorSection({
  formData,
  updateField,
  recentColors,
  onColorUsed,
}: ColorSectionProps) {
  const [showAllColors, setShowAllColors] = useState(false)
  const [colorSearch, setColorSearch] = useState('')

  const selectColor = (hex: string, name: string) => {
    updateField('rgba', `#${hex}`)
    updateField('color_name', name)
    onColorUsed({ hex, name })
  }

  // Filter colors based on search
  const filteredColors = useMemo(() => {
    if (!colorSearch) return showAllColors ? ALL_COLORS : QUICK_COLORS
    const search = colorSearch.toLowerCase()
    return ALL_COLORS.filter(c =>
      c.name.toLowerCase().includes(search) ||
      c.hex.toLowerCase().includes(search)
    )
  }, [colorSearch, showAllColors])

  // Check if current color is selected
  const isSelected = (hex: string) =>
    formData.rgba.replace('#', '').toUpperCase() === hex.toUpperCase()

  const currentHex = formData.rgba.replace('#', '')

  return (
    <div class="form-section">
      <div class="form-section-header">
        <h3>Color</h3>
      </div>
      <div class="form-section-content">
        {/* Color Preview Banner */}
        <div
          class="h-10 rounded-lg flex items-center justify-between px-3 border border-[var(--border-color)] relative overflow-hidden transition-all"
          style={{ backgroundColor: formData.rgba }}
        >
          <span
            class="text-sm font-semibold px-2 py-0.5 rounded-full relative z-10 shadow-sm"
            style={{
              backgroundColor: 'rgba(255,255,255,0.95)',
              color: '#333'
            }}
          >
            {formData.color_name || 'Select a color'}
          </span>
          <span
            class="font-mono text-xs px-2 py-0.5 rounded-full relative z-10 shadow-sm"
            style={{
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: '#fff'
            }}
          >
            #{currentHex.toUpperCase()}
          </span>
        </div>

        {/* Recently Used Colors */}
        {recentColors.length > 0 && (
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1.5 text-xs text-[var(--text-muted)] shrink-0">
              <Clock class="w-3 h-3" />
              <span>Recent</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              {recentColors.map(color => (
                <button
                  key={color.hex}
                  type="button"
                  onClick={() => selectColor(color.hex, color.name)}
                  class={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                    isSelected(color.hex)
                      ? 'border-[var(--accent-color)] ring-1 ring-[var(--accent-color)]/30 scale-110'
                      : 'border-[var(--border-color)]'
                  }`}
                  style={{ backgroundColor: `#${color.hex}` }}
                  title={color.name}
                />
              ))}
            </div>
          </div>
        )}

        {/* Color Search */}
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            class="input pl-9"
            placeholder="Search colors..."
            value={colorSearch}
            onInput={(e) => setColorSearch((e.target as HTMLInputElement).value)}
          />
        </div>

        {/* Color Swatches Grid */}
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>{colorSearch ? 'Search results' : (showAllColors ? 'All colors' : 'Common colors')}</span>
            {!colorSearch && (
              <button
                type="button"
                onClick={() => setShowAllColors(!showAllColors)}
                class="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
              >
                {showAllColors ? (
                  <>Show less <ChevronUp class="w-3 h-3" /></>
                ) : (
                  <>Show all <ChevronDown class="w-3 h-3" /></>
                )}
              </button>
            )}
          </div>
          <div class="flex flex-wrap gap-1.5">
            {filteredColors.map(color => (
              <button
                key={color.hex}
                type="button"
                onClick={() => selectColor(color.hex, color.name)}
                class={`w-6 h-6 rounded border-2 transition-all hover:scale-110 relative group ${
                  isSelected(color.hex)
                    ? 'border-[var(--accent-color)] ring-1 ring-[var(--accent-color)]/30 scale-110'
                    : 'border-[var(--border-color)]'
                }`}
                style={{ backgroundColor: `#${color.hex}` }}
                title={color.name}
              >
                {/* Tooltip on hover */}
                <span
                  class="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg"
                >
                  {color.name}
                </span>
              </button>
            ))}
            {filteredColors.length === 0 && (
              <p class="text-sm text-[var(--text-muted)] py-1">No colors match your search</p>
            )}
          </div>
        </div>

        {/* Manual Color Input */}
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Color Name</label>
            <input
              type="text"
              list="color-name-presets"
              class="input"
              placeholder="Type or select..."
              value={formData.color_name}
              onInput={(e) => {
                const name = (e.target as HTMLInputElement).value
                updateField('color_name', name)
                const preset = ALL_COLORS.find(c => c.name.toLowerCase() === name.toLowerCase())
                if (preset) {
                  updateField('rgba', `#${preset.hex}`)
                  onColorUsed(preset)
                }
              }}
            />
            <datalist id="color-name-presets">
              {ALL_COLORS.map(color => (
                <option key={color.name} value={color.name} />
              ))}
            </datalist>
          </div>
          <div class="form-field">
            <label class="form-label">Hex Color</label>
            <div class="flex gap-2">
              <div class="relative flex-1">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">#</span>
                <input
                  type="text"
                  class="input pl-7 font-mono uppercase"
                  placeholder="RRGGBB"
                  value={currentHex.toUpperCase()}
                  onInput={(e) => {
                    let val = (e.target as HTMLInputElement).value.replace('#', '').replace(/[^0-9A-Fa-f]/g, '')
                    if (val.length <= 8) updateField('rgba', `#${val}`)
                  }}
                />
              </div>
              <input
                type="color"
                class="w-11 h-[38px] rounded-lg cursor-pointer border border-[var(--border-color)] shrink-0"
                value={formData.rgba.substring(0, 7)}
                onInput={(e) => updateField('rgba', (e.target as HTMLInputElement).value)}
                title="Pick custom color"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
