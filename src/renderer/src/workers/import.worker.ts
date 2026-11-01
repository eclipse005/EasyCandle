import { aggregateToTimeframe } from '@shared/candleAggregate'
import { buildImportedDatasetMeta, statsForImportedSeries } from '@shared/importMeta'
import { IMPORT_BUILD_UI_PERCENT } from '@shared/importJobProgress'
import {
  buildImportTimeframesJob,
  clientParseResult,
  parseImportBytes
} from '@shared/importWorkerJob'
import type { Candle } from '@shared/candleUtils'
import { isCsvDataTimezone, remapCandlesCsvTimezone } from '@shared/csvDataTimezone'
import { omitForexWeekendCandles } from '@shared/forexSession'
import { sliceCandleRange } from '@shared/importRange'
import { TIMEFRAMES } from '@shared/timeframes'
import type { ImportWorkerInbound, ImportWorkerOutbound } from '@shared/importWorkerProtocol'
import { idbGet, idbPut, idbWriteImportDataset } from '../lib/importIdb'
import type { ImportLoadRange, ImportLoadResult, ImportedDatasetMeta } from '@shared/importTypes'

type ImportWorkerScope = {
  postMessage: (message: ImportWorkerOutbound) => void
  onmessage:
    | ((
        event: MessageEvent<
          ImportWorkerInbound | { type: 'discard'; requestId: number; token: string }
        >
      ) => void)
    | null
}

const workerSelf = self as unknown as ImportWorkerScope

type StoredParse = {
  token: string
  content: string
  candles: Candle[]
  fileName: string
}

let stored: StoredParse | null = null

/**
 * Dataset service state. Full series live here, off the UI thread, so a cold
 * window read only ships the requested bars to the main thread.
 */
const metaCache = new Map<string, ImportedDatasetMeta>()
const seriesCache = new Map<string, Candle[]>()
const seriesJobs = new Map<string, Promise<Candle[] | null>>()

function post(message: ImportWorkerOutbound): void {
  workerSelf.postMessage(message)
}

function dropSeriesCache(id: string): void {
  const prefix = `${id}:`
  for (const key of seriesCache.keys()) {
    if (key.startsWith(prefix)) seriesCache.delete(key)
  }
}

function dropCache(id?: string): void {
  if (!id) {
    metaCache.clear()
    seriesCache.clear()
    return
  }
  metaCache.delete(id)
  dropSeriesCache(id)
}

async function getMeta(id: string): Promise<ImportedDatasetMeta | null> {
  const cached = metaCache.get(id)
  if (cached) return cached
  const meta = await idbGet<ImportedDatasetMeta>('metas', id)
  if (meta) metaCache.set(id, meta)
  return meta
}

async function putMeta(meta: ImportedDatasetMeta): Promise<void> {
  metaCache.set(meta.id, meta)
  await idbPut('metas', meta)
}

/**
 * Stored series for a timeframe, building + persisting lazy timeframes on
 * first use. Concurrent callers share one job per `id:tf`.
 */
function ensureSeries(meta: ImportedDatasetMeta, timeframe: string): Promise<Candle[] | null> {
  const key = `${meta.id}:${timeframe}`
  const cached = seriesCache.get(key)
  if (cached?.length) return Promise.resolve(cached)
  const running = seriesJobs.get(key)
  if (running) return running

  const job = (async () => {
    const record = await idbGet<{ key: string; candles: Candle[] }>('candles', key)
    const stored = record?.candles
    if (stored?.length) {
      seriesCache.set(key, stored)
      return stored
    }
    if (timeframe === '1m' || !TIMEFRAMES[timeframe]) return null

    const current = metaCache.get(meta.id) ?? meta
    if (current.timeframes?.['1m'] == null) return null
    const source = await ensureSeries(current, '1m')
    if (!source?.length) return null
    const built = aggregateToTimeframe(source, timeframe)
    if (!built.length) return null

    seriesCache.set(key, built)
    const latest = metaCache.get(meta.id) ?? current
    await putMeta({
      ...latest,
      timeframes: { ...latest.timeframes, [timeframe]: statsForImportedSeries(built) },
      updatedAt: new Date().toISOString()
    })
    return built
  })().finally(() => {
    seriesJobs.delete(key)
  })

  seriesJobs.set(key, job)
  return job
}

