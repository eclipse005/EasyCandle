import type { Candle } from '@shared/candleUtils'
import {
  aggregateToTimeframe,
  buildImportTimeframes,
  IMPORT_CACHEABLE_TIMEFRAMES,
  IMPORT_DERIVED_TIMEFRAMES
} from '@shared/candleAggregate'
import { forexNyCloseOffsetSeconds, omitForexWeekendCandles } from '@shared/forexSession'
import { buildImportedDatasetMeta, statsForImportedSeries } from '@shared/importMeta'
import { TIMEFRAMES } from '@shared/timeframes'
import { decodeMtTextBuffer } from '@shared/mtTextDecode'
import type { BarReplayApi } from '@shared/appApi'
import type {
  ImportDeleteResult,
  ImportDialogResult,
  ImportListResult,
  ImportLoadRange,
  ImportLoadResult,
  ImportParseResult,
  ImportReadResult,
  ImportSaveParams,
  ImportSaveResult,
  ImportedDatasetMeta
} from '@shared/importTypes'
import type { ImportJobProgress } from '@shared/importJobProgress'
import { sliceCandleRange } from '@shared/importRange'
import {
  idbDeleteImportDataset,
  idbGet,
  idbGetAll,
  idbPut,
  idbWriteImportDataset
} from './importIdb'
import { isCsvDataTimezone, remapCandlesCsvTimezone } from '@shared/csvDataTimezone'
import {
  discardWebImportParse,
  onWebImportProgress,
  parseCsvInWebWorker,
  saveImportInWebWorker
} from './importWorkerClient'

const memoryMetas = new Map<string, ImportedDatasetMeta>()
const memoryCandles = new Map<string, Candle[]>()
const memorySources = new Map<string, string>()

// In-flight selected files cache for import modal
const pendingFileCache = new Map<string, { content?: string; file?: File; fileName: string }>()

