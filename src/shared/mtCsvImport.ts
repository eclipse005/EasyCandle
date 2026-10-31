import { dedupeCandlesByTime, type Candle } from './candleUtils'
import {
  IMPORT_SOURCE_TIMEFRAME,
  MIN_1M_CANDLES_FOR_IMPORT,
  minImportCandlesMessage
} from './importConstants'
import { IMPORT_WORKER_PROGRESS_EVERY } from './importJobProgress'
import type { ImportParseFailure, ImportParseResult } from './importTypes'
import { TIMEFRAMES, type TimeframeConfig } from './timeframes'

export type CsvParseProgress = {
  phase: 'preparing' | 'parsing' | 'finalizing'
  percent: number
  processedRows: number
  totalRows: number
}

/** MetaTrader period codes → app timeframe ids. */
const MT_PERIOD_TO_TIMEFRAME: Record<string, string> = {
  M1: '1m',
  M5: '5m',
  M15: '15m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
  '1M': '1m',
  '5M': '5m',
  '15M': '15m',
  '1H': '1h',
  '4H': '4h',
  '1D': '1d',
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d'
}

/** Compact trailing digits in filenames like EURUSD15 → 15m. */
const COMPACT_MINUTES_TO_TIMEFRAME: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
  '1440': '1d'
}

const UNSUPPORTED_PERIODS = new Set(['M30', 'H12', 'W1', 'MN1', '30', '10080', '43200'])

const QUOTE_SUFFIX = /(?:USDT|USDC|USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|BTC|ETH|XAU|XAG)$/

function looksLikeMarketSymbol(symbol: string): boolean {
  if (!/^[A-Z][A-Z0-9]{2,14}$/.test(symbol)) return false
  if (QUOTE_SUFFIX.test(symbol)) return true
  // Classic 6-letter forex pairs (EURUSD, GBPJPY, …).
  return /^[A-Z]{6}$/.test(symbol)
}

export type FilenameMeta = {
  symbol: string | null
  timeframe: string | null
  unsupportedPeriod: string | null
}

/**
 * Extract symbol + timeframe hints from common MT4/MT5 export names:
 * - EURUSD_M15_20200101_20241231.csv  (underscored)
 * - XAUUSDM5.csv / EURUSDH1.csv        (glued period letter)
 * - GBPUSD_H1.csv
 * - BTCUSD15.csv                       (compact minutes)
 * - XAUUSD_PERIOD_M15.csv
 */
