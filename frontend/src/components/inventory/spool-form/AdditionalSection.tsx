import { useState, useEffect, useRef, useMemo } from 'preact/hooks'
import { MapPin } from 'lucide-preact'
import type { CatalogEntry } from '../../../lib/api'
import type { AdditionalSectionProps } from './types'

// Searchable dropdown for spool weight selection
function SpoolWeightPicker({ catalog, value, onChange }: {
  catalog: CatalogEntry[]
  value: number
  onChange: (weight: number) => void
}) {
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!search) return catalog
    const lower = search.toLowerCase()
    return catalog.filter(e => e.name.toLowerCase().includes(lower))
  }, [catalog, search])

  const selectedEntry = selectedId
    ? catalog.find(c => c.id === selectedId)
    : catalog.find(c => c.weight === value)
  const displayValue = isOpen ? search : (selectedEntry?.name || '')

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div class="form-field">
      <label class="form-label">Empty Spool Weight</label>
      <div class="flex gap-2 items-center">
        <div class="flex-1 min-w-0 relative" ref={dropdownRef}>
          <input
            ref={inputRef}
            type="text"
            class="input w-full"
            placeholder="Search brand (e.g., Bambu Lab, eSUN)..."
            value={displayValue}
            onFocus={() => {
              setIsOpen(true)
              setSearch('')
            }}
            onInput={(e) => {
              setSearch((e.target as HTMLInputElement).value)
              setIsOpen(true)
            }}
          />
          {isOpen && (
            <div class="absolute z-50 w-full mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div class="px-3 py-2 text-sm text-[var(--text-muted)]">No matches found</div>
              ) : (
                filtered.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    class={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)] flex justify-between items-center ${
                      (selectedId ? entry.id === selectedId : entry.weight === value)
                        ? 'bg-[var(--accent-color)]/10 text-[var(--accent-color)]'
                        : 'text-[var(--text-primary)]'
                    }`}
                    onClick={() => {
                      setSelectedId(entry.id)
                      onChange(entry.weight)
                      setIsOpen(false)
                      setSearch('')
                    }}
                  >
                    <span class="truncate">{entry.name}</span>
                    <span class="font-mono text-xs text-[var(--text-muted)] ml-2 shrink-0">{entry.weight}g</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <input
            type="number"
            class="input w-16 text-center font-mono"
            value={value}
            min={0}
            max={2000}
            onInput={(e) => {
              const val = parseInt((e.target as HTMLInputElement).value)
              if (!isNaN(val) && val >= 0) onChange(val)
            }}
          />
          <span class="text-[var(--text-muted)] text-sm">g</span>
        </div>
      </div>
    </div>
  )
}

export function AdditionalSection({
  formData,
  updateField,
  spoolCatalog,
}: AdditionalSectionProps) {
  return (
    <div class="form-section">
      <div class="form-section-header">
        <h3>Additional</h3>
      </div>
      <div class="form-section-content">
        {/* Location */}
        <div class="form-field">
          <label class="form-label flex items-center gap-2">
            <MapPin class="w-3.5 h-3.5 text-[var(--text-muted)]" />
            Storage Location
          </label>
          <input
            type="text"
            class="input"
            placeholder="e.g., Shelf A, Drawer 1"
            value={formData.location}
            onInput={(e) => updateField('location', (e.target as HTMLInputElement).value)}
          />
        </div>

        {/* Empty Spool Weight */}
        <SpoolWeightPicker
          catalog={spoolCatalog}
          value={formData.core_weight}
          onChange={(weight) => updateField('core_weight', weight)}
        />

        {/* Note */}
        <div class="form-field">
          <label class="form-label">Notes</label>
          <textarea
            class="input min-h-[80px] resize-none"
            placeholder="Any additional notes about this spool..."
            value={formData.note}
            onInput={(e) => updateField('note', (e.target as HTMLTextAreaElement).value)}
          />
        </div>
      </div>
    </div>
  )
}
