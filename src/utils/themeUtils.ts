export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'crm_leads_panel_theme';

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') {
    return saved;
  }
  
  // Si no hay preferencia guardada, verificar preferencia del sistema
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  
  return 'light';
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Manejo seguro en caso de bloqueo de cookies/storage
  }
}
