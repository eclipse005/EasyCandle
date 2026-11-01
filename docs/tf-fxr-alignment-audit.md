# TF correctness × FX Replay — alignment audit

**Scope:** factual comparison of BarReplay candle **bucket opens** vs likely FX Replay (FXR) behavior.  
**Out of scope this pass:** Timestep UI changes; shipping product code.  
**Date:** 2026-11-01 (Asia/Shanghai).  
**Method:** code + vitest + computed opens on the EURUSD dukascopy fixture window; public FXR docs / markets / indicators; existing `/workspace/fxr-ui` screenshots. **No live FXR chart login** (login wall present; not used).

## BarReplay rules (verified in code)

Source: `src/shared/forexSession.ts`, `candleAggregate.ts`, `timeframes.ts`; tests `forexSession.test.ts`, `candleAggregate.test.ts` (24/24 pass).

| Class | TFs | Bucket rule |
|---|---|---|
| UTC fixed-step | `1m` `3m` `5m` `15m` `30m` `1h` | `floor(t / step) * step` |
| NY-close fixed-step | `4h` `6h` `1d` | `floorToInterval(t, step, NY17_offset)` — offset **21h UTC (EDT)** / **22h UTC (EST)** |
| Forex week | `1w` | **Sunday NY 17:00 → next Sunday NY 17:00** (`floorToForexWeekOpen`, TradingView coverage) |
| Forex month | `1M` | NY calendar month open at NY 17:00 (`floorToForexMonthOpen`) |

Import path: precompute `5m/15m/30m/1h/4h/1d`; lazy `3m/6h/1w/1M`. Product intent for week: `docs/timeframe-redesign-proposal.md` (“周日 17:00 → 下周日 17:00” / TradingView coverage).

## Expected BarReplay opens — EURUSD / Jan 2026 (EST, offset=22h)

Fixture: `src/shared/fixtures/EURUSD_dukascopy_sample.csv` starts `2026-01-01T22:00:00Z` (sparse sample; opens below are from `floorOpenForTimeframe` logic, not full OHLC rebuild).

| Sample `t` (UTC) | 3m | 30m | 6h | 1d | 1w | 1M |
|---|---|---|---|---|---|---|
| `2026-01-01T22:00Z` (fixture first) | `…22:00` | `…22:00` | `…22:00` | `…22:00` | **`2025-12-28T22:00`** | `2026-01-01T22:00` |
| `2026-01-04T22:00Z` (Sun 17:00 EST = TV / trade-week open) | `…22:00` | `…22:00` | `…22:00` | `…22:00` | **`2026-01-04T22:00`** (BarReplay week open) | `…01T22:00` |
| `2026-01-05T22:00Z` (Mon 17:00 EST) | `…22:00` | `…22:00` | `…22:00` | `…22:00` | **`2026-01-04T22:00`** (same Sun week) | `…01T22:00` |
| `2026-01-15T12:00Z` | `…12:00` | `…12:00` | **`…10:00`** | `2026-01-14T22:00` | `2026-01-11T22:00` | `…01T22:00` |
| `2026-02-01T22:00Z` | `…22:00` | `…22:00` | `…22:00` | `…22:00` | `2026-01-25T22:00` | **`2026-02-01T22:00`** |

### Highlight — 6h NY grid (EST)

For session day starting Mon `2026-01-05T22:00Z`, BarReplay **6h** opens:

`22:00 → 04:00 → 10:00 → 16:00 → (next) 22:00` (UTC).

UTC-only 6h (if FXR used that) at the same Mon 22:00 would open **`18:00Z`**, not `22:00Z` — **4h skew** vs BarReplay.

EDT (after 2026-03-08): offset 21h → 6h grid `21 / 03 / 09 / 15` UTC.

### Highlight — 1w Sun NY17 (TradingView coverage)

| Convention | Week open for the week containing Sun 2026-01-04 17:00 EST |
|---|---|
| **BarReplay (code, 0.1.65+)** | **Sun** `2026-01-04T22:00Z` (NY 17:00) → next Sun |
| **TradingView / industry forex trade week** | **Sun** `2026-01-04T22:00Z` (NY 17:00); axis Monday date is label only |
| **Delta** | **Aligned** (was +24h when BarReplay used Mon NY17) |

## Comparison table

