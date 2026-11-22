import type { StorageLike } from './storage';

export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'marksheet_theme_v1';

export function loadStoredTheme(
  storage?: StorageLike | null,
  prefersDarkFallback?: boolean
): ThemeMode {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  try {
    const saved = target?.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
  } catch {
    // Ignore storage read restrictions and fall back to system preference
  }

  if (typeof prefersDarkFallback === 'boolean') {
    return prefersDarkFallback ? 'dark' : 'light';
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return 'light';
}

export function saveStoredTheme(theme: ThemeMode, storage?: StorageLike | null): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  try {
    target?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage write errors
  }
}

export function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', theme === 'dark' ? '#141415' : '#F6F7F9');
  }
}

export function triggerFileDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Defer revocation so browsers finish reading the blob before cleanup
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
