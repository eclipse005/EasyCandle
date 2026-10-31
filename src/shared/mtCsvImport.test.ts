import { describe, expect, it } from 'vitest'
import { MIN_1M_CANDLES_FOR_IMPORT } from './importConstants'
import {
  inferTimeframeSeconds,
  isOfficialTemplateHeader,
  parseIsoAbsoluteTimestamp,
  parseMtCsv,
  parseMtCsvAsync,
  parseMtDateTime,
  parseMtFilename
} from './mtCsvImport'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function mt4Series(count: number, stepSec: number, start = Date.UTC(2024, 0, 2, 0, 0, 0) / 1000): string {
  const lines = ['Date,Time,Open,High,Low,Close,Volume']
  for (let i = 0; i < count; i += 1) {
    const t = start + i * stepSec
    const d = new Date(t * 1000)
    const date = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
    const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
    const close = 1.1 + i * 0.0001
    lines.push(`${date},${time},${close - 0.0001},${close + 0.0002},${close - 0.0002},${close},10`)
  }
  return lines.join('\n')
}

describe('parseMtFilename', () => {
  it('parses SYMBOL_PERIOD_range names', () => {
    expect(parseMtFilename('EURUSD_M15_202001010000_202412312359.csv')).toEqual({
      symbol: 'EURUSD',
      timeframe: '15m',
      unsupportedPeriod: null
    })
  })

  it('parses M1 names', () => {
    expect(parseMtFilename('EURUSD_M1_20200101.csv')).toEqual({
      symbol: 'EURUSD',
      timeframe: '1m',
      unsupportedPeriod: null
    })
    expect(parseMtFilename('XAUUSDM1.csv')).toEqual({
      symbol: 'XAUUSD',
      timeframe: '1m',
      unsupportedPeriod: null
    })
  })

  it('parses compact minute suffixes', () => {
    expect(parseMtFilename('BTCUSD60.csv')).toEqual({
      symbol: 'BTCUSD',
      timeframe: '1h',
      unsupportedPeriod: null
    })
  })

  it('parses glued MetaTrader periods (XAUUSDM5)', () => {
    expect(parseMtFilename('XAUUSDM5.csv')).toEqual({
      symbol: 'XAUUSD',
      timeframe: '5m',
      unsupportedPeriod: null
    })
    expect(parseMtFilename('EURUSDH1')).toEqual({
      symbol: 'EURUSD',
      timeframe: '1h',
      unsupportedPeriod: null
    })
    expect(parseMtFilename('GBPUSDM15_20240101.csv')).toEqual({
      symbol: 'GBPUSD',
      timeframe: '15m',
      unsupportedPeriod: null
    })
  })

  it('parses underscored and glued styles for the same pair', () => {
    expect(parseMtFilename('XAUUSD_M5.csv')).toMatchObject({
      symbol: 'XAUUSD',
      timeframe: '5m'
    })
    expect(parseMtFilename('XAUUSDM5.csv')).toMatchObject({
      symbol: 'XAUUSD',
      timeframe: '5m'
    })
  })

  it('rejects unsupported periods', () => {
    expect(parseMtFilename('EURUSD_M30.csv').unsupportedPeriod).toBe('M30')
    expect(parseMtFilename('EURUSD_M3.csv').unsupportedPeriod).toBe('M3')
    expect(parseMtFilename('XAUUSDM30.csv').unsupportedPeriod).toBe('M30')
  })
})

