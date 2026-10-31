# BarReplay UI shell inventory

Factual snapshot of the current renderer UI (branch `main`) for a later 1:1 FX Replay comparison. **No redesign notes** — layout, controls, and tokens only. Source roots: `src/renderer/src/App.tsx`, `components/`, `store/uiLayoutStore.ts`, `lib/theme.ts`, `assets/main.css`, `tailwind.config.js`.

Inventoried: 2026-10-31 (Asia/Shanghai).

---

## 1. Top-level routes / tabs

There is **no React Router**. Navigation is store-driven:

| View | Gate | Component |
|---|---|---|
| Management console | `activeSessionId == null` | `dashboard/Dashboard.tsx` |
| In-session chart | `activeSessionId` set | `AppShell` + `CandleChart` (+ optional split) |

### Dashboard tabs (`DashboardTab`)

Header nav (left → right): **Dashboard · Sessions · Datasets · Symbols · Strategies**.

- **Dashboard** (`dashboard`): same as Sessions with `summary` prop (`SessionsTab summary`).
- **Sessions**: session cards; new session; open / delete / report.
- **Datasets**: imported CSV list; import; start session from dataset.
- **Symbols**: symbol params (contract size / precision, etc.).
- **Strategies**: strategy rollups.

Dashboard chrome: full-height `bg-zinc-950`, header `border-b border-zinc-800 px-3 py-2.5`, brand “BarReplay” (`text-amber-400`), subtitle “Backtesting console”, GitHub link right. Content: `px-4 py-5`, centered `max-w-4xl`.

Entering a session (create/load) sets `activeSessionId` → chart shell. Exiting: toolbar back / AppMenu “Sessions home” / ReplayControls logout → `closeActiveSession()`.

---

## 2. In-session layout regions

`AppShell` column: **MainToolbar** (top) → optional banners → **main** (flex-1) → dialogs.

### Main row (inside `main`)

Horizontal `flex gap-1`:

| Region | What | Visibility |
|---|---|---|
| **Left** | `DrawingToolbar` — rail `w-[49px]`, favourites + groups + magnet/undo/lock/hide/clear | `showDrawingToolbar` (default on) |
| **Center** | Chart frame: `flex-1`, `rounded-sm border border-zinc-800` — `children` = single or L/R split `CandleChart` | Always |
| **Right** | `OrderTicket` aside `w-[260px]` | `showPaperTrade && !chartFullscreen && (mode === 'replay' \|\| tourPaperTradePreview)` |
| **Bottom** (below chart row) | `TradePanel` blotter | `showPaperTrade && !chartFullscreen` |

### Overlays on the chart frame

| Overlay | Placement |
|---|---|
| `ChartTimezoneSelect` | Absolute, right of plot (offset by price-scale width + 6), `bottom: 4` |
| `FloatingReplayBar` | Draggable `FloatingPanel`, default **bottom-center**; only if `showReplayControls && mode === 'replay'` |
| `FloatingTradeBar` | Draggable; default **top-right**; **fullscreen + replay only** — compact ticket, no blotter |
| Fullscreen exit | Absolute top-right (lower when split); shortcut `F` |
| Loading veil | Full chart inset when candles / replay window loading |

### Chart split

When `chartSplit`: two panes side-by-side (`border-r border-zinc-800`). Each has `PaneChrome` (“Left” / “Right”, TF badge; right TF editable; driver toggle in replay). Chart content sits under chrome (`top-9`).

### Top toolbar (`MainToolbar`)

Hidden in fullscreen. Order L→R:

1. Back (save & close session)
2. `AppMenu` (logo menu)
3. `SymbolSelect`
4. `TimeframeSelect`
5. `ChartTypeSelect`
6. `IndicatorsDropdown`
7. Divider then: Split · Chart settings · Snapshot · `SessionDropdown` · Fullscreen · Theme
8. Optional `StatusBar` (replay pill) when `showStatusBar`

### AppMenu visibility toggles

Checked items: Dark theme, Paper trade, Status bar, Drawing toolbar, Replay controls. Also: Sessions home, Tour, Shortcuts, About.

### Banners (below toolbar)

- Error strip (`border-red-*`, Retry outside replay).
- Replay-ended strip (`border-amber-*`).

### Main padding (density)

- Fullscreen: `p-0`
- Drawing toolbar on: `py-1.5 px-2 sm:py-2`
- Else: `p-1.5 sm:p-2`
- Chart row gap: `gap-1`
- TradePanel: `mt-1.5` … `pb-12` (host-badge clearance)

