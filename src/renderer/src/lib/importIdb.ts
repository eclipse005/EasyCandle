import type { Candle } from '@shared/candleUtils'
import { IMPORT_CACHEABLE_TIMEFRAMES, IMPORT_STORED_TIMEFRAMES } from '@shared/candleAggregate'
import type { ImportedDatasetMeta } from '@shared/importTypes'

const DB_NAME = 'barreplay_db'
/** Bump: 2 = week open Sun NY17 — drop Monday-bucketed 1w caches so they re-aggregate. */
const DB_VERSION = 2

export type IdbWriteResult = { ok: true } | { ok: false; error: string }

function formatIdbError(err: unknown, fallback: string): string {
  if (err instanceof DOMException) {
    const detail = err.message?.trim()
    return detail ? `${err.name}: ${detail}` : err.name || fallback
  }
  if (err instanceof Error) {
    const detail = err.message?.trim()
    return detail ? detail : err.name || fallback
  }
  return fallback
}

export function openImportDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = request.result
      const tx = request.transaction
      if (!db.objectStoreNames.contains('metas')) {
        db.createObjectStore('metas', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('candles')) {
        db.createObjectStore('candles', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('sources')) {
        db.createObjectStore('sources', { keyPath: 'id' })
      }
      // week open Sun NY17 — invalidate cached 1w series + meta stats.
      // Key cursor only. A value cursor structured-clones every series, including
      // the 1m blob, and that upgrade transaction blocks every later open.
      if (event.oldVersion < 2 && tx) {
        if (db.objectStoreNames.contains('candles')) {
          const candleStore = tx.objectStore('candles')
          const cursorReq = candleStore.openKeyCursor()
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result
            if (!cursor) return
            const key = String(cursor.key)
            if (key.endsWith(':1w')) cursor.delete()
            cursor.continue()
          }
        }
        if (db.objectStoreNames.contains('metas')) {
          const metaStore = tx.objectStore('metas')
          const cursorReq = metaStore.openCursor()
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result
            if (!cursor) return
            const meta = cursor.value as ImportedDatasetMeta
            if (meta?.timeframes && Object.prototype.hasOwnProperty.call(meta.timeframes, '1w')) {
              const nextTf = { ...meta.timeframes }
              delete nextTf['1w']
              cursor.update({ ...meta, timeframes: nextTf })
            }
            cursor.continue()
          }
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
}

export async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  let db: IDBDatabase | null = null
  try {
    db = await openImportDb()
    return await new Promise((resolve) => {
      const tx = db!.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.get(key)
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  } finally {
    db?.close()
  }
}

export async function idbPut(storeName: string, value: unknown): Promise<boolean> {
  let db: IDBDatabase | null = null
  try {
    db = await openImportDb()
    return await new Promise((resolve) => {
      const tx = db!.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.put(value)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  } finally {
    db?.close()
  }
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  let db: IDBDatabase | null = null
  try {
    db = await openImportDb()
    return await new Promise((resolve) => {
      const tx = db!.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.getAll()
      req.onsuccess = () => resolve((req.result as T[]) || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  } finally {
    db?.close()
  }
}

export async function idbDelete(storeName: string, key: string): Promise<boolean> {
  let db: IDBDatabase | null = null
  try {
    db = await openImportDb()
    return await new Promise((resolve) => {
      const tx = db!.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.delete(key)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  } finally {
    db?.close()
  }
}

/** One transaction: meta + optional source CSV + every stored timeframe series. */
export async function idbWriteImportDataset(params: {
  meta: ImportedDatasetMeta
  content: string
  candlesByTimeframe: Record<string, Candle[]>
}): Promise<IdbWriteResult> {
  let db: IDBDatabase | null = null
  try {
    db = await openImportDb()
    return await new Promise((resolve) => {
      let requestError: DOMException | null = null
      const tx = db!.transaction(['metas', 'sources', 'candles'], 'readwrite')
      const track = (req: IDBRequest): void => {
        req.onerror = () => {
          requestError = req.error
        }
      }
      track(tx.objectStore('metas').put(params.meta))
      // Persist CSV only when small enough — large MT4 dumps blow quota / abort the tx.
      // Candles are the source of truth for replay; raw CSV is optional provenance.
      const MAX_SOURCE_CHARS = 1_500_000
      const sourceContent =
        params.content && params.content.length <= MAX_SOURCE_CHARS ? params.content : ''
      track(tx.objectStore('sources').put({ id: params.meta.id, content: sourceContent }))
      const candleStore = tx.objectStore('candles')
      const tfIds = new Set<string>([
        ...IMPORT_STORED_TIMEFRAMES,
        ...Object.keys(params.candlesByTimeframe)
      ])
      for (const tf of tfIds) {
        const series = params.candlesByTimeframe[tf]
        if (!series) continue
        track(candleStore.put({ key: `${params.meta.id}:${tf}`, candles: series }))
      }
      tx.oncomplete = () => resolve({ ok: true })
      tx.onerror = () =>
        resolve({
          ok: false,
          error: formatIdbError(
            requestError ?? tx.error,
            'Failed to save import to IndexedDB.'
          )
        })
      tx.onabort = () =>
        resolve({
          ok: false,
          error: formatIdbError(
            requestError ?? tx.error,
            'IndexedDB write aborted (often quota or private mode).'
          )
        })
    })
  } catch (err) {
    return {
      ok: false,
      error: formatIdbError(err, 'Failed to save import to IndexedDB.')
    }
  } finally {
    db?.close()
  }
}

export async function idbDeleteImportDataset(id: string): Promise<boolean> {
  let db: IDBDatabase | null = null
  try {
    db = await openImportDb()
    return await new Promise((resolve) => {
      const tx = db!.transaction(['metas', 'sources', 'candles'], 'readwrite')
      tx.objectStore('metas').delete(id)
      tx.objectStore('sources').delete(id)
      const candleStore = tx.objectStore('candles')
      for (const tf of IMPORT_CACHEABLE_TIMEFRAMES) {
        candleStore.delete(`${id}:${tf}`)
      }
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    })
  } catch {
    return false
  } finally {
    db?.close()
  }
}

/** Clear every import object store (metas / candles / sources). */
export async function idbClearAllImportStores(): Promise<boolean> {
  let db: IDBDatabase | null = null
  try {
    db = await openImportDb()
    return await new Promise((resolve) => {
      const tx = db!.transaction(['metas', 'sources', 'candles'], 'readwrite')
      tx.objectStore('metas').clear()
      tx.objectStore('sources').clear()
      tx.objectStore('candles').clear()
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    })
  } catch {
    return false
  } finally {
    db?.close()
  }
}
