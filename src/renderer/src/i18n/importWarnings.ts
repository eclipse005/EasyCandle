import type { MessageKey } from '@/i18n/messages'

type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string

/** Map parser warning codes (or legacy English essays) to UI copy. */
export function translateImportWarnings(warnings: string[], t: TFn): string[] {
  const out: string[] = []
  for (const raw of warnings) {
    const w = String(raw || '').trim()
    if (!w) continue
    if (w.startsWith('Will build ') || w.startsWith('Timestamps include ')) continue
    if (w.startsWith('skipped:')) {
      out.push(t('importConfirm.warnSkipped', { count: w.slice('skipped:'.length) }))
      continue
    }
    if (w === 'symbol_missing' || w.startsWith('Symbol not found')) {
      out.push(t('importConfirm.warnSymbolMissing'))
      continue
    }
    if (w.startsWith('Skipped ')) {
      const m = /^Skipped (\d+)/.exec(w)
      out.push(t('importConfirm.warnSkipped', { count: m?.[1] ?? '?' }))
      continue
    }
    out.push(w)
  }
  return out
}