async function loadImportJob(
  id: string,
  timeframe?: string,
  range?: ImportLoadRange
): Promise<ImportLoadResult> {
  try {
    let meta = await getMeta(id)
    if (!meta) return { ok: false, error: 'Saved import not found.' }

    const requested = String(timeframe || meta.timeframe || '1m')
    let tf = requested
    let stored = await ensureSeries(meta, tf)

    if (!stored?.length) {
      tf =
        meta.timeframes[requested] != null
          ? requested
          : meta.timeframes['1m'] != null
            ? '1m'
            : Object.keys(meta.timeframes)[0]
      if (!tf) return { ok: false, error: 'Imported dataset has no candle series.' }
      stored = await ensureSeries(meta, tf)
    }

    if (!stored?.length) {
      return { ok: false, error: `No candles found for timeframe ${tf}.` }
    }

    const sliced = sliceCandleRange(stored, range)
    // A lazy build may have refreshed this meta (new timeframe stats).
    meta = metaCache.get(id) ?? meta
    const nextMeta: ImportedDatasetMeta = { ...meta, timeframe: tf }
    if (meta.timeframe !== tf) await putMeta(nextMeta)

    return { ok: true, meta: nextMeta, candles: sliced.candles, window: sliced.window }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load import'
    return { ok: false, error: message }
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'imp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

workerSelf.onmessage = (
  event: MessageEvent<ImportWorkerInbound | { type: 'discard'; requestId: number; token: string }>
) => {
  const message = event.data
  const requestId = message.requestId
  void handle(message, requestId)
}

async function handle(
  message: ImportWorkerInbound | { type: 'discard'; requestId: number; token: string },
  requestId: number
): Promise<void> {
  try {
    if (message.type === 'parse') {
      const { result, content } = parseImportBytes(message.bytes, message.fileName, (progress) => {
        post({ type: 'progress', requestId, progress })
      })
      if (!result.ok) {
        stored = null
        post({ type: 'parseResult', requestId, result })
        return
      }
      const token = generateId()
      stored = { token, content, candles: result.candles, fileName: message.fileName }
      post({
        type: 'parseResult',
        requestId,
        result: clientParseResult(result, token)
      })
      return
    }

    if (message.type === 'save') {
      if (!stored || stored.token !== message.token) {
        post({
          type: 'error',
          requestId,
          error: 'Import parse expired. Select the CSV again.'
        })
        return
      }

      if (!isCsvDataTimezone(message.dataTimezone)) {
        post({
          type: 'error',
          requestId,
          error: 'Choose the CSV data timezone before saving.'
        })
        return
      }

      const candles1m = omitForexWeekendCandles(
        remapCandlesCsvTimezone(stored.candles, message.dataTimezone)
      )
      const candlesByTimeframe = buildImportTimeframesJob(candles1m, (progress) => {
        post({ type: 'progress', requestId, progress })
      })

      post({
        type: 'progress',
        requestId,
        progress: {
          job: 'save',
          phase: 'Saving…',
          percent: IMPORT_BUILD_UI_PERCENT.saving
        }
      })

      let id = message.replaceId
      let createdAt: string | undefined
      let updated = false

      if (id) {
        const existing = await idbGet<ImportedDatasetMeta>('metas', id)
        if (!existing) {
          post({
            type: 'saveResult',
            requestId,
            result: { ok: false, error: 'Saved import not found for update.' }
          })
          return
        }
        createdAt = existing.createdAt
        updated = true
      } else {
        id = generateId()
      }

      const meta = buildImportedDatasetMeta({
        id,
        originalFileName: message.originalFileName,
        symbol: message.symbol,
        candlesByTimeframe,
        createdAt,
        origin: message.origin,
        contractSize: message.contractSize
      })

      const wrote = await idbWriteImportDataset({
        meta,
        content: stored.content,
        candlesByTimeframe
      })
      if (!wrote.ok) {
        // Keep parse token so the user can retry without re-selecting the CSV.
        post({
          type: 'saveResult',
          requestId,
          result: { ok: false, error: wrote.error }
        })
        return
      }
      stored = null
      metaCache.set(meta.id, meta)
      dropSeriesCache(meta.id)
      post({ type: 'saveResult', requestId, result: { ok: true, meta, updated } })
      return
    }

    if (message.type === 'load') {
      const result = await loadImportJob(message.id, message.timeframe, message.range)
      post({ type: 'loadResult', requestId, result })
      return
    }

    if (message.type === 'dropCache') {
      dropCache(message.id)
      return
    }

    if (message.type === 'discard') {
      if (stored?.token === message.token) stored = null
      return
    }

    post({ type: 'error', requestId, error: `Unsupported worker job: ${message.type}` })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Import worker failed'
    post({ type: 'error', requestId, error })
  }
}
