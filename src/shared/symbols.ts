/**
 * Symbol catalog.
 *
 * This build has no live market-data provider: the only symbols that exist are
 * the ones the user imported (CSV / MT5 `.hcc`). `SYMBOL_GROUPS` therefore stays
 * empty and every symbol list in the UI is driven by `importedList`.
 */

export type SymbolGroup = {
  key: string
  label: string
  /** Whether the group is collapsed by default in the symbol picker. */
  collapsed: boolean
  symbols: { id: string; label: string }[]
}

/** No built-in symbols — imports are the only source of charts. */
export const SYMBOL_GROUPS: SymbolGroup[] = []
