/**
 * Built-in symbol catalog for BarReplay.
 *
 * Datasets are CSV files under a symbol; the catalog only pre-fills names and
 * defaults (contract / precision via `@shared/pricePrecision`). Imports may
 * still introduce symbols outside these groups — those land under "Other".
 */

import { normalizeSymbolKey } from './pricePrecision'

export type CatalogSymbol = {
  id: string
  label: string
}

export type SymbolGroup = {
  key: string
  label: string
  /** Whether the group is collapsed by default in legacy pickers. */
  collapsed: boolean
  symbols: CatalogSymbol[]
}

function sym(id: string, label?: string): CatalogSymbol {
  return { id, label: label ?? id }
}

/** Majors + common crosses, metals, indices, energy — Soft SaaS defaults. */
export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    key: 'forex',
    label: 'Forex',
    collapsed: false,
    symbols: [
      sym('EURUSD'),
      sym('GBPUSD'),
      sym('USDJPY'),
      sym('USDCHF'),
      sym('AUDUSD'),
      sym('USDCAD'),
      sym('NZDUSD'),
      sym('EURGBP'),
      sym('EURJPY'),
      sym('GBPJPY'),
      sym('AUDJPY'),
      sym('EURAUD'),
      sym('EURCHF'),
      sym('GBPAUD'),
      sym('GBPCHF'),
      sym('CADJPY'),
      sym('AUDCAD'),
      sym('AUDNZD'),
      sym('NZDJPY'),
      sym('CHFJPY')
    ]
  },
  {
    key: 'metals',
    label: 'Metals',
    collapsed: false,
    symbols: [sym('XAUUSD', 'XAUUSD (Gold)'), sym('XAGUSD', 'XAGUSD (Silver)')]
  },
  {
    key: 'indices',
    label: 'Indices',
    collapsed: false,
    symbols: [
      sym('US30'),
      sym('US100'),
      sym('US500'),
      sym('DE40'),
      sym('UK100'),
      sym('JP225')
    ]
  },
  {
    key: 'energy',
    label: 'Energy',
    collapsed: true,
    symbols: [sym('USOIL'), sym('UKOIL')]
  },
  {
    key: 'other',
    label: 'Other',
    collapsed: true,
    /** Filled dynamically by imported non-catalog symbols; kept empty here. */
    symbols: []
  }
]

const GROUP_BY_SYMBOL = new Map<string, SymbolGroup>()
for (const group of SYMBOL_GROUPS) {
  for (const entry of group.symbols) {
    GROUP_BY_SYMBOL.set(normalizeSymbolKey(entry.id), group)
  }
}

/** Letters/digits only, uppercased — same rule as pricePrecision. */
export function normalizeSymbolId(symbol: string): string {
  return normalizeSymbolKey(symbol)
}

export function listCatalogGroups(): SymbolGroup[] {
  return SYMBOL_GROUPS
}

export function listSymbolsInGroup(groupKey: string): CatalogSymbol[] {
  const group = SYMBOL_GROUPS.find((g) => g.key === groupKey)
  return group ? group.symbols.slice() : []
}

/** Catalog group for a symbol, or null when it is not in the static catalog. */
export function findGroupForSymbol(symbol: string): SymbolGroup | null {
  const key = normalizeSymbolId(symbol)
  if (!key) return null
  return GROUP_BY_SYMBOL.get(key) ?? null
}

export function isCatalogSymbol(symbol: string): boolean {
  return findGroupForSymbol(symbol) != null
}

/** Flat list of every static catalog id (excludes dynamic Other). */
export function listAllCatalogSymbolIds(): string[] {
  return SYMBOL_GROUPS.flatMap((g) => g.symbols.map((s) => s.id))
}
