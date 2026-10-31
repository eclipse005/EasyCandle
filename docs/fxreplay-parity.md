# CandleLab vs FX Replay — pure-frontend parity

Scope: what a **local / static SPA** (IndexedDB + CSV import, no backend) can
realistically match of FX Replay–style trading replay. Updated for the
`parity/fxreplay-frontend` workstream.

Legend:

- **Have** — already in CandleLab (verified in code)
- **Next** — high ROI, feasible in pure frontend (this branch targets several)
- **Later** — feasible client-side but larger UX/perf investment
- **Impossible without backend** — needs live feeds, accounts, or paid APIs

## Feature matrix

| Capability | Status | Notes |
|---|---|---|
| MT4/MT5 1m CSV import + higher TFs | **Have** | Worker parse, IndexedDB, 5m–1d build |
| Fast load of ~100k+ bars | **Have** | Windowed load + aggregate |
| Bar-by-bar / play / speed replay | **Have** | Primary + split secondary driver |
| Chart TF independent of step driver | **Have** | Split pane + driver pane choice |
| Paper market / limit / stop-limit | **Have** | Ticket + blotter + rewind |
| TP/SL, R:R link, markers | **Have** | Conservative SL-first on same bar |
| Session model + starting balance | **Have** | Dashboard sessions, auto-save |
| Session report (win rate, CSV) | **Have** | Kept on Save & close (HEAD fix) |
| Strategies rollup | **Have** | Stable zustand selector (HEAD fix) |
| Drawings (TV-style toolkit) | **Have** | `lightweight-charts-drawing` |
| Chart timezone (DST-aware offset) | **Have** | IANA zones; jump uses session TZ |
| Contract size / precision overrides | **Have** | Symbols tab + import confirm |
| Spread + commission on fills | **Next→Have** | Symbol params; market entry/exit |
| Risk-% position sizing from SL | **Next→Have** | Balance × risk% ÷ (SL×contract) |
| Equity curve from session | **Next→Have** | Report dialog + Sessions card |
| Import discoverability (labeled btn) | **Next→Have** | Datasets tab text Import |
| First-candle import preview | **Next→Have** | Confirm modal OHLC sample |
| Blotter vs host badge clearance | **Next→Have** | Extra bottom padding |
| Trade notes / light journal | **Next→Have** | Optional note on closed trades |
| Jump clarity (TZ label in jump UI) | **Next→Have** | City + UTC± offset |
| Non-MT4 column mapping | **Later** | Feasible; needs format detectors |
| Slippage model (random/ticks) | **Later** | Simple fixed already covered by spread |
| Monte Carlo of trade sequence | **Later** | Pure client OK; optional |
| Multi-symbol correlated replay | **Later** | Possible with multiple IDB sets |
| Prop-firm rules / daily DD gates | **Later** | Client rules possible; cloud not |
| Live broker / data feeds | **Impossible** | Needs server or broker API |
| Shared cloud sessions / teams | **Impossible** | Needs auth + sync backend |
| Paid news / economic calendar | **Impossible** | Licensed feed |
| AI voice journal transcription | **Impossible** | Needs STT service |
| Real account execution | **Impossible** | Broker bridge |

## HEAD fixes verified (commit `806fbe6`)

1. **Strategies crash** — `StrategiesTab` no longer filters inside the zustand
   selector; filter/stats are `useMemo`’d. Real fix.
2. **Over-zoom** — `focusLatestCandle` always frames ~`DEFAULT_VISIBLE_BARS`
   even when only one candle is visible. Real fix.
3. **SL validation hint** — `OrderTicketForm` shows an amber hint when both
   Buy and Sell are disabled. Real fix.
4. **Session report on close** — `closeActiveSession` no longer clears
   `sessionReport`; `Dashboard` mounts `SessionReportDialog`. Real fix.
5. **Blotter vs badge** — HEAD added `pb-1`; insufficient for a floating host
   badge — this branch increases inset padding.

## Design principles for remaining gaps

- Keep costs and risk math in `paperTrade.ts` (pure, tested); stores only wire
  symbol params + balance into those helpers.
- Prefer symbol-level defaults (spread/commission) over per-order clutter.
- Equity / journal stay client-side (session persistence already exists).
- Do not pretend to be a live platform: no fake “connected” broker state.

## Residual gaps after this branch

- Generic CSV column mapping (non-MT headers)
- Explicit replay “step size” control separate from chart TF when not split
  (split+driver already covers the main case)
- Rich journal (tags, screenshots, filters) — notes are intentionally light
- Monte Carlo / streak analytics
