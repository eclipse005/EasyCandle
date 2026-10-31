/**
 * Soft* design tokens — single source for colors, radius, type, spacing.
 * Prefer these class fragments over magic numbers in Soft* and dashboard pages.
 * Values mirror CSS vars in main.css + TYPOGRAPHY / UI_TOKENS in theme.ts.
 */

/** Surfaces */
export const softSurface = {
  page: 'bg-zinc-950 text-zinc-200',
  card: 'rounded-2xl border border-white/[0.06] bg-zinc-900/45 shadow-lg shadow-black/15',
  cardElevated: 'rounded-2xl border border-white/[0.06] bg-zinc-900/70 shadow-lg shadow-black/15',
  hairline: 'border-white/[0.06]',
  hairlineStrong: 'border-white/10',
  inset: 'rounded-2xl border border-white/[0.05] bg-zinc-950/50'
} as const

/** Type roles (Tailwind fontSize extensions from theme). */
export const softType = {
  pageTitle: 'text-page-title text-zinc-50',
  metric: 'text-metric font-bold tabular-nums text-zinc-50',
  section: 'text-section text-zinc-100',
  cardTitle: 'text-card-title text-zinc-100',
  body: 'text-body text-zinc-200',
  bodyMuted: 'text-body text-zinc-400',
  tab: 'text-tab font-medium',
  caption: 'text-caption text-zinc-500',
  micro: 'text-micro text-zinc-600'
} as const

/** Spacing rhythm used by Soft* chrome. */
export const softSpace = {
  pageX: 'px-5',
  pageY: 'py-6',
  cardPad: 'px-8 py-8',
  cardPadSm: 'px-7 py-7',
  sectionGap: 'space-y-10',
  stackGap: 'space-y-7',
  rowGap: 'gap-6'
} as const

/** Nav / pill active states (FXR soft SaaS). */
export const softNav = {
  pillActive: 'bg-zinc-800/80 text-zinc-50 shadow-sm shadow-black/20',
  pillIdle: 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200',
  tabActive: 'text-zinc-50',
  tabIdle: 'text-zinc-500 hover:text-zinc-300',
  tabUnderline: 'absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-zinc-100'
} as const

/** Motion durations / easings (mirror CSS vars in main.css). Pure CSS — no framer. */
export const softMotion = {
  /** class fragments using CSS custom properties */
  fast: 'duration-[var(--motion-fast)] ease-[var(--ease-out)]',
  tab: 'duration-[var(--motion-tab)] ease-[var(--ease-out)]',
  expand: 'duration-[var(--motion-expand)] ease-[var(--ease-out)]',
  /** combined transition helpers */
  colorsFast: 'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)]',
  press: 'transition-[colors,transform,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)]',
  expandGrid: 'transition-[grid-template-rows] duration-[var(--motion-expand)] ease-[var(--ease-out)]',
  underline: 'transition-[left,width] duration-[var(--motion-tab)] ease-[var(--ease-out)]',
  indicator: 'transition-[opacity,transform] duration-[var(--motion-fast)] ease-[var(--ease-out)]'
} as const

