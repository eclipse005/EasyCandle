# Data model — symbol-first (v0.1.9)

Locked product model for BarReplay (pure frontend). Soft SaaS / FXR-like.

## Entities

### Symbol
A catalog row (e.g. `EURUSD`) plus optional user params (`contractSize`, `spread`, `commissionPerLot`, `precision`).

- Catalog lives in `src/shared/symbols.ts` (`SYMBOL_GROUPS`: Forex, Metals, Indices, Energy, Other).
- Symbols page shows **category tabs**; params editors for the active category only.
- Catalog symbols appear even before any import (`No data` muted meta).
- Import **auto-creates** a params entry via `symbolParamsStore.ensureSymbol` when missing.

### Dataset
One CSV (or MetaTrader) file stored under a symbol. Many files per symbol are allowed.

- Datasets **page lists one row per SYMBOL**, not per file.
- Row chips: `N files · total candles · date span`.
- **Edit** opens `SymbolDatasetsDialog`: list files, delete one, import more, date-coverage calendar.
- Optional trash on the row deletes **all** files for that symbol (confirm).
- **No** “New session” on Datasets — sessions start from Testing.

### Session
Created from **Testing** by picking a **symbol** (not a single dataset).

- Engine loads **all** imported files for that symbol at the chosen timeframe.
- Session snapshot still stores `importId` = **primary** dataset id (newest file by `updatedAt`). Documented here and in `selectImportedSymbol`.

## Calendar / coverage

- Days with coverage for a symbol are **lit**; days with no data are grey/disabled.
- Used in Datasets manage UI (read-only) and Create Session start-date (selectable).
- v1 approximation: union of each file’s `firstTime..lastTime` at **UTC day** granularity (`src/shared/dateCoverage.ts`). Weekends inside a span may light without a bar; scanning every 1m candle is deferred.

## Multi-CSV merge

- Calendar = **union of days** across files.
- Overlapping bars (same open time): **newer import wins** (`updatedAt` ascending merge via `mergeCandlesByTime`).
- Implemented in `replayStore.selectImportedSymbol`.
- Shortcut: multi-file merge loads **full** series (no IndexedDB window paging). Single-file path keeps paging.

## Create Session

1. Symbol select — only symbols with ≥1 import.
2. Timeframes — union of stored TFs across that symbol’s files.
3. Start date — clamped to coverage; calendar disables grey days.
4. `openSession({ symbol, timeframe, startDate, … })` → `selectImportedSymbol` → replay at start.

## Out of scope

- Cloud data feeds, paywalls, live quotes.