export function parseMtFilename(fileName: string): FilenameMeta {
  const base = String(fileName || '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.(csv|txt)$/i, '')
    .trim()

  if (!base) {
    return { symbol: null, timeframe: null, unsupportedPeriod: null }
  }

  const upper = base.toUpperCase()

  for (const period of UNSUPPORTED_PERIODS) {
    if (
      upper.includes(`_${period}_`) ||
      upper.endsWith(`_${period}`) ||
      upper.includes(`PERIOD_${period}`) ||
      new RegExp(`^[A-Z]+${period}(?:_|$)`).test(upper) ||
      new RegExp(`^[A-Z]+${period}$`).test(upper)
    ) {
      return { symbol: null, timeframe: null, unsupportedPeriod: period }
    }
  }

  // SYMBOL_PERIOD_... or SYMBOL_M15_...
  const underscored = upper.match(
    /^([A-Z][A-Z0-9]{1,14})_(?:PERIOD_)?(M1|M5|M15|H1|H4|D1|1M|5M|15M|1H|4H|1D)(?:_|$)/
  )
  if (underscored && looksLikeMarketSymbol(underscored[1])) {
    const timeframe = MT_PERIOD_TO_TIMEFRAME[underscored[2]] ?? null
    return { symbol: underscored[1], timeframe, unsupportedPeriod: null }
  }

  // Glued MetaTrader period: XAUUSDM5 / EURUSDH1 / GBPUSDM15[_range]
  // Longer periods first so M15 wins over M1/M5.
  const glued = upper.match(/^([A-Z][A-Z0-9]{1,14})(M15|M5|M1|H4|H1|D1)(?:_|$)/)
  if (glued && looksLikeMarketSymbol(glued[1])) {
    const timeframe = MT_PERIOD_TO_TIMEFRAME[glued[2]] ?? null
    return { symbol: glued[1], timeframe, unsupportedPeriod: null }
  }

  // Compact minutes: EURUSD15 / BTCUSD60
  const compact = upper.match(/^([A-Z][A-Z0-9]{1,14})(1|5|15|60|240|1440)(?:_|$)/)
  if (compact && looksLikeMarketSymbol(compact[1])) {
    const timeframe = COMPACT_MINUTES_TO_TIMEFRAME[compact[2]] ?? null
    return { symbol: compact[1], timeframe, unsupportedPeriod: null }
  }

  // Symbol-only prefix before first underscore (timeframe inferred from content later).
  const symbolOnly = upper.match(/^([A-Z][A-Z0-9]{2,14})(?:_|$)/)
  if (symbolOnly && looksLikeMarketSymbol(symbolOnly[1])) {
    return { symbol: symbolOnly[1], timeframe: null, unsupportedPeriod: null }
  }

  return { symbol: null, timeframe: null, unsupportedPeriod: null }
}

type FieldDelimiter = ',' | ';' | '\t' | 'whitespace'

function splitCsvLine(line: string, delimiter: FieldDelimiter): string[] {
  const parts = delimiter === 'whitespace' ? line.trim().split(/\s+/) : line.split(delimiter)
  return parts.map((part) => part.trim().replace(/^<|>$/g, '')).filter((part) => part.length > 0)
}

function scoreDelimiter(lines: string[], delimiter: FieldDelimiter): number {
  let score = 0
  const limit = Math.min(lines.length, 40)
  for (let i = 0; i < limit; i += 1) {
    const cells = splitCsvLine(lines[i], delimiter)
    if (looksLikeHeader(cells)) continue
    if (mapRowToCandle(cells)) score += 1
  }
  return score
}

function detectDelimiter(lines: string[]): FieldDelimiter {
  const candidates: FieldDelimiter[] = ['\t', ';', ',', 'whitespace']
  let best: FieldDelimiter = ','
  let bestScore = -1

  for (const candidate of candidates) {
    const score = scoreDelimiter(lines, candidate)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }

  // Prefer an explicit delimiter over whitespace when scores tie.
  if (bestScore <= 0) {
    const sample = lines[0] || ''
    const commas = (sample.match(/,/g) || []).length
    const semis = (sample.match(/;/g) || []).length
    const tabs = (sample.match(/\t/g) || []).length
    if (tabs >= commas && tabs >= semis && tabs > 0) return '\t'
    if (semis > commas) return ';'
    if (commas > 0) return ','
    return 'whitespace'
  }

  return best
}

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase()
  return (
    joined.includes('date') ||
    joined.includes('time') ||
    joined.includes('open') ||
    joined.includes('<date>')
  )
}

export type ParsedTimestamp = {
  /** Unix seconds (UTC instant, or provisional wall packed via Date.UTC). */
  seconds: number
  /** True when the source string included Z or a numeric offset. */
  absolute: boolean
}

/** ISO-8601 with required Z or ±HH:MM / ±HHMM; optional fractional seconds. */
const ISO_ABS_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})$/i

/**
 * Parse an absolute ISO-8601 instant (must include Z or numeric offset).
 * Fractional seconds are truncated to whole seconds for candle opens.
 */
