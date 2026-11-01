import { buildImportedDatasetMeta } from '@shared/importMeta'
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
import { idbDeleteImportDataset, idbGet, idbGetAll, idbWriteImportDataset } from './importIdb'
import { isCsvDataTimezone, remapCandlesCsvTimezone } from '@shared/csvDataTimezone'
import {
  discardWebImportParse,
  dropImportCachesInWebWorker,
  loadImportInWebWorker,
  onWebImportProgress,
  parseCsvInWebWorker,
  saveImportInWebWorker
} from './importWorkerClient'

const memoryMetas = new Map<string, ImportedDatasetMeta>()
const memorySources = new Map<string, string>()
let importListCache: ImportedDatasetMeta[] | null = null

// In-flight selected files cache for import modal
const pendingFileCache = new Map<string, { content?: string; file?: File; fileName: string }>()

function invalidateImportList(): void {
  importListCache = null
}

/** Keep the list entry in sync without re-reading IDB (lazy TF stats, timeframe). */
function cacheMeta(meta: ImportedDatasetMeta): void {
  memoryMetas.set(meta.id, meta)
  if (!importListCache) return
  const idx = importListCache.findIndex((item) => item.id === meta.id)
  if (idx < 0) return
  importListCache = importListCache
    .map((item) => (item.id === meta.id ? meta : item))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Drop in-memory import fallbacks (Settings graded clear). */
export function clearImportMemoryCaches(): void {
  memoryMetas.clear()
  memorySources.clear()
  pendingFileCache.clear()
  invalidateImportList()
  dropImportCachesInWebWorker()
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'imp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

function rememberDataset(meta: ImportedDatasetMeta, content: string): void {
  memoryMetas.set(meta.id, meta)
  memorySources.set(meta.id, content)
  invalidateImportList()
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
        invalidateImportList()
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
    rememberDataset(meta, content)
    const wrote = await idbWriteImportDataset({ meta, content, candlesByTimeframe })
    if (!wrote.ok) {
      return { ok: false, error: wrote.error }
    }
    dropImportCachesInWebWorker(meta.id)

    return { ok: true, meta, updated }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save import'
    return { ok: false, error: message }
  }
}

async function listImportDatasets(): Promise<ImportListResult> {
  if (importListCache) return { ok: true, imports: importListCache }
  try {
    let imports = await idbGetAll<ImportedDatasetMeta>('metas')
    if (!imports.length && memoryMetas.size > 0) {
      imports = Array.from(memoryMetas.values())
    }
    imports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    importListCache = imports
    return { ok: true, imports }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list imports'
    return { ok: false, error: message }
  }
}

/**
 * Reads run in the import worker: it owns the series cache and materializes
 * only the requested window, so IDB deserialization never blocks the chart.
 */
async function loadImportDataset(
  id: string,
  timeframe?: string,
  range?: ImportLoadRange
): Promise<ImportLoadResult> {
  const result = await loadImportInWebWorker(id, timeframe, range)
  if (result.ok) cacheMeta(result.meta)
  return result
}

async function deleteImportDataset(id: string): Promise<ImportDeleteResult> {
  try {
    invalidateImportList()
    memoryMetas.delete(id)
    memorySources.delete(id)
    await idbDeleteImportDataset(id)
    // After the delete, so an in-flight load cannot repopulate a stale series.
    dropImportCachesInWebWorker(id)
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
