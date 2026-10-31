import wordmarkSvg from '@/assets/barreplay-wordmark.svg?raw'
import type { Theme } from '@/lib/theme'

/** Dark-theme Candle fill baked into barreplay-wordmark.svg. */
const DARK_CANDLE_FILL = '#F7F7F5'
const LIGHT_CANDLE_FILL = '#18181B'
const CANDLE_TSPAN = /(<tspan fill=")#[A-Fa-f0-9]{6}(">Candle<\/tspan>)/

/** Wordmark SVG with Candle recolored so it stays visible on the chart background. */
export function themedWordmarkUrl(theme: Theme): string {
  const fill = theme === 'light' ? LIGHT_CANDLE_FILL : DARK_CANDLE_FILL
  const svg = wordmarkSvg.replace(CANDLE_TSPAN, `$1${fill}$2`)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