export function parseIsoAbsoluteTimestamp(raw: string): number | null {
  const s = String(raw || '').trim()
  const m = s.match(ISO_ABS_RE)
  if (!m) return null

  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = Number(m[4])
  const minute = Number(m[5])
  const second = Number(m[6] ?? 0)
  if (
    ![year, month, day, hour, minute, second].every((n) => Number.isFinite(n)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null
  }

  let offsetMinutes = 0
  const off = m[8].toUpperCase()
  if (off !== 'Z') {
    const om = off.match(/^([+-])(\d{2}):?(\d{2})$/)
    if (!om) return null
    offsetMinutes = (Number(om[2]) * 60 + Number(om[3])) * (om[1] === '-' ? -1 : 1)
  }

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000
  if (!Number.isFinite(utcMs)) return null
  return Math.floor(utcMs / 1000)
}

/**
 * Parse CSV date/time: absolute ISO (Z/offset) first, then MT wall-clock forms.
 * Wall-clock results are provisional (Date.UTC pack) — Import Confirm remaps them.
 */
export function parseMtDateTime(datePart: string, timePart?: string): ParsedTimestamp | null {
  const date = String(datePart || '').trim()
  const time = String(timePart || '').trim()

  // Combined absolute ISO in the first cell (Dukascopy / official template).
  if (!time) {
    const abs = parseIsoAbsoluteTimestamp(date)
    if (abs != null) return { seconds: abs, absolute: true }
  } else {
    // Rare: date + time cells that together form ISO with offset on time.
    const abs = parseIsoAbsoluteTimestamp(`${date}T${time}`)
    if (abs != null) return { seconds: abs, absolute: true }
  }

  // Combined MT wall: 2020.01.01 00:00[:00] or 2020-01-01 00:00 (no offset)
  const combined = date.match(
    /^(\d{4})[.\-/](\d{2})[.\-/](\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  )
  if (combined && !time) {
    const year = Number(combined[1])
    const month = Number(combined[2])
    const day = Number(combined[3])
    const hour = Number(combined[4] ?? 0)
    const minute = Number(combined[5] ?? 0)
    const second = Number(combined[6] ?? 0)
    const seconds = utcSeconds(year, month, day, hour, minute, second)
    return seconds == null ? null : { seconds, absolute: false }
  }

  const d = date.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})$/)
  if (!d) return null

  const t = (time || '00:00').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!t) return null

  const seconds = utcSeconds(
    Number(d[1]),
    Number(d[2]),
    Number(d[3]),
    Number(t[1]),
    Number(t[2]),
    Number(t[3] ?? 0)
  )
  return seconds == null ? null : { seconds, absolute: false }
}

/**
 * Pack CSV wall-clock fields via Date.UTC as *provisional* seconds.
 * Not a claim the file is UTC — Import Confirm remaps with an explicit data timezone.
 */
function utcSeconds(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): number | null {
  if (
    ![year, month, day, hour, minute, second].every((n) => Number.isFinite(n)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }
  const ms = Date.UTC(year, month - 1, day, hour, minute, second)
  if (!Number.isFinite(ms)) return null
  return Math.floor(ms / 1000)
}

function parseNumber(value: string): number | null {
  let s = String(value || '')
    .trim()
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '')
  if (!s) return null

  // European decimals: 2914,37 or 1.234,56
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s) || /^\d+,\d+$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  }

  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function isValidOhlc(open: number, high: number, low: number, close: number): boolean {
  if (high < low) return false
  if (high < open && high < close) return false
  if (low > open && low > close) return false
  return true
}

/** Official BarReplay / Dukascopy header (order fixed, case-insensitive). */
export function isOfficialTemplateHeader(cells: string[]): boolean {
  if (cells.length < 6) return false
  const norm = cells.slice(0, 6).map((c) => c.trim().toLowerCase().replace(/^<|>$/g, ''))
  return (
    norm[0] === 'timestamp' &&
    norm[1] === 'open' &&
    norm[2] === 'high' &&
    norm[3] === 'low' &&
    norm[4] === 'close' &&
    norm[5] === 'volume'
  )
}

type RowMapSuccess = { ok: true; candle: Candle; absolute: boolean }
type RowMapFailure = { ok: false; reason: string }
type RowMapResult = RowMapSuccess | RowMapFailure