/** Drop in-memory import fallbacks (Settings graded clear). */
export function clearImportMemoryCaches(): void {
  memoryMetas.clear()
  memoryCandles.clear()
  memorySources.clear()
  pendingFileCache.clear()
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'imp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

function rememberDataset(
  meta: ImportedDatasetMeta,
  content: string,
  candlesByTimeframe?: Record<string, Candle[]>
): void {
  memoryMetas.set(meta.id, meta)
  memorySources.set(meta.id, content)
  if (!candlesByTimeframe) return
  for (const [tf, series] of Object.entries(candlesByTimeframe)) {
    if (series?.length) memoryCandles.set(`${meta.id}:${tf}`, series)
  }
}

async function parseImportFile(path: string): Promise<ImportParseResult> {
  const cached = pendingFileCache.get(path)
  if (!cached?.file && !cached?.content) {
    return { ok: false, error: 'File content not found' }
  }

  try {
    let bytes: ArrayBuffer
    if (cached.file) {
      bytes = await cached.file.arrayBuffer()
    } else {
      bytes = new TextEncoder().encode(cached.content || '').buffer as ArrayBuffer
    }
    const parsed = await parseCsvInWebWorker(bytes, cached.fileName)
    if (parsed.ok) cached.file = undefined
    return parsed
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read selected file'
    return { ok: false, error: message }
  }
}

async function saveImportDataset(params: ImportSaveParams): Promise<ImportSaveResult> {
  try {
    if (!isCsvDataTimezone(params.dataTimezone)) {
      return { ok: false, error: 'Choose the CSV data timezone before saving.' }
    }

    if (params.parseToken) {
      const saved = await saveImportInWebWorker({ ...params, parseToken: params.parseToken })
      if (saved.ok) {
        memoryMetas.set(saved.meta.id, saved.meta)
      }
      return saved
    }

    let candlesByTimeframe = params.candlesByTimeframe
    if (candlesByTimeframe) {
      const remapped: Record<string, typeof candlesByTimeframe[string]> = {}
      for (const [tf, series] of Object.entries(candlesByTimeframe)) {
        remapped[tf] = remapCandlesCsvTimezone(series, params.dataTimezone)
      }
      candlesByTimeframe = remapped
    }
    const candles1m =
      candlesByTimeframe?.['1m'] ??
      remapCandlesCsvTimezone(params.candles1m ?? [], params.dataTimezone)
    if (!candles1m?.length || !candlesByTimeframe) {
      return { ok: false, error: 'Missing 1-minute candles for import.' }
    }

    let id = params.replaceId
    let createdAt: string | undefined
    let updated = false

    if (id) {
      const existing = (await idbGet<ImportedDatasetMeta>('metas', id)) || memoryMetas.get(id)
      if (!existing) {
        return { ok: false, error: 'Saved import not found for update.' }
      }
      createdAt = existing.createdAt
      updated = true
    } else {
      id = generateId()
    }

    const meta = buildImportedDatasetMeta({
      id,
      originalFileName: params.originalFileName,
      symbol: params.symbol,
      candlesByTimeframe,
      createdAt,
      origin: params.origin,
      contractSize: params.contractSize
    })

    const content = params.content ?? ''
    rememberDataset(meta, content, candlesByTimeframe)
    const wrote = await idbWriteImportDataset({ meta, content, candlesByTimeframe })
    if (!wrote.ok) {
      return { ok: false, error: wrote.error }
    }

    return { ok: true, meta, updated }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save import'
    return { ok: false, error: message }
  }
}

async function listImportDatasets(): Promise<ImportListResult> {
  try {
    let imports = await idbGetAll<ImportedDatasetMeta>('metas')
    if (!imports.length && memoryMetas.size > 0) {
      imports = Array.from(memoryMetas.values())
    }
    imports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return { ok: true, imports }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list imports'
    return { ok: false, error: message }
  }
}

async function loadCandleSeries(id: string, tf: string): Promise<Candle[] | null> {
  const key = `${id}:${tf}`
  const storedCandles = await idbGet<{ key: string; candles: Candle[] }>('candles', key)
  const candles = storedCandles?.candles || memoryCandles.get(key) || null
  if (!candles?.length) return candles
  // Already-saved Dukascopy files still contain the flat weekend fill.
  return omitForexWeekendCandles(candles)
}

async function persistTimeframeSeries(
  meta: ImportedDatasetMeta,
  timeframe: string,
  series: Candle[]
): Promise<ImportedDatasetMeta> {
  if (!series.length) return meta
  const key = `${meta.id}:${timeframe}`
  memoryCandles.set(key, series)
  await idbPut('candles', { key, candles: series })
  const nextMeta: ImportedDatasetMeta = {
    ...meta,
    timeframes: {
      ...meta.timeframes,
      [timeframe]: statsForImportedSeries(series)
    },
    updatedAt: new Date().toISOString()
  }
  memoryMetas.set(meta.id, nextMeta)
  await idbPut('metas', nextMeta)
  return nextMeta
}

/** Build + cache a missing TF from stored 1m (lazy TFs and migration gaps). */
async function ensureTimeframeSeries(
  meta: ImportedDatasetMeta,
  timeframe: string
): Promise<{ meta: ImportedDatasetMeta; candles: Candle[] } | null> {
  if (!TIMEFRAMES[timeframe]) return null
  const existing = await loadCandleSeries(meta.id, timeframe)
  if (existing?.length) {
    let nextMeta = meta
    if (meta.timeframes[timeframe] == null) {
      nextMeta = await persistTimeframeSeries(meta, timeframe, existing)
    }
    return { meta: nextMeta, candles: existing }
  }
  if (timeframe === '1m') return null
  const source1m = await loadCandleSeries(meta.id, '1m')
  if (!source1m?.length) return null
  const built = aggregateToTimeframe(source1m, timeframe)
  if (!built.length) return null
  const nextMeta = await persistTimeframeSeries(meta, timeframe, built)
  return { meta: nextMeta, candles: built }
}

/** Backfill missing precompute TFs (e.g. 30m) on old datasets in the background. */
export async function backfillMissingDerivedTimeframes(id: string): Promise<void> {
  try {
    const meta = (await idbGet<ImportedDatasetMeta>('metas', id)) || memoryMetas.get(id)
    if (!meta?.timeframes?.['1m']) return
    const missing = IMPORT_DERIVED_TIMEFRAMES.filter((tf) => meta.timeframes[tf] == null)
    if (!missing.length) return
    const source1m = await loadCandleSeries(id, '1m')
    if (!source1m?.length) return
    const built = buildImportTimeframes(source1m, forexNyCloseOffsetSeconds)
    let nextMeta = meta
    for (const tf of missing) {
      const series = built[tf]
      if (!series?.length) continue
      nextMeta = await persistTimeframeSeries(nextMeta, tf, series)
    }
  } catch {
    // Best-effort migration; switch path can still lazy-build.
  }
}

async function loadImportDataset(
  id: string,
  timeframe?: string,
  range?: ImportLoadRange
): Promise<ImportLoadResult> {
  try {
    let meta = (await idbGet<ImportedDatasetMeta>('metas', id)) || memoryMetas.get(id)
    if (!meta) return { ok: false, error: 'Saved import not found.' }

    const requested = String(timeframe || meta.timeframe || '1m')
    let tf = requested
    let stored = await loadCandleSeries(id, tf)

    if (!stored?.length && TIMEFRAMES[requested] && requested !== '1m' && meta.timeframes['1m']) {
      const ensured = await ensureTimeframeSeries(meta, requested)
      if (ensured) {
        meta = ensured.meta
        stored = ensured.candles
        tf = requested
      }
    }

    if (!stored?.length) {
      tf =
        meta.timeframes[requested] != null
          ? requested
          : meta.timeframes['1m'] != null
            ? '1m'
            : Object.keys(meta.timeframes)[0]
      if (!tf) return { ok: false, error: 'Imported dataset has no candle series.' }
      stored = await loadCandleSeries(id, tf)
    }

    if (!stored?.length) {
      return { ok: false, error: `No candles found for timeframe ${tf}.` }
    }

    // Same range contract as the desktop IPC handler used to provide, so the
    // store can page windows without knowing which backend it talks to.
    const sliced = sliceCandleRange(stored, range)

    const nextMeta: ImportedDatasetMeta = { ...meta, timeframe: tf }
    if (meta.timeframe !== tf) {
      memoryMetas.set(id, nextMeta)
      await idbPut('metas', nextMeta)
    }

    return { ok: true, meta: nextMeta, candles: sliced.candles, window: sliced.window }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load import'
    return { ok: false, error: message }
  }
}

async function deleteImportDataset(id: string): Promise<ImportDeleteResult> {
  try {
    memoryMetas.delete(id)
    memorySources.delete(id)
    for (const tf of IMPORT_CACHEABLE_TIMEFRAMES) {
      memoryCandles.delete(`${id}:${tf}`)
    }
    await idbDeleteImportDataset(id)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete import'
    return { ok: false, error: message }
  }
}

function promptCsvFileInput(): Promise<ImportDialogResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,.txt'
    input.multiple = true
    input.style.display = 'none'

    let handled = false

    const cleanup = () => {
      input.remove()
      window.removeEventListener('focus', onFocus)
    }

    const onFocus = () => {
      // Delay to allow change event to fire first if a file was selected
      setTimeout(() => {
        if (!handled) {
          handled = true
          cleanup()
          resolve({ ok: false, canceled: true })
        }
      }, 500)
    }

    input.onchange = async () => {
      if (handled) return
      handled = true
      cleanup()

      const list = input.files
      if (!list || list.length === 0) {
        resolve({ ok: false, canceled: true })
        return
      }

      try {
        const stamp = Date.now()
        const files: { path: string; fileName: string }[] = []
        for (let i = 0; i < list.length; i += 1) {
          const file = list.item(i)
          if (!file) continue
          const tempId =
            'file-' + stamp + '-' + i + '-' + Math.random().toString(36).slice(2, 7)
          pendingFileCache.set(tempId, { file, fileName: file.name })
          files.push({ path: tempId, fileName: file.name })
        }
        if (!files.length) {
          resolve({ ok: false, canceled: true })
          return
        }
        resolve({
          ok: true,
          files,
          path: files[0].path,
          fileName: files[0].fileName
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to read selected file'
        resolve({ ok: false, error: message })
      }
    }

    document.body.appendChild(input)
    window.addEventListener('focus', onFocus)
    input.click()
  })
}

