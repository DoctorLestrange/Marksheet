import { Plus } from 'lucide-react';

export type ActiveTab = 'calculator' | 'history' | 'settings';

interface TopBarProps {
  activeTab: ActiveTab;
  historyCount: number;
  onSelectTab: (tab: ActiveTab) => void;
  onStartNewSession: () => void;
}

export function TopBar({
  activeTab,
  historyCount,
  onSelectTab,
  onStartNewSession,
}: TopBarProps) {
  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'calculator', label: 'Calculator' },
    { id: 'history', label: historyCount > 0 ? `History (${historyCount})` : 'History' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-[#E2E6EC]">
      <div className="max-w-[1200px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-8">
        {/* Zone 1: Single-element brand wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('calculator')}
          className="font-display text-base sm:text-lg font-bold tracking-tight text-[#0F172A] hover:text-[#1D4ED8] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] rounded"
        >
          Marksheet
        </button>

        {/* Zone 2: Clean single-line navigation tabs */}
        <nav aria-label="Primary" className="flex items-center gap-3 sm:gap-7 h-full">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(item.id)}
                className={`relative h-full inline-flex items-center text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] rounded-sm ${
                  isActive
                    ? 'text-[#0F172A]'
                    : 'text-[#5B6576] hover:text-[#0F172A]'
                }`}
              >
                <span>{item.label}</span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#1D4ED8]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            aria-label="New Session"
            onClick={onStartNewSession}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] active:scale-[0.99] rounded-lg transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] focus-visible:ring-offset-2"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">New Session</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>
    </header>
  );
}