function mapOfficialTemplateRow(cells: string[], lineNo: number): RowMapResult {
  if (cells.length < 6) {
    return {
      ok: false,
      reason: `Line ${lineNo}: expected timestamp,open,high,low,close,volume (got ${cells.length} column(s)).`
    }
  }

  const tsRaw = cells[0]
  const abs = parseIsoAbsoluteTimestamp(tsRaw)
  if (abs == null) {
    return {
      ok: false,
      reason:
        `Line ${lineNo}: timestamp must be ISO-8601 with Z or ±HH:MM (e.g. 2026-01-01T22:04:00Z); ` +
        `got "${tsRaw}".`
    }
  }

  const open = parseNumber(cells[1])
  const high = parseNumber(cells[2])
  const low = parseNumber(cells[3])
  const close = parseNumber(cells[4])
  if (open == null || high == null || low == null || close == null) {
    return {
      ok: false,
      reason: `Line ${lineNo}: invalid OHLC values.`
    }
  }
  if (!isValidOhlc(open, high, low, close)) {
    return {
      ok: false,
      reason: `Line ${lineNo}: OHLC relationship is invalid.`
    }
  }

  const candle: Candle = { time: abs, open, high, low, close }
  const volume = parseNumber(cells[5] ?? '')
  // Keep volume=0 flat-fill bars (do not drop).
  if (volume != null) candle.volume = volume
  return { ok: true, candle, absolute: true }
}

function mapMtRowToCandle(cells: string[]): RowMapResult {
  if (cells.length < 5) {
    return { ok: false, reason: 'too few columns' }
  }

  let parsed: ParsedTimestamp | null = null
  let openIdx = 1

  const firstHasTime = /\d{1,2}:\d{2}/.test(cells[0]) || ISO_ABS_RE.test(cells[0].trim())
  if (firstHasTime) {
    parsed = parseMtDateTime(cells[0])
    openIdx = 1
  } else if (cells.length >= 6 && /^\d{1,2}:\d{2}/.test(cells[1])) {
    parsed = parseMtDateTime(cells[0], cells[1])
    openIdx = 2
  } else {
    parsed = parseMtDateTime(cells[0])
    openIdx = 1
  }

  if (parsed == null) return { ok: false, reason: 'bad datetime' }
  if (cells.length < openIdx + 4) return { ok: false, reason: 'too few columns' }

  const open = parseNumber(cells[openIdx])
  const high = parseNumber(cells[openIdx + 1])
  const low = parseNumber(cells[openIdx + 2])
  const close = parseNumber(cells[openIdx + 3])
  if (open == null || high == null || low == null || close == null) {
    return { ok: false, reason: 'bad ohlc' }
  }
  if (!isValidOhlc(open, high, low, close)) return { ok: false, reason: 'bad ohlc relation' }

  const candle: Candle = { time: parsed.seconds, open, high, low, close }
  const volume = parseNumber(cells[openIdx + 4] ?? '')
  if (volume != null) candle.volume = volume
  return { ok: true, candle, absolute: parsed.absolute }
}

/** @deprecated Prefer mapMtRowToCandle / mapOfficialTemplateRow — kept for delimiter scoring. */
function mapRowToCandle(cells: string[]): Candle | null {
  const mapped = mapMtRowToCandle(cells)
  return mapped.ok ? mapped.candle : null
}

/**
 * Infer the dominant bar step (seconds) from consecutive candle open times.
 */
export function inferTimeframeSeconds(candles: Candle[]): number | null {
  if (candles.length < 3) return null

  const counts = new Map<number, number>()
  const limit = Math.min(candles.length - 1, 500)
  for (let i = 0; i < limit; i += 1) {
    const delta = candles[i + 1].time - candles[i].time
    if (delta <= 0) continue
    counts.set(delta, (counts.get(delta) || 0) + 1)
  }

  let bestDelta: number | null = null
  let bestCount = 0
  for (const [delta, count] of counts) {
    if (count > bestCount) {
      bestDelta = delta
      bestCount = count
    }
  }

  return bestDelta
}

export function matchTimeframeBySeconds(seconds: number): TimeframeConfig | null {
  for (const tf of Object.values(TIMEFRAMES)) {
    if (tf.seconds === seconds) return tf
  }
  return null
}

function filenameReject(fileMeta: FilenameMeta): ImportParseFailure | null {
  if (fileMeta.unsupportedPeriod) {
    return {
      ok: false,
      error: `Timeframe ${fileMeta.unsupportedPeriod} from the file name is not supported. Import only 1-minute (M1) exports.`
    }
  }

  if (fileMeta.timeframe && fileMeta.timeframe !== IMPORT_SOURCE_TIMEFRAME) {
    return {
      ok: false,
      error: `File name suggests timeframe ${fileMeta.timeframe}. Import only 1-minute (M1) MetaTrader exports.`
    }
  }

  return null
}

