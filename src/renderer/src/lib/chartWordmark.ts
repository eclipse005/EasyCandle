import wordmarkSvg from '@/assets/barreplay-wordmark.svg?raw'
import type { Theme } from '@/lib/theme'

/** Dark-theme Bar fill baked into barreplay-wordmark.svg. */
const DARK_BAR_FILL = '#F7F7F5'
const LIGHT_BAR_FILL = '#18181B'
const BAR_TSPAN = /(<tspan fill=")#[A-Fa-f0-9]{6}(">Bar<\/tspan>)/

/** Wordmark SVG with Bar recolored so it stays visible on the chart background. */
export function themedWordmarkUrl(theme: Theme): string {
  const fill = theme === 'light' ? LIGHT_BAR_FILL : DARK_BAR_FILL
  const svg = wordmarkSvg.replace(BAR_TSPAN, `$1${fill}$2`)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
