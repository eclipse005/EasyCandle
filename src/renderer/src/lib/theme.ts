export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'bar-replay:theme'

/** FX Replay–aligned UI tokens (dark canvas). Interactive chrome uses primary blue; wordmark may stay amber. */
export const UI_TOKENS = {
  page: '#030303',
  card: '#131415',
  /** FX Replay hairline (#414347); prefer white/10 or softBorder for chrome. */
  border: '#414347',
  softBorder: 'rgba(255,255,255,0.06)',
  primary: '#0260FD',
  up: '#06A77D',
  down: '#ED6A5A',
  title: '#f4f4f5',
  secondary: '#a1a1aa',
  muted: '#71717a'
} as const

export type ChartPalette = {
  background: string
  text: string
  grid: string
  scaleBorder: string
  watermark: string
  handleFill: string
  hintFill: string
  hintStroke: string
  hintText: string
}

export const CHART_PALETTES: Record<Theme, ChartPalette> = {
  dark: {
    background: UI_TOKENS.page,
    text: '#a1a1aa',
    grid: '#1c1d1f',
    scaleBorder: UI_TOKENS.border,
    watermark: 'rgba(255, 255, 255, 0.05)',
    handleFill: UI_TOKENS.card,
    hintFill: '#1a1d24',
    hintStroke: UI_TOKENS.border,
    hintText: '#e5e7eb'
  },
  light: {
    background: '#fafafa',
    text: '#52525b',
    grid: '#e4e4e7',
    scaleBorder: '#d4d4d8',
    watermark: 'rgba(0, 0, 0, 0.06)',
    handleFill: '#ffffff',
    hintFill: '#f4f4f5',
    hintStroke: '#d4d4d8',
    hintText: '#3f3f46'
  }
}

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

export function getStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (isTheme(raw)) return raw
  } catch {
    // ignore quota / private mode / missing storage
  }
  return 'dark'
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore quota / private mode
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export function toggleTheme(): Theme {
  const next: Theme = getStoredTheme() === 'light' ? 'dark' : 'light'
  persistTheme(next)
  applyTheme(next)
  return next
}
