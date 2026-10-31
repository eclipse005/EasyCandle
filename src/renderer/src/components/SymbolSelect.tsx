import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { ChartCandlestick, Check, ChevronDown, Search, X } from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolVisibilityStore } from '@/store/symbolVisibilityStore'

export default function SymbolSelect(): ReactElement {
  const symbol = useReplayStore((s) => s.symbol)
  const status = useReplayStore((s) => s.status)
  const mode = useReplayStore((s) => s.mode)
  const dataSource = useReplayStore((s) => s.dataSource)
  const importMeta = useReplayStore((s) => s.importMeta)
  const importedList = useReplayStore((s) => s.importedList)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const selectImportedDataset = useReplayStore((s) => s.selectImportedDataset)
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)

  const hiddenImports = useSymbolVisibilityStore((s) => s.hiddenImports)
  const collapsedImports = useSymbolVisibilityStore((s) => s.collapsedImports)
  const toggleImportsCollapsed = useSymbolVisibilityStore((s) => s.toggleImportsCollapsed)

  const [query, setQuery] = useState('')

  const disabled = status === 'loading' || replayLoading || mode === 'replay'
  const imported = dataSource === 'imported'

  useEffect(() => {
    void refreshImportedList()
  }, [refreshImportedList])

  const currentLabel = useMemo(() => {
    if (imported && importMeta) return importMeta.symbol
    return symbol || 'No data'
  }, [imported, importMeta, symbol])

  // One row per symbol: several datasets of the same pair collapse into the
  // newest one so the picker never lists EURUSD twice.
  const filteredImported = useMemo(() => {
    const hiddenImportSet = new Set(hiddenImports)
    const q = query.trim().toLowerCase()
    const bySymbol = new Map<string, (typeof importedList)[number]>()
    for (const entry of importedList) {
      if (hiddenImportSet.has(entry.id)) continue
      const key = entry.symbol.trim().toUpperCase()
      const seen = bySymbol.get(key)
      // importedList arrives newest-first, so keep the first hit.
      if (!seen) bySymbol.set(key, entry)
    }
    return [...bySymbol.values()].filter(
      (entry) => !q || entry.symbol.toLowerCase().includes(q)
    )
  }, [importedList, hiddenImports, query])

  const hasResults = filteredImported.length > 0

  async function selectImported(id: string): Promise<void> {
    if (!id) return
    await selectImportedDataset(id)
  }

  return (
    <Dropdown
      align="start"
      menuClassName="w-72"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          aria-label="Symbol"
          data-tour="symbol"
          aria-expanded={open}
          title={mode === 'replay' ? 'Exit replay to change symbol' : undefined}
          className="flex h-8 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-2 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ChartCandlestick className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
          <span className="max-w-[8rem] truncate text-zinc-100">{currentLabel}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex max-h-[24rem] flex-col">
          <div className="flex items-center gap-1.5 border-b border-zinc-800 px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search symbols…"
              className="h-6 w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-500 outline-none"
              aria-label="Search symbols"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="rounded p-0.5 text-zinc-500 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {filteredImported.length > 0 && (
              <div className="mb-1">
                <button
                  type="button"
                  aria-expanded={!collapsedImports}
                  onClick={toggleImportsCollapsed}
                  className="flex w-full items-center gap-1.5 px-3 pb-0.5 pt-1 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  <ChevronDown
                    className={`h-3 w-3 shrink-0 transition-transform ${collapsedImports ? '-rotate-90' : ''}`}
                    aria-hidden
                  />
                  Imported
                </button>
                {!collapsedImports &&
                  filteredImported.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        void selectImported(entry.id).then(close)
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                        imported && importMeta?.id === entry.id
                          ? 'bg-amber-950/10 dark:bg-amber-950/40 text-amber-300'
                          : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'
                      }`}
                    >
                      <span className="w-4 shrink-0" />
                      <span className="flex-1">{entry.symbol}</span>
                      {imported && importMeta?.id === entry.id && (
                        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      )}
                    </button>
                  ))}
              </div>
            )}

            {!hasResults && (
              <div className="px-3 py-6 text-center text-xs text-zinc-500">
                {importedList.length === 0
                  ? 'No data yet. Import a CSV to get a chart.'
                  : `No imported symbols match “${query.trim()}”.`}
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800">
            <p className="px-3 py-2 text-[10px] leading-relaxed text-zinc-600">
              Manage symbols and contract sizes from the Dashboard &gt; Symbols tab.
            </p>
          </div>
        </div>
      )}
    </Dropdown>
  )
}