describe('parseMtCsv', () => {
  it('accepts a full 1m M1 export and requires 10 days of rows', () => {
    const content = mt4Series(MIN_1M_CANDLES_FOR_IMPORT, 60)
    const result = parseMtCsv(content, 'EURUSD_M1.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.symbol).toBe('EURUSD')
    expect(result.timeframe).toBe('1m')
    expect(result.candles).toHaveLength(MIN_1M_CANDLES_FOR_IMPORT)
    expect(inferTimeframeSeconds(result.candles)).toBe(60)
  })

  it('rejects non-1m candle spacing', () => {
    const content = mt4Series(20, 900)
    const result = parseMtCsv(content, 'history.csv')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/1-minute|M1/i)
  })

  it('rejects non-1m timeframe in the file name', () => {
    const content = mt4Series(MIN_1M_CANDLES_FOR_IMPORT, 60)
    const result = parseMtCsv(content, 'EURUSD_M15.csv')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/file name suggests timeframe 15m/i)
  })

  it('rejects 1m files shorter than 10 days', () => {
    const content = mt4Series(100, 60)
    const result = parseMtCsv(content, 'EURUSD_M1.csv')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/10 days/i)
    expect(result.error).toMatch(/14[,.]?400/)
  })

  it('parses MT5-style combined datetime 1m rows', () => {
    const lines = [
      '<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>'
    ]
    const start = Date.UTC(2024, 0, 2, 0, 0, 0)
    for (let i = 0; i < MIN_1M_CANDLES_FOR_IMPORT; i += 1) {
      const d = new Date(start + i * 60_000)
      const date = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
      const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:00`
      lines.push(`${date}\t${time}\t100\t101\t99\t100.5\t12\t0\t1`)
    }
    const result = parseMtCsv(lines.join('\n'), 'XAUUSD_M1.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeframe).toBe('1m')
    expect(result.candles).toHaveLength(MIN_1M_CANDLES_FOR_IMPORT)
  })

  it('parses European-decimal 1m exports', () => {
    const lines: string[] = []
    const start = Date.UTC(2024, 0, 2, 0, 0, 0)
    for (let i = 0; i < MIN_1M_CANDLES_FOR_IMPORT; i += 1) {
      const d = new Date(start + i * 60_000)
      const date = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
      const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
      lines.push(`${date} ${time};100,10;101,20;99,50;100,80;12;0`)
    }
    const result = parseMtCsv(lines.join('\n'), 'EURUSD_M1.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candles[0].open).toBeCloseTo(100.1, 5)
  })

  it('recovers from UTF-16 LE 1m text that still contains NULs', () => {
    const rows: string[] = []
    const start = Date.UTC(2025, 2, 5, 2, 0, 0)
    for (let i = 0; i < MIN_1M_CANDLES_FOR_IMPORT; i += 1) {
      const d = new Date(start + i * 60_000)
      const date = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
      const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
      rows.push(`${date} ${time}\t2914.37\t2914.4\t2912.33\t2913.35\t305\t0`)
    }
    const utf16 = Buffer.from(rows.join('\n') + '\n', 'utf16le').toString('latin1')
    const result = parseMtCsv(utf16, 'XAUUSD_M1.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candles.length).toBe(MIN_1M_CANDLES_FOR_IMPORT)
  })

  it('allows missing symbol in file name for modal confirmation', () => {
    const content = mt4Series(MIN_1M_CANDLES_FOR_IMPORT, 60)
    const result = parseMtCsv(content, 'history.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.symbol).toBeNull()
    expect(result.symbolFromFilename).toBe(false)
    expect(result.inferredTimeframe).toBe('1m')
    expect(result.timeframeFromFilename).toBe(false)
  })

  it('parseMtCsvAsync matches parseMtCsv and reports progress', async () => {
    const content = mt4Series(MIN_1M_CANDLES_FOR_IMPORT, 60)
    const percents: number[] = []
    const asyncResult = await parseMtCsvAsync(content, 'EURUSD_M1.csv', (progress) => {
      percents.push(progress.percent)
    })
    const syncResult = parseMtCsv(content, 'EURUSD_M1.csv')
    expect(asyncResult).toEqual(syncResult)
    expect(percents.length).toBeGreaterThan(1)
    expect(percents[0]).toBeGreaterThanOrEqual(0)
    expect(percents[percents.length - 1]).toBe(100)
    expect(Math.max(...percents)).toBe(100)
  })
})

function isoSeries(
  count: number,
  stepSec: number,
  start = Date.UTC(2026, 0, 2, 0, 0, 0) / 1000
): string {
  const lines = ['timestamp,open,high,low,close,volume']
  for (let i = 0; i < count; i += 1) {
    const t = start + i * stepSec
    const iso = new Date(t * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
    const close = 1.1 + i * 0.0001
    // Include volume=0 flat bars periodically.
    const volume = i % 17 === 0 ? 0 : 10 + (i % 5)
    lines.push(
      `${iso},${close - 0.0001},${close + 0.0002},${close - 0.0002},${close},${volume}`
    )
  }
  return lines.join('\n')
}

describe('ISO / BarReplay template timestamps', () => {
  it('parses Z and numeric offsets into absolute UTC seconds', () => {
    expect(parseIsoAbsoluteTimestamp('2026-01-01T22:04:00Z')).toBe(
      Date.UTC(2026, 0, 1, 22, 4, 0) / 1000
    )
    expect(parseIsoAbsoluteTimestamp('2026-01-01T22:04:00.123Z')).toBe(
      Date.UTC(2026, 0, 1, 22, 4, 0) / 1000
    )
    expect(parseIsoAbsoluteTimestamp('2026-01-01T17:04:00-05:00')).toBe(
      Date.UTC(2026, 0, 1, 22, 4, 0) / 1000
    )
    expect(parseIsoAbsoluteTimestamp('2026-01-01T22:04:00+0000')).toBe(
      Date.UTC(2026, 0, 1, 22, 4, 0) / 1000
    )
    expect(parseIsoAbsoluteTimestamp('2026-01-01T22:04:00')).toBeNull()
    expect(parseIsoAbsoluteTimestamp('2026.01.01 22:04')).toBeNull()
  })

  it('marks ISO absolute via parseMtDateTime and MT walls as provisional', () => {
    expect(parseMtDateTime('2026-01-01T22:04:00Z')).toEqual({
      seconds: Date.UTC(2026, 0, 1, 22, 4, 0) / 1000,
      absolute: true
    })
    expect(parseMtDateTime('2026.01.01', '22:04')).toEqual({
      seconds: Date.UTC(2026, 0, 1, 22, 4, 0) / 1000,
      absolute: false
    })
  })

  it('detects the official template header case-insensitively', () => {
    expect(
      isOfficialTemplateHeader(['Timestamp', 'Open', 'High', 'Low', 'Close', 'Volume'])
    ).toBe(true)
    expect(
      isOfficialTemplateHeader(['Date', 'Time', 'Open', 'High', 'Low', 'Close', 'Volume'])
    ).toBe(false)
  })

  it('parses Dukascopy/official template as absolute and keeps volume=0 bars', () => {
    const content = isoSeries(MIN_1M_CANDLES_FOR_IMPORT, 60)
    const result = parseMtCsv(content, 'EURUSD_dukascopy.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timestampsAbsolute).toBe(true)
    expect(result.symbol).toBe('EURUSD')
    expect(result.candles.some((c) => c.volume === 0)).toBe(true)
    expect(result.candles[0].time).toBe(Date.UTC(2026, 0, 2, 0, 0, 0) / 1000)
  })

  it('rejects malformed ISO like 2026-01231-01T…Z with line-level error', () => {
    const lines = [
      'timestamp,open,high,low,close,volume',
      '2026-01-01T22:00:00Z,1.17,1.171,1.169,1.170,1',
      '2026-01-01T22:01:00Z,1.17,1.171,1.169,1.170,1',
      '2026-01-01T22:02:00Z,1.17,1.171,1.169,1.170,1',
      '2026-01-01T22:03:00Z,1.17,1.171,1.169,1.170,1',
      '2026-01231-01T22:04:00Z,1.17,1.171,1.169,1.170,1'
    ]
    const result = parseMtCsv(lines.join('\n'), 'bad-iso.csv')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/Line 6/i)
    expect(result.error).toMatch(/ISO-8601|invalid|timestamp/i)
  })

  it('rejects official template rows without Z/offset with line-level errors', () => {
    const lines = [
      'timestamp,open,high,low,close,volume',
      '2026-01-01T22:00:00Z,1.1,1.2,1.0,1.15,0',
      '2026-01-01 22:01:00,1.1,1.2,1.0,1.15,1'
    ]
    const result = parseMtCsv(lines.join('\n'), 'bad-template.csv')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/Line 3/i)
    expect(result.error).toMatch(/ISO-8601/i)
  })

  it('keeps MT wall-clock imports provisional (timestampsAbsolute=false)', () => {
    const content = mt4Series(MIN_1M_CANDLES_FOR_IMPORT, 60)
    const result = parseMtCsv(content, 'EURUSD_M1.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timestampsAbsolute).toBe(false)
  })

  it('parses the Dukascopy sample fixture rows and fails only on min length', () => {
    const fixturePath = resolve(__dirname, 'fixtures/EURUSD_dukascopy_sample.csv')
    const content = readFileSync(fixturePath, 'utf8')
    const dataLines = content
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
    expect(dataLines.length).toBe(72)

    for (const line of dataLines) {
      const ts = line.split(',')[0]
      expect(parseIsoAbsoluteTimestamp(ts), ts).not.toBeNull()
    }

    const first = parseIsoAbsoluteTimestamp(dataLines[0].split(',')[0])
    const last = parseIsoAbsoluteTimestamp(dataLines[dataLines.length - 1].split(',')[0])
    expect(first).toBe(Date.UTC(2026, 0, 1, 22, 0, 0) / 1000)
    expect(last).toBe(Date.UTC(2026, 9, 15, 14, 30, 0) / 1000)

    // Flat-fill volume=0 rows present in the fixture must not be dropped by a full parse
    // once length is enough — here the short fixture fails only the min-days gate.
    const result = parseMtCsv(content, 'EURUSD_dukascopy_sample.csv')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/10 days/i)
    expect(result.error).toMatch(/72/)
  })
})
