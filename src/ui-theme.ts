export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
const STORAGE_KEY = 'visro-theme';

export function getThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch { /* Theme defaults remain usable when storage is unavailable. */ }
  return 'system';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  try { localStorage.setItem(STORAGE_KEY, preference); } catch { /* Apply even without persistence. */ }
  return applyTheme(preference);
}

/** Re-apply system appearance only when the user chose system synchronization. */
export function watchSystemTheme(onChange?: (theme: ResolvedTheme) => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => {
    if (getThemePreference() === 'system') {
      const resolved = applyTheme('system');
      onChange?.(resolved);
    }
  };
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
