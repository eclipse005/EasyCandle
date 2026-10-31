/**
 * Import progress contract shared by workers, IPC, and the progress bar UI.
 *
 * Build stages match the confirm-modal bar:
 * 0–48% 5m, 50% 15m, 52% 30m, 55% 1h, 58% 4h, 61% 1d, 63% ready,
 * 78% saving, 94% loading chart, 100% done.
 */

export const IMPORT_WORKER_PROGRESS_EVERY = 50_000

export const IMPORT_BUILD_UI_PERCENT = {
  tf5mStart: 0,
  tf5mEnd: 48,
  tf15m: 50,
  tf30m: 52,
  tf1h: 55,
  tf4h: 58,
  tf1d: 61,
  ready: 63,
  saving: 78,
  loadingChart: 94,
  done: 100
} as const

export const IMPORT_BUILD_STAGE_PERCENT: Record<string, number> = {
  '5m': IMPORT_BUILD_UI_PERCENT.tf5mEnd,
  '15m': IMPORT_BUILD_UI_PERCENT.tf15m,
  '30m': IMPORT_BUILD_UI_PERCENT.tf30m,
  '1h': IMPORT_BUILD_UI_PERCENT.tf1h,
  '4h': IMPORT_BUILD_UI_PERCENT.tf4h,
  '1d': IMPORT_BUILD_UI_PERCENT.tf1d
}

export type ImportJobKind = 'parse' | 'build' | 'save'

export type ImportJobProgress = {
  job: ImportJobKind
  phase: string
  percent: number
  processedRows?: number
  totalRows?: number
}
