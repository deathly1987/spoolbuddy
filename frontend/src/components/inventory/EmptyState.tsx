import { Package, Search, Archive, Scale } from 'lucide-preact'

interface EmptyStateProps {
  type: 'no-spools' | 'no-search-results' | 'no-archived' | 'no-used' | 'no-unused'
  onAddSpool?: () => void
}

export function EmptyState({ type, onAddSpool }: EmptyStateProps) {
  const configs = {
    'no-spools': {
      icon: Package,
      title: 'No spools yet',
      description: 'Start building your filament inventory by adding your first spool.',
      showAction: true,
      actionText: 'Add Your First Spool',
    },
    'no-search-results': {
      icon: Search,
      title: 'No results found',
      description: 'Try adjusting your search or filters to find what you\'re looking for.',
      showAction: false,
      actionText: '',
    },
    'no-archived': {
      icon: Archive,
      title: 'No archived spools',
      description: 'Spools you archive will appear here. Archive empty or unused spools to keep your inventory clean.',
      showAction: false,
      actionText: '',
    },
    'no-used': {
      icon: Scale,
      title: 'No used spools',
      description: 'Spools with usage data will appear here once you start printing.',
      showAction: false,
      actionText: '',
    },
    'no-unused': {
      icon: Package,
      title: 'All spools have been used',
      description: 'Nice! All your spools have some usage recorded.',
      showAction: false,
      actionText: '',
    },
  }

  const config = configs[type]
  const Icon = config.icon

  return (
    <div class="flex flex-col items-center justify-center py-16 px-4">
      {/* Illustration */}
      <div class="relative mb-6">
        {/* Background decoration */}
        <div class="absolute inset-0 -m-4 bg-[var(--accent-color)]/5 rounded-full blur-2xl" />

        {/* Icon container */}
        <div class="relative flex items-center justify-center w-24 h-24 rounded-2xl bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-tertiary)] border border-[var(--border-color)] shadow-lg">
          {/* Decorative dots */}
          <div class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[var(--accent-color)]/30" />
          <div class="absolute -bottom-2 -left-2 w-2 h-2 rounded-full bg-[var(--accent-color)]/20" />

          {/* Spool illustration for no-spools */}
          {type === 'no-spools' ? (
            <div class="relative">
              {/* Spool body */}
              <div class="w-14 h-14 rounded-full border-4 border-[var(--text-muted)]/30 flex items-center justify-center">
                <div class="w-6 h-6 rounded-full bg-[var(--text-muted)]/20 border-2 border-[var(--text-muted)]/30" />
              </div>
              {/* Plus icon overlay */}
              <div class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--accent-color)] flex items-center justify-center shadow-md">
                <span class="text-white text-lg font-bold leading-none">+</span>
              </div>
            </div>
          ) : (
            <Icon class="w-10 h-10 text-[var(--text-muted)]" strokeWidth={1.5} />
          )}
        </div>
      </div>

      {/* Text content */}
      <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-2 text-center">
        {config.title}
      </h3>
      <p class="text-sm text-[var(--text-muted)] text-center max-w-sm mb-6">
        {config.description}
      </p>

      {/* Action button */}
      {config.showAction && onAddSpool && (
        <button
          class="btn btn-primary"
          onClick={onAddSpool}
        >
          <Package class="w-4 h-4" />
          {config.actionText}
        </button>
      )}
    </div>
  )
}