---

## 3. Replay transport controls and placement

**Host:** `FloatingReplayBar` → `FloatingPanel` title “Replay” → `ReplayControls`.

- Default placement: **bottom-center** of chart frame.
- Persisted: `replayControlsPos`, `replayControlsMinimized` (`bar-replay:ui-layout`).
- Minimized label: `Replay` or `Replay · {TF} · L/R` when split.

### Control order (left → right)

1. **Play / Pause** (Space) — accent tone
2. **Step backward** (←) / **Step forward** (→)
3. If split: **Next** driver pane toggle (Tab) — shows `{TF} · left|right`
4. **Speed** `<select>`: `0.5x · 1x · 2x · 4x` (`REPLAY_SPEEDS`)
5. **Pause on TP/SL** toggle (`CirclePause`)
6. **Jump** dropdown (`SkipForward`): date + time in chart timezone + submit; label “Jump · {timezoneTitle}”
7. **Save & close session** (`LogOut`)

`StatusBar` (toolbar, not floating): pill with Idle/Ready/Playing/Paused/Ended, speed when playing, spinner when busy, optional end/message tooltips. Not a second transport bar.

---

## 4. Order ticket — field order and risk UI

### Docked ticket (`OrderTicket`)

- Aside right of chart, fixed **260px**.
- Header: “ORDER TICKET” (`text-[10px] uppercase tracking-[0.14em]`).
- Body: scrollable `px-3 py-2` → `OrderTicketForm`.

### Fullscreen ticket (`FloatingTradeBar`)

Same `OrderTicketForm` with `compact` prop (prop currently unused for layout differences). Panel title “Trade”, default top-right. No blotter in fullscreen.

### Field order (`OrderTicketForm`)

1. Order-type tabs: **Market | Limit | Stop Limit**
2. **Lot / Amt** (`TradeSizeControl`) — ± steppers, editable value
3. **Risk %** row — percent input + **Size** button (sizes lots from session balance × risk% ÷ SL distance; disabled until SL set)
4. **Price** (`LevelPriceControl`) — only for Limit / Stop Limit; chart pick via crosshair
5. **TP** — type or pick
6. **SL** — type or pick
7. **R:R** (`RiskRewardControl`) — ± 0.5 step, presets `1 · 1.5 · 2 · 3`, clamp ~0.5–20; guide for first TP/SL seed
8. **Buy | Sell** grid (`h-8`) — emerald / red
9. Optional amber validation hint when one side blocked

Level rows: label (`TP`/`SL`/`Price`) + text input + crosshair pick button; amber border while picking.

---

## 5. Blotter tabs (`TradePanel`)

Docked **under** the chart row (not a floating panel). Header: “PAPER TRADE” + summary metrics + collapse chevron.

### Summary chips (right of header)

Balance (starting + realized) · Realized · Open (unrealized) · Session total · optional USD paren when quote ≠ USD.

### Tabs (order)

| Tab id | Label | Count badge |
|---|---|---|
| `positions` | Positions | open positions |
| `openOrders` | Open Orders | pending |
| `orderHistory` | Order History | historic fills/cancels |
| `positionHistory` | Position History | closed trades |

Body: `max-h-36 overflow-y-auto`, row text `text-[11px]`.

Row actions:

- Positions: select highlight, **Close**
- Open orders: select, **Cancel**
- Position history: locate-on-chart (crosshair), inline **note** input (blur commit)

---

## 6. Color / theme tokens

### Mechanism

- Tailwind `darkMode: ['selector', '[data-theme="dark"]']`.
- `zinc`, `amber`, `red`, `emerald`, `sky` mapped to CSS vars `rgb(var(--{name}-{step}) / <alpha-value>)` in `tailwind.config.js`.
- Vars defined in `assets/main.css` for `:root` / `[data-theme='dark']` and inverted/remapped for `[data-theme='light']`.
- `document.documentElement.dataset.theme` + `colorScheme` via `lib/theme.ts` / `themeStore`. Storage: `bar-replay:theme`. Default **dark**.

### Chart palette (`CHART_PALETTES`)

Separate from Tailwind — hex for lightweight-charts (bg `#09090b` dark / `#fafafa` light, grid, watermark, handles, hints).

### Semantic UI usage (typical)