function normalizeCsvText(content: string): string {
  return String(content || '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\u00a0/g, ' ')
}

/** Split this many characters at a time so huge files can paint a progress bar. */
const SPLIT_CHUNK_CHARS = 1_000_000

function appendTrimmedLines(target: string[], chunk: string): void {
  const raw = chunk.split(/\r?\n/)
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i].trim()
    if (line.length > 0) target.push(line)
  }
}

function splitNonEmptyLinesWithProgress(
  text: string,
  onProgress?: (percent: number) => void
): string[] {
  const lines: string[] = []
  const len = text.length
  if (len === 0) return lines

  let start = 0
  while (start < len) {
    let end = Math.min(len, start + SPLIT_CHUNK_CHARS)
    if (end < len) {
      const nl = text.indexOf('\n', end)
      end = nl === -1 ? len : nl + 1
    }
    appendTrimmedLines(lines, text.slice(start, end))
    start = end
    onProgress?.(Math.round((start / len) * 100))
  }
  return lines
}

function finalizeParsedRows(
  raw: Candle[],
  skipped: number,
  fileMeta: FilenameMeta,
  timestampsAbsolute: boolean
): ImportParseResult {
  const warnings: string[] = []

  if (!raw.length) {
    return {
      ok: false,
      error:
        'No valid candle rows found. Use the BarReplay CSV template (timestamp,open,high,low,close,volume with ISO-8601 Z/offset) or an MT4/MT5 Date/Time export.'
    }
  }

  const candles = dedupeCandlesByTime(raw)
  if (candles.length < 2) {
    return { ok: false, error: 'Need at least 2 valid candles to verify the timeframe.' }
  }

  const firstTime = candles[0]?.time ?? 0
  const lastTime = candles[candles.length - 1]?.time ?? 0

  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} invalid or incomplete row(s).`)
  }

  const inferredSeconds = inferTimeframeSeconds(candles)
  if (inferredSeconds == null) {
    return { ok: false, error: 'Could not infer timeframe from candle spacing.' }
  }

  const inferredTf = matchTimeframeBySeconds(inferredSeconds)
  if (!inferredTf) {
    return {
      ok: false,
      error: `Candle spacing is ${inferredSeconds}s, which is not 1-minute. Export M1 data from MetaTrader.`
    }
  }

  if (inferredTf.id !== IMPORT_SOURCE_TIMEFRAME) {
    return {
      ok: false,
      error: `Candle spacing matches ${inferredTf.id}. Import only 1-minute (M1) data — higher timeframes are built automatically.`
    }
  }

  if (candles.length < MIN_1M_CANDLES_FOR_IMPORT) {
    return { ok: false, error: minImportCandlesMessage(candles.length) }
  }

  if (!fileMeta.symbol) {
    warnings.push('Symbol not found in file name — enter it before confirming.')
  }

  const spanDays = (lastTime - firstTime) / 86400
  warnings.push(
    `Will build 5m, 15m, 1h, 4h, and 1d from this 1m series (~${spanDays.toFixed(1)} days, ${candles.length.toLocaleString()} bars).`
  )

  if (timestampsAbsolute) {
    warnings.push(
      'Timestamps include Z/offset — treated as absolute UTC; CSV data timezone is not required.'
    )
  }

  return {
    ok: true,
    candles,
    candleCount: candles.length,
    firstTime,
    lastTime,
    symbol: fileMeta.symbol,
    timeframe: IMPORT_SOURCE_TIMEFRAME,
    inferredTimeframe: IMPORT_SOURCE_TIMEFRAME,
    symbolFromFilename: Boolean(fileMeta.symbol),
    timeframeFromFilename: Boolean(fileMeta.timeframe),
    timestampsAbsolute,
    warnings
  }
}

function layoutCsvLines(
  lines: string[]
):
  | ImportParseFailure
  | {
      lines: string[]
      startIndex: number
      delimiter: FieldDelimiter
      templateMode: boolean
    } {
  if (lines.length === 0) {
    return { ok: false, error: 'CSV file is empty.' }
  }

  const delimiter = detectDelimiter(lines)
  let startIndex = 0
  const firstCells = splitCsvLine(lines[0], delimiter)
  const templateMode = isOfficialTemplateHeader(firstCells)
  if (templateMode || looksLikeHeader(firstCells)) {
    startIndex = 1
  }

  if (startIndex >= lines.length) {
    return { ok: false, error: 'CSV has a header but no candle rows.' }
  }

  return { lines, startIndex, delimiter, templateMode }
}

export function parseMtCsv(content: string, fileName: string): ImportParseResult {
  return parseMtCsvWithProgress(content, fileName)
}

/**
 * Parse a 1-minute MT CSV in a single linear pass. Safe to call from a worker:
 * progress is reported every `IMPORT_WORKER_PROGRESS_EVERY` rows with no yielding.
 */
export function parseMtCsvWithProgress(
  content: string,
  fileName: string,
  onProgress?: (progress: CsvParseProgress) => void
): ImportParseResult {
  const fileMeta = parseMtFilename(fileName)
  const rejected = filenameReject(fileMeta)
  if (rejected) return rejected

  onProgress?.({ phase: 'preparing', percent: 2, processedRows: 0, totalRows: 0 })

  const text = normalizeCsvText(content)
  const lines = splitNonEmptyLinesWithProgress(text, (splitPercent) => {
    onProgress?.({
      phase: 'preparing',
      percent: 2 + Math.round(splitPercent * 0.06),
      processedRows: 0,
      totalRows: 0
    })
  })
  const prepared = layoutCsvLines(lines)
  if ('ok' in prepared) return prepared

  const { startIndex, delimiter, templateMode } = prepared
  const totalRows = lines.length - startIndex
  const raw: Candle[] = []
  let skipped = 0
  let absoluteCount = 0
  const lineErrors: string[] = []

  onProgress?.({ phase: 'parsing', percent: 8, processedRows: 0, totalRows })

  for (let i = startIndex; i < lines.length; i += 1) {
    const lineNo = i + 1
    const cells = splitCsvLine(lines[i], delimiter)
    const mapped = templateMode
      ? mapOfficialTemplateRow(cells, lineNo)
      : mapMtRowToCandle(cells)

    if (mapped.ok) {
      raw.push(mapped.candle)
      if (mapped.absolute) absoluteCount += 1
    } else if (templateMode) {
      if (lineErrors.length < 25) lineErrors.push(mapped.reason)
    } else {
      skipped += 1
    }

    const processed = i - startIndex + 1
    if (processed % IMPORT_WORKER_PROGRESS_EVERY === 0 || processed === totalRows) {
      const percent = 8 + Math.round((processed / Math.max(totalRows, 1)) * 82)
      onProgress?.({ phase: 'parsing', percent, processedRows: processed, totalRows })
    }
  }

  if (templateMode && lineErrors.length > 0) {
    const extra =
      lineErrors.length >= 25
        ? ' Additional invalid rows omitted from this message.'
        : ''
    return {
      ok: false,
      error: `Official CSV template rejected ${lineErrors.length} row(s):\n${lineErrors.join('\n')}${extra}`
    }
  }

  // Absolute only when every successfully parsed row had Z/offset (no wall-clock mix).
  const timestampsAbsolute = raw.length > 0 && absoluteCount === raw.length

  onProgress?.({ phase: 'finalizing', percent: 94, processedRows: totalRows, totalRows })
  const result = finalizeParsedRows(raw, skipped, fileMeta, timestampsAbsolute)
  onProgress?.({
    phase: 'finalizing',
    percent: 100,
    processedRows: totalRows,
    totalRows
  })
  return result
}

export async function parseMtCsvAsync(
  content: string,
  fileName: string,
  onProgress?: (progress: CsvParseProgress) => void
): Promise<ImportParseResult> {
  return parseMtCsvWithProgress(content, fileName, onProgress)
}
