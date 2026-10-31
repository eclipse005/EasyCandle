import type {
  ImportDeleteResult,
  ImportDialogResult,
  ImportListResult,
  ImportLoadRange,
  ImportLoadResult,
  ImportParseResult,
  ImportReadResult,
  ImportSaveParams,
  ImportSaveResult
} from './importTypes'
import type { ImportJobProgress } from './importJobProgress'

/** Where the app is running. Only the web runtime exists in this build. */
export type AppRuntime = 'web' | 'desktop'

/**
 * The renderer-facing API contract. The web bridge (`webApiBridge`) implements
 * it over browser primitives — IndexedDB storage, a Web Worker for CSV
 * parsing, and a hidden file input for selection.
 */
export type BarReplayApi = {
  runtime: AppRuntime
  getAppVersion: () => Promise<string>
  openImportDialog: () => Promise<ImportDialogResult>
  readImportFile: (path: string) => Promise<ImportReadResult>
  parseImportFile: (path: string) => Promise<ImportParseResult>
  discardImportParse: (token: string) => Promise<{ ok: true }>
  saveImport: (params: ImportSaveParams) => Promise<ImportSaveResult>
  listImports: () => Promise<ImportListResult>
  loadImport: (
    id: string,
    timeframe?: string,
    range?: ImportLoadRange
  ) => Promise<ImportLoadResult>
  deleteImport: (id: string) => Promise<ImportDeleteResult>
  onImportJobProgress: (callback: (progress: ImportJobProgress) => void) => () => void
}