export const webApi = {
  runtime: 'web' as const,
  getAppVersion: async (): Promise<string> => __APP_VERSION__,
  openImportDialog: promptCsvFileInput,
  parseImportFile,
  discardImportParse: async (token: string): Promise<{ ok: true }> => {
    await discardWebImportParse(token)
    return { ok: true }
  },
  onImportJobProgress: (callback: (progress: ImportJobProgress) => void): (() => void) =>
    onWebImportProgress(callback),
  readImportFile: async (path: string): Promise<ImportReadResult> => {
    const cached = pendingFileCache.get(path)
    if (cached?.content) {
      return { ok: true, content: cached.content, fileName: cached.fileName }
    }
    if (cached?.file) {
      try {
        const buffer = await cached.file.arrayBuffer()
        const content =
          typeof Buffer !== 'undefined'
            ? decodeMtTextBuffer(Buffer.from(buffer))
            : new TextDecoder('utf-8').decode(buffer)
        cached.content = content
        cached.file = undefined
        return { ok: true, content, fileName: cached.fileName }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to read selected file'
        return { ok: false, error: message }
      }
    }
    const sourceRecord = await idbGet<{ id: string; content: string }>('sources', path)
    if (sourceRecord) {
      return { ok: true, content: sourceRecord.content, fileName: 'imported.csv' }
    }
    return { ok: false, error: 'File content not found' }
  },
  saveImport: saveImportDataset,
  listImports: listImportDatasets,
  loadImport: loadImportDataset,
  deleteImport: deleteImportDataset
} satisfies BarReplayApi

// Inject when the host did not already expose an API.
if (typeof window !== 'undefined') {
  const w = window as unknown as { api?: BarReplayApi }
  if (!w.api) w.api = webApi
}
