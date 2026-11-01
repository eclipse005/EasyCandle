import type { Candle } from './candleUtils'
import type { ImportJobProgress } from './importJobProgress'
import type {
  ImportLoadRange,
  ImportLoadResult,
  ImportOrigin,
  ImportParseResult,
  ImportSaveResult
} from './importTypes'

export type ImportWorkerParseRequest = {
  type: 'parse'
  requestId: number
  fileName: string
  bytes: ArrayBuffer
}

export type ImportWorkerBuildRequest = {
  type: 'build'
  requestId: number
  candles: Candle[]
}

export type ImportWorkerSaveRequest = {
  type: 'save'
  requestId: number
  token: string
  symbol: string
  originalFileName: string
  /** Explicit CSV data timezone — remaps provisional walls before build/save. */
  dataTimezone: string
  replaceId?: string
  origin?: ImportOrigin
  /** Units per 1.0 lot from the import form (issue #51). */
  contractSize?: number
}

export type ImportWorkerLoadRequest = {
  type: 'load'
  requestId: number
  id: string
  timeframe?: string
  range?: ImportLoadRange
}

/** Drop the worker's in-memory series/meta cache (delete, replace, clear). */
export type ImportWorkerDropCacheMessage = {
  type: 'dropCache'
  requestId: number
  id?: string
}

export type ImportWorkerInbound =
  | ImportWorkerParseRequest
  | ImportWorkerBuildRequest
  | ImportWorkerSaveRequest
  | ImportWorkerLoadRequest
  | ImportWorkerDropCacheMessage

export type ImportWorkerJob = ImportWorkerInbound extends infer T
  ? T extends { requestId: number }
    ? Omit<T, 'requestId'>
    : never
  : never

export type ImportWorkerProgressMessage = {
  type: 'progress'
  requestId: number
  progress: ImportJobProgress
}

export type ImportWorkerParseMessage = {
  type: 'parseResult'
  requestId: number
  result: ImportParseResult
  /** Decoded CSV text — Node host stores this; web worker keeps it internally. */
  content?: string
}

export type ImportWorkerBuildMessage = {
  type: 'buildResult'
  requestId: number
  candlesByTimeframe: Record<string, Candle[]>
}

export type ImportWorkerSaveMessage = {
  type: 'saveResult'
  requestId: number
  result: ImportSaveResult
}

export type ImportWorkerLoadMessage = {
  type: 'loadResult'
  requestId: number
  result: ImportLoadResult
}

export type ImportWorkerErrorMessage = {
  type: 'error'
  requestId: number
  error: string
}

export type ImportWorkerOutbound =
  | ImportWorkerProgressMessage
  | ImportWorkerParseMessage
  | ImportWorkerBuildMessage
  | ImportWorkerSaveMessage
  | ImportWorkerLoadMessage
  | ImportWorkerErrorMessage
