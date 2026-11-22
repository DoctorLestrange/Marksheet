import { Moon, Plus, Sun } from 'lucide-react';
import type { ThemeMode } from '../utils/theme';

export type ActiveTab = 'calculator' | 'history' | 'settings';

interface TopBarProps {
  activeTab: ActiveTab;
  historyCount: number;
  theme: ThemeMode;
  onSelectTab: (tab: ActiveTab) => void;
  onToggleTheme: () => void;
  onStartNewSession: () => void;
}

export function TopBar({
  activeTab,
  historyCount,
  theme,
  onSelectTab,
  onToggleTheme,
  onStartNewSession,
}: TopBarProps) {
  const navItems: { id: ActiveTab; label: string; badgeCount?: number }[] = [
    { id: 'calculator', label: 'Calculator' },
    { id: 'history', label: 'History', badgeCount: historyCount > 0 ? historyCount : undefined },
    { id: 'settings', label: 'Settings' },
  ];

  const isDark = theme === 'dark';

  return (
    <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-sm border-b border-[#E2E6EC] dark:border-[#2E2E32]">
      <div className="max-w-[1200px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-8">
        {/* Zone 1: Single-element brand wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('calculator')}
          className="font-display text-[15px] sm:text-lg font-bold tracking-tight text-[#0F172A] dark:text-[#F2F2F4] hover:text-[#1D4ED8] dark:hover:text-[#D4D4D8] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] dark:focus-visible:ring-[#A1A1AA] rounded"
        >
          Marksheet
        </button>

        {/* Zone 2: Clean single-line navigation tabs */}
        <nav aria-label="Primary" className="flex items-center gap-2.5 sm:gap-7 h-full">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(item.id)}
                className={`relative h-full inline-flex items-center text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] dark:focus-visible:ring-[#A1A1AA] rounded-sm ${
                  isActive
                    ? 'text-[#0F172A] dark:text-[#F2F2F4]'
                    : 'text-[#5B6576] dark:text-[#9E9EA6] hover:text-[#0F172A] dark:hover:text-[#F2F2F4]'
                }`}
              >
                <span>
                  {item.label}
                  {item.badgeCount !== undefined && (
                    <span className="hidden sm:inline"> ({item.badgeCount})</span>
                  )}
                </span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#1D4ED8] dark:bg-[#F2F2F4]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Theme switch + primary action */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg border border-[#E2E6EC] dark:border-[#323236] bg-[#F8FAFC] dark:bg-[#242427] text-[#475569] dark:text-[#D4D4D8] hover:text-[#0F172A] dark:hover:text-[#F2F2F4] hover:bg-[#F1F5F9] dark:hover:bg-[#2E2E32] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] dark:focus-visible:ring-[#A1A1AA]"
          >
            {isDark ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            aria-label="New Session"
            onClick={onStartNewSession}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white dark:text-[#141415] bg-[#1D4ED8] dark:bg-[#F2F2F4] hover:bg-[#1E40AF] dark:hover:bg-[#E4E4E7] active:scale-[0.99] rounded-lg transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] dark:focus-visible:ring-[#A1A1AA] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1C1C1E]"
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