| TF | BarReplay rule | Likely FXR | Risk | Evidence |
|---|---|---|---|---|
| **3m** | UTC 180s | UTC / fixed-step minute grid (standard) | **Low** | BR: `floorOpenForTimeframe` + aggregate test; FXR markets list minute→M; no session-shift claim for sub-hour |
| **30m** | UTC 1800s | Same | **Low** | Same as 3m; import cascade from 15m |
| **6h** | **NY-close 6h grid** (with 4h/1d) | **Unverified.** Forex listed `Mon–Fri · New York`; FXR 1h shot labels **UTC hours**; 6h may be NY-anchored *or* UTC | **High** | BR: `FOREX_SESSION_TIMEFRAMES` includes `6h`; computed EST grid `22/04/10/16`. FXR: no public doc stating 6h open; `/workspace/fxr-ui/04-chart-session.webp` is **1h**, not 6h. UTC alt differs by 4h in EST |
| **1d** | NY 17:00 daily | **Likely NY / “Next Day Open”** in Go To (times in New York) | **Med** | BR tests Aug-2020 NY day; FXR Go To “Next Day Open” + markets session New York; live OHLC stamp not captured (login wall) |
| **1w** | **Sun NY 17:00 → next Sun** (TV coverage) | **Trade-week / TV-aligned** (Sun NY17). FXR indicators still talk “Sunday/Monday consolidation”; Weekly Separator TZ offset | **Low vs TV**; FXR native stamp still login-gated | BR: `floorToForexWeekOpen` Sun; redesign doc Sun; TV verified OANDA:EURUSD |
| **1M** | NY calendar month @ NY 17 | Likely calendar month; open hour unclear (NY vs UTC midnight) | **Med** | BR: `floorToForexMonthOpen`; FXR lists 1M; no open-hour doc |

## FXR week-start notes (public + assets)

- **Markets** (`fxreplay.com/markets`): forex e.g. EURUSD → session **“Mon–Fri · New York”**, resolutions include 1W / 1M (and seconds on some).
- **Weekly Separator / Weekly Opens** (FXR indicator page): weekly open as bias; pro tip mentions **Sunday/Monday consolidation**; settings allow **timezone offset** (“NY Open logic”) — implies separator is configurable, not a hard published Mon/Sun native candle rule.
- **Industry default** (non-FXR): forex trading week **Sun 17:00 NY → Fri 17:00 NY** (widely documented).
- **Repo assets:** `/workspace/fxr-ui/04-chart-session.webp` — OANDA:EURUSD **1h**, axis in **UTC**, weekend gap Fri→Mon; replay timestep chip `4h`. `/workspace/fxr-ui/parity-shots/login-wall.png` — login required for deeper chart TF probes.
- **Not proven without login:** native FXR `1W` candle open timestamp (Sun vs Mon NY close).

## Secondary BarReplay risks (sync, not bucket build)

Even when HTF series are built with `floorOpenForTimeframe`:

- Split **follower** cover still uses UTC `alignTimeToInterval` / `followerPlayheadCover` (`timeframes.ts`) — can desync vs NY `4h/6h/1d` or week/month when panes differ.
- Trade/marker remap paths often call UTC `alignTimeToInterval`; TF **switch** for imported data does use `floorOpenForTimeframe` (`replayStore.ts` ~2541).

These matter after Timestep/multi-pane work; flagged only.

## Verification plan (when FXR login available)

1. EURUSD (Duka or OANDA), jump to **2026-01-05 17:00 America/New_York**.
2. Record first visible open times for **3m, 30m, 6h, 1d, 1w, 1M** (and note chart TZ).
3. Cross-check Sun `2026-01-04 17:00 NY`: does **1w** open there or Mon?
4. On **6h**, list four opens across one NY day — match `22/04/10/16` (EST) or `00/06/12/18` UTC.
5. Optional: same checks in EDT (e.g. 2026-08) for 21h offset.

## Top risks for user

1. **`1w` now Sun NY17 (0.1.65)** — aligned with TradingView coverage; residual risk is FXR-native stamp if it differs (still login-gated).  
2. **`6h` grid** — BarReplay NY-anchored; FXR may be UTC → systematic 4h (EST) / similar EDT skew vs FXR and vs naive UTC multi-pane math.  
3. **Live FXR candle opens still unconfirmed** — blocked by login; table “Likely FXR” is inference until step-list above is run.  
4. **Follower/playhead UTC align** — can disagree with NY HTF buckets even if import aggregation is correct.

## Deliberately not done

- No product/code changes.  
- No Timestep UI work.  
- No FXR authenticated session.

## Live FXR check 2026-11-01 (app.fxreplay.com, trader005, free plan)

Session EURUSD eval walkthrough; replay limited ~2015-04 (cannot reach 2023–2026). Chart TZ UTC for exports.

| TF | FXR observed | BarReplay 0.1.64 | Match? |
|----|--------------|------------------|--------|
| 4h | Opens 17/21/01/05/09/13 UTC in Apr 2015 (EDT) = NY 17:00 grid | FOREX_SESSION NY-close | YES |
| 1w | CSV open Monday `00:00:00.000Z` (e.g. 2015-03-23, 03-30, 04-06, 04-13) | Sun NY 17:00 → next Sun (TV) | NO vs that CSV labeling (~session skew; TV axis Mon is label-only) |
| 6h | Not in menu (hours: 1,2,3,4,12) | NY-close 6h grid | N/A (FXR absent) |
| 3m/30m/1M | Present in TF list | Present | list OK; OHLC not cross-checked |
| 2h/3h/12h | Present | Absent | gap |

Screenshots: `/workspace/fxr-1w-completed.png`, `/workspace/fxr-4h-opens.png`, `/workspace/fxr-6h-opens.png`.