| Role | Tokens |
|---|---|
| App / panel bg | `zinc-950`, `zinc-950/90`, `zinc-900/60` |
| Borders | `zinc-800`, `zinc-700` |
| Muted label | `zinc-500`, `text-[10px] uppercase tracking-[0.12–0.14em]` |
| Accent / brand / active session | `amber-300`–`amber-500` |
| Long / buy / win | `emerald-*` |
| Short / sell / loss | `red-*` |
| TP | `teal-400` (blotter; not in Tailwind extend — default teal) |
| SL | `orange-400` (blotter) |
| Strategy badge | `sky-*` |
| Warn / ended | `amber-*` banners |

No separate design-token TS module beyond chart palette + CSS vars.

---

## 7. Density cues (padding / sizing)

Recurring patterns:

| Cue | Typical classes |
|---|---|
| Icon buttons | `h-8 w-8` (default); compact controls `!h-6 !w-6` |
| Toolbar / panel header padding | `px-2 py-2`, `px-3 py-2` |
| Ticket / blotter labels | `text-[10px]` uppercase + wide tracking |
| Body / row text | `text-xs` / `text-[11px]` |
| Control row gaps | `gap-1` / `gap-1.5` / `gap-2` |
| Field chrome | `rounded border … px-1 py-0.5` or `px-1.5 py-0.5` |
| Buy/Sell / transport height | `h-8` |
| Drawing rail | `w-[49px]`, `px-1.5 py-2`, `gap-0.5` |
| Order ticket width | `w-[260px]` |
| Blotter list cap | `max-h-36` |
| Dashboard content | `px-4 py-5`, cards `px-3 py-2.5` |
| Tab pills | `px-2 py-1` or `px-3 py-2` (`text-[10px]` / `text-xs`) |

Overall: **compact trading-terminal density** — 8px control height, 10–11px meta text, 1–2 (`4–8px`) padding units, zinc borders, amber accent.

---

## Quick region map (in-session, non-fullscreen)

```
┌─ MainToolbar (Symbol · TF · type · indicators · split · … · StatusBar) ─┐
│ [optional error / ended banner]                                         │
│ ┌ Drawing ┐ ┌──────── Chart (+ TZ, floating Replay) ────────┐ ┌ Ticket┐ │
│ │  49px   │ │  (split → Left | Right panes)                 │ │ 260px │ │
│ └─────────┘ └───────────────────────────────────────────────┘ └───────┘ │
│ ┌─ TradePanel blotter: Positions | Open Orders | Order History | … ────┐ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

Fullscreen: toolbar/ticket/blotter hidden; floating Replay (+ floating Trade if replay); exit control top-right.

---

## Source file index

| Area | Files |
|---|---|
| Route gate | `App.tsx` |
| Shell | `AppShell.tsx`, `MainToolbar.tsx`, `AppMenu.tsx`, `StatusBar.tsx` |
| Dashboard | `dashboard/Dashboard.tsx`, `SessionsTab`, `DatasetsTab`, `SymbolsTab`, `StrategiesTab`, `CreateSessionDialog` |
| Chart | `CandleChart.tsx`, `PaneChrome.tsx`, `DrawingToolbar.tsx` |
| Replay | `FloatingReplayBar.tsx`, `ReplayControls.tsx`, `FloatingPanel.tsx` |
| Trade | `OrderTicket.tsx`, `OrderTicketForm.tsx`, `FloatingTradeBar.tsx`, `TradePanel.tsx`, `TradeSizeControl`, `LevelPriceControl`, `RiskRewardControl` |
| Session chrome | `SessionDropdown.tsx` |
| Layout state | `store/uiLayoutStore.ts` |
| Theme | `lib/theme.ts`, `store/themeStore.ts`, `assets/main.css`, `tailwind.config.js` |

---

## Soft UI modularization (2026-10-31, post soft-pass)

Extracted thin dashboard/dialog primitives under `components/ui/`: `SoftCard`, `SoftButton`, `SoftInput`/`SoftSelect`, `SoftLabel`/`SoftCaption`, `SoftDialog`, `SoftEmpty`, `SoftPageHeader`, plus `cn`. Dashboard tabs + `CreateSessionDialog` consume them; session chrome (ticket/blotter/replay) shares softer caption/spacing patterns inline. `UI_TOKENS` gained `softBorder` / title / secondary / muted for hierarchy. **Deferred:** mass-migrating every toolbar dropdown and settings dialog onto Soft*, splitting `OrderTicketForm`, React Router, and a full design-system storybook.

