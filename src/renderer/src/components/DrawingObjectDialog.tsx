import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, X } from 'lucide-react'
import {
  factoryStyleFor,
  type DrawingKind,
  type DrawingStyle,
  type LevelDef
} from 'lightweight-charts-drawing'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import { useDrawingTemplateStore } from '@/store/drawingTemplateStore'
import * as bridge from '@/lib/drawings/drawingBridge'
import {
  patchDrawing,
  patchDrawingStyle,
  restoreDrawingSnapshot,
  setDrawingHidden,
  setDrawingLocked,
  setDrawingStyle,
  setDrawingVisibility
} from '@/lib/drawings/drawingActions'
import { timeframesFromVisibility, visibilityFromTimeframes } from '@/lib/drawings/drawingStyleBridge'
import {
  cloneStyle,
  cssHex,
  extendModeOf,
  extendPatch,
  fibTrendOf,
  kindLabel,
  levelsOf,
  levelsUseOneColor,
  opacityOf,
  paintLevels,
  patchLevel,
  restoreLevelColors,
  sectionsFor,
  snapshotFrom,
  statsPatch,
  statsPresetOf,
  tabsFor,
  transparencyOf,
  type DrawSection,
  type DrawTab,
  type DrawingSnapshot,
  type ExtendMode,
  type StatsPreset
} from '@/lib/drawings/drawingProperties'
import { useT } from '@/i18n/useT'
import type { MessageKey } from '@/i18n/messages'
import { TIMEFRAME_IDS } from '@shared/timeframes'

const WIDTHS = [1, 2, 3, 4]
const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24]

/**
 * Per-drawing settings. Each tool shows the TradingView fields the drawing
 * library already renders. Edits preview live; Cancel restores the snapshot
 * taken when the dialog opened.
 */
export default function DrawingObjectDialog(): ReactElement | null {
  const id = useDrawingUiStore((s) => s.objectDialogId)
  const revision = useDrawingUiStore((s) => s.revision)
  const openObjectDialog = useDrawingUiStore((s) => s.openObjectDialog)
  const templates = useDrawingTemplateStore((s) => s.templates)
  const defaults = useDrawingTemplateStore((s) => s.defaults)
  const saveTemplate = useDrawingTemplateStore((s) => s.saveTemplate)
  const deleteTemplate = useDrawingTemplateStore((s) => s.deleteTemplate)
  const setKindDefault = useDrawingTemplateStore((s) => s.setKindDefault)
  const { t, locale } = useT()

  const [tab, setTab] = useState<DrawTab>('style')
  const [draft, setDraft] = useState<DrawingSnapshot | null>(null)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const snapRef = useRef<DrawingSnapshot | null>(null)
  const openedId = useRef<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  void revision
  const drawing = id ? bridge.getPrimary()?.get(id) : undefined
  const ready = Boolean(id && drawing && draft && openedId.current === id)

  useEffect(() => {
    if (!id || !drawing) {
      openedId.current = null
      return
    }
    if (openedId.current === id) return
    openedId.current = id
    const snap = snapshotFrom(drawing)
    snapRef.current = snap
    setDraft(snap)
    setTab('style')
    setTemplateOpen(false)
    setTemplateName('')
  }, [id, drawing])

  useEffect(() => {
    if (!id) return undefined
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') cancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!templateOpen) return undefined
    function onPointer(event: PointerEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setTemplateOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [templateOpen])

  function cancel(): void {
    if (id && snapRef.current) restoreDrawingSnapshot(id, snapRef.current)
    openedId.current = null
    openObjectDialog(null)
  }

  function ok(): void {
    openedId.current = null
    openObjectDialog(null)
  }

  if (!ready || !id || !drawing || !draft) return null

  const kind = drawing.kind
  const sections = new Set(sectionsFor(kind))
  const tabs = tabsFor(kind)
  const activeTab = tabs.includes(tab) ? tab : 'style'
  const style = draft.style
  const kindTemplates = templates[kind] ?? []

  function commitStyle(patch: Partial<DrawingStyle>): void {
    setDraft((current) => (current ? { ...current, style: { ...current.style, ...patch } } : current))
    patchDrawingStyle(id!, patch)
  }

  function replaceStyle(next: DrawingStyle): void {
    const styleNext = cloneStyle(next)
    setDraft((current) => (current ? { ...current, style: styleNext } : current))
    setDrawingStyle(id!, styleNext)
  }

  function commitLevels(levels: LevelDef[]): void {
    commitStyle({ levels })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 pt-[8vh] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancel()
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={t('draw.dialogLabel')}
        className="flex max-h-[min(40rem,86vh)] w-[min(36rem,94vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60"
      >
        <header className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">
              {draft.name || kindLabel(kind, locale)}
            </p>
            <p className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{kind}</p>
          </div>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={cancel}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <nav className="flex gap-0.5 border-b border-zinc-800 px-2 pt-2">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-t-lg px-3 py-1.5 text-xs transition-colors ${
                activeTab === item
                  ? 'bg-zinc-900 text-primary-300'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {t(`draw.tab.${item}`)}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {activeTab === 'style' && (
            <StylePane
              kind={kind}
              style={style}
              sections={sections}
              t={t}
              onStyle={commitStyle}
              onLevels={commitLevels}
            />
          )}
          {activeTab === 'text' && (
            <TextPane
              draft={draft}
              t={t}
              onStyle={commitStyle}
              onText={(value) => {
                setDraft((current) => (current ? { ...current, text: value } : current))
                patchDrawingStyle(id, { text: value })
                patchDrawing(id, { text: value })
              }}
              onName={(value) => {
                setDraft((current) => (current ? { ...current, name: value || undefined } : current))
                patchDrawing(id, { name: value || undefined })
              }}
            />
          )}
          {activeTab === 'coordinates' && (
            <CoordinatesPane
              points={draft.points}
              t={t}
              onChange={(points) => {
                setDraft((current) => (current ? { ...current, points } : current))
                patchDrawing(id, { points: points as typeof drawing.points })
              }}
            />
          )}
          {activeTab === 'visibility' && (
            <VisibilityPane
              draft={draft}
              t={t}
              onLocked={(locked) => {
                setDraft((current) => (current ? { ...current, locked } : current))
                setDrawingLocked(id, locked)
              }}
              onHidden={(hidden) => {
                setDraft((current) => (current ? { ...current, hidden } : current))
                setDrawingHidden(id, hidden)
              }}
              onIntervals={(enabled) => {
                setDrawingVisibility(id, enabled)
                setDraft((current) =>
                  current ? { ...current, visibility: visibilityFromTimeframes(enabled) } : current
                )
              }}
            />
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={templateOpen}
              onClick={() => setTemplateOpen((open) => !open)}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-zinc-700 px-2.5 text-xs text-zinc-200 hover:border-zinc-500"
            >
              {t('draw.template')}
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            {templateOpen && (
              <div
                role="menu"
                className="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-xl border border-zinc-800 bg-zinc-950 p-1 shadow-xl"
              >
                <form
                  className="flex gap-1 p-1"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (saveTemplate(kind, templateName, style)) {
                      setTemplateName('')
                      setTemplateOpen(false)
                    }
                  }}
                >
                  <input
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder={t('draw.template.name')}
                    className={selectClass}
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg bg-zinc-800 px-2 text-[11px] text-zinc-100 hover:bg-zinc-700"
                  >
                    {t('common.save')}
                  </button>
                </form>
                <MenuButton
                  label={t('draw.template.defaults')}
                  onClick={() => {
                    replaceStyle(factoryStyleFor(kind as DrawingKind))
                    setTemplateOpen(false)
                  }}
                />
                <MenuButton
                  label={t('draw.template.asDefault')}
                  onClick={() => {
                    setKindDefault(kind, style)
                    setTemplateOpen(false)
                  }}
                />
                {defaults[kind] && (
                  <MenuButton
                    label={t('draw.template.clearDefault')}
                    onClick={() => {
                      setKindDefault(kind, null)
                      setTemplateOpen(false)
                    }}
                  />
                )}
                <div className="my-1 border-t border-zinc-800" />
                {kindTemplates.length === 0 && (
                  <p className="px-2 py-1.5 text-[11px] text-zinc-500">{t('draw.template.empty')}</p>
                )}
                {kindTemplates.map((preset) => (
                  <div key={preset.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        replaceStyle(preset.style)
                        setTemplateOpen(false)
                      }}
                      className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      aria-label={t('draw.deleteTemplate', { name: preset.name })}
                      onClick={() => deleteTemplate(kind, preset.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancel}
              className="h-8 rounded-xl border border-zinc-700 px-3 text-xs text-zinc-200 hover:border-zinc-500"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={ok}
              className="h-8 rounded-xl bg-zinc-100 px-3 text-xs font-medium text-zinc-950 hover:bg-white"
            >
              {t('draw.ok')}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  )
}

function StylePane({
  kind,
  style,
  sections,
  t,
  onStyle,
  onLevels
}: {
  kind: string
  style: DrawingStyle
  sections: Set<DrawSection>
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  onStyle: (patch: Partial<DrawingStyle>) => void
  onLevels: (levels: LevelDef[]) => void
}): ReactElement {
  const levels = sections.has('levels') ? levelsOf(style, kind) : []
  const trend = fibTrendOf(style)
  const oneColor = levelsUseOneColor(levels)
  const opacity = opacityOf(style.transparency, sections.has('background') ? 20 : 50)

  function editLevel(index: number, patch: Partial<LevelDef>): void {
    const next = patchLevel(levels, index, patch)
    if (next) onLevels(next)
  }

  return (
    <div className="space-y-3">
      {sections.has('line') && (
        <Row label={t('draw.line')}>
          <ColorInput value={style.color} onChange={(color) => onStyle({ color })} />
          <LineStyleSelect
            value={style.lineStyle ?? 'solid'}
            t={t}
            onChange={(lineStyle) => onStyle({ lineStyle })}
          />
          <WidthSelect value={style.width ?? 1} t={t} onChange={(width) => onStyle({ width })} />
        </Row>
      )}

      {sections.has('ends') && (
        <Row label={t('draw.leftEnd')}>
          <EndSelect
            value={style.leftEnd ?? 0}
            t={t}
            onChange={(leftEnd) => onStyle({ leftEnd })}
          />
          <span className="text-[10px] text-zinc-500">{t('draw.rightEnd')}</span>
          <EndSelect
            value={style.rightEnd ?? (kind === 'arrow' ? 1 : 0)}
            t={t}
            onChange={(rightEnd) => onStyle({ rightEnd })}
          />
        </Row>
      )}

      {sections.has('extend') && (
        <Row label={t('draw.extend')}>
          <select
            value={extendModeOf(style, kind)}
            onChange={(event) => onStyle(extendPatch(event.target.value as ExtendMode))}
            className={selectClass}
          >
            {(['none', 'left', 'right', 'both'] as const).map((mode) => (
              <option key={mode} value={mode}>
                {t(`draw.extend.${mode}`)}
              </option>
            ))}
          </select>
        </Row>
      )}

      {sections.has('fibTrend') && (
        <Row label={t('draw.trendLine')}>
          <input
            type="checkbox"
            checked={trend.visible}
            onChange={(event) => onStyle({ fibTrendLine: { ...trend, visible: event.target.checked } })}
            className="h-3.5 w-3.5 accent-primary-500"
          />
          <ColorInput
            value={trend.color}
            onChange={(color) => onStyle({ fibTrendLine: { ...trend, color } })}
          />
          <LineStyleSelect
            value={trend.style}
            t={t}
            onChange={(lineStyle) => onStyle({ fibTrendLine: { ...trend, style: lineStyle } })}
          />
        </Row>
      )}

      {sections.has('levelsLine') && (
        <Row label={t('draw.levelsLine')}>
          <LineStyleSelect
            value={style.lineStyle ?? 'solid'}
            t={t}
            onChange={(lineStyle) => onStyle({ lineStyle })}
          />
          <WidthSelect value={style.width ?? 1} t={t} onChange={(width) => onStyle({ width })} />
        </Row>
      )}

      {sections.has('levels') && (
        <div className="grid grid-cols-2 gap-1.5">
          {levels.map((level, index) => (
            <label
              key={index}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 px-1.5 py-1"
            >
              <input
                type="checkbox"
                checked={level.visible}
                onChange={(event) => editLevel(index, { visible: event.target.checked })}
                className="h-3.5 w-3.5 accent-primary-500"
              />
              <input
                type="number"
                step="0.001"
                value={level.coeff}
                onChange={(event) => editLevel(index, { coeff: Number(event.target.value) })}
                className="h-7 w-16 rounded-md border border-zinc-800 bg-zinc-950 px-1.5 text-xs text-zinc-100"
              />
              <ColorInput
                value={level.color}
                onChange={(color) => editLevel(index, { color })}
              />
            </label>
          ))}
        </div>
      )}

      {sections.has('oneColor') && (
        <Row label={t('draw.useOneColor')}>
          <input
            type="checkbox"
            checked={oneColor}
            onChange={(event) => {
              if (event.target.checked) {
                onLevels(paintLevels(levels, style.color || levels[0]?.color || '#787b86'))
                return
              }
              const factory = factoryStyleFor(kind as DrawingKind).levels ?? []
              onLevels(restoreLevelColors(levels, factory))
            }}
            className="h-3.5 w-3.5 accent-primary-500"
          />
          <ColorInput
            value={oneColor ? levels[0]?.color : style.color}
            onChange={(color) => {
              if (oneColor) onLevels(paintLevels(levels, color))
              else onStyle({ color })
            }}
          />
        </Row>
      )}

      {sections.has('middle') && (
        <Check
          label={t('draw.middle')}
          checked={Boolean(style.showMiddlePoint)}
          onChange={(showMiddlePoint) => onStyle({ showMiddlePoint })}
        />
      )}

      {sections.has('middleLine') && (
        <Check
          label={t('draw.middleLine')}
          checked={Boolean(style.rectMiddleLine?.visible)}
          onChange={(visible) =>
            onStyle({
              rectMiddleLine: {
                visible,
                color: style.rectMiddleLine?.color ?? style.color,
                width: style.rectMiddleLine?.width ?? 1,
                style: style.rectMiddleLine?.style ?? 'dashed'
              }
            })
          }
        />
      )}

      {sections.has('priceLabels') && (
        <Check
          label={t('draw.priceLabels')}
          checked={Boolean(style.showPriceLabels)}
          onChange={(showPriceLabels) => onStyle({ showPriceLabels })}
        />
      )}

      {sections.has('extendVertical') && (
        <Check
          label={t('draw.extendThrough')}
          checked={style.extendLine !== false}
          onChange={(extendLine) => onStyle({ extendLine })}
        />
      )}

      {sections.has('showTime') && (
        <Check
          label={t('draw.showTime')}
          checked={Boolean(style.showTime)}
          onChange={(showTime) => onStyle({ showTime })}
        />
      )}

      {sections.has('extendLines') && (
        <Check
          label={t('draw.extendLines')}
          checked={Boolean(style.extendLines)}
          onChange={(extendLines) => onStyle({ extendLines })}
        />
      )}

      {sections.has('background') && (
        <Row label={t('draw.background')}>
          <input
            type="checkbox"
            checked={style.fillBackground !== false}
            onChange={(event) => onStyle({ fillBackground: event.target.checked })}
            className="h-3.5 w-3.5 accent-primary-500"
          />
          <ColorInput
            value={style.backgroundColor ?? style.color}
            onChange={(backgroundColor) => onStyle({ backgroundColor })}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            aria-label={t('draw.background')}
            onChange={(event) => onStyle({ transparency: transparencyOf(Number(event.target.value)) })}
            className="h-1 flex-1 accent-primary-500"
          />
        </Row>
      )}

      {sections.has('reverse') && (
        <Check
          label={t('draw.reverse')}
          checked={Boolean(style.reverse)}
          onChange={(reverse) => onStyle({ reverse })}
        />
      )}

      {sections.has('fibLabels') && (
        <>
          <Check
            label={t('draw.showPrices')}
            checked={style.showPrices !== false}
            onChange={(showPrices) => onStyle({ showPrices })}
          />
          <Check
            label={t('draw.showCoeffs')}
            checked={style.showCoeffs !== false}
            onChange={(showCoeffs) => onStyle({ showCoeffs })}
          />
          <Check
            label={t('draw.levelsPercent')}
            checked={Boolean(style.fibLevelsAsPercents)}
            onChange={(fibLevelsAsPercents) => onStyle({ fibLevelsAsPercents })}
          />
        </>
      )}

      {sections.has('position') && (
        <>
          <Row label={t('draw.stopColor')}>
            <ColorInput
              value={style.stopColor ?? '#f23645'}
              onChange={(stopColor) => onStyle({ stopColor })}
            />
            <input
              type="range"
              min={0}
              max={100}
              value={opacityOf(style.stopTransparency, 20)}
              aria-label={t('draw.stopColor')}
              onChange={(event) =>
                onStyle({ stopTransparency: transparencyOf(Number(event.target.value)) })
              }
              className="h-1 flex-1 accent-primary-500"
            />
          </Row>
          <Row label={t('draw.targetColor')}>
            <ColorInput
              value={style.targetColor ?? '#089981'}
              onChange={(targetColor) => onStyle({ targetColor })}
            />
            <input
              type="range"
              min={0}
              max={100}
              value={opacityOf(style.targetTransparency, 20)}
              aria-label={t('draw.targetColor')}
              onChange={(event) =>
                onStyle({ targetTransparency: transparencyOf(Number(event.target.value)) })
              }
              className="h-1 flex-1 accent-primary-500"
            />
          </Row>
        </>
      )}

      {sections.has('textBody') && (
        <>
          <Row label={t('draw.color')}>
            <ColorInput value={style.color} onChange={(color) => onStyle({ color })} />
          </Row>
          <Row label={t('draw.textColor')}>
            <ColorInput
              value={style.textColor ?? style.color}
              onChange={(textColor) => onStyle({ textColor })}
            />
          </Row>
          <Row label={t('draw.fontSize')}>
            <select
              value={style.fontSize ?? 14}
              onChange={(event) => onStyle({ fontSize: Number(event.target.value) })}
              className={selectClass}
            >
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </Row>
          <Check label={t('draw.bold')} checked={Boolean(style.bold)} onChange={(bold) => onStyle({ bold })} />
          <Check
            label={t('draw.italic')}
            checked={Boolean(style.italic)}
            onChange={(italic) => onStyle({ italic })}
          />
        </>
      )}

      {sections.has('stats') && (
        <div className="space-y-2 border-t border-zinc-800 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            {t('draw.info')}
          </p>
          <Row label={t('draw.stats')}>
            <select
              value={statsPresetOf(style)}
              onChange={(event) => {
                const preset = event.target.value as StatsPreset
                if (preset === 'custom') return
                onStyle(statsPatch(preset))
              }}
              className={selectClass}
            >
              {(['hidden', 'price', 'pricePct', 'bars', 'all', 'custom'] as const).map((preset) => (
                <option key={preset} value={preset}>
                  {t(`draw.stats.${preset}`)}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t('draw.statsPosition')}>
            <select
              value={style.statsPosition ?? 2}
              onChange={(event) =>
                onStyle({ statsPosition: Number(event.target.value) as 0 | 1 | 2 | 3 })
              }
              className={selectClass}
            >
              <option value={0}>{t('draw.pos.left')}</option>
              <option value={1}>{t('draw.pos.center')}</option>
              <option value={2}>{t('draw.pos.right')}</option>
              <option value={3}>{t('draw.pos.auto')}</option>
            </select>
          </Row>
          <Check
            label={t('draw.alwaysStats')}
            checked={Boolean(style.showStats)}
            onChange={(showStats) => onStyle({ showStats })}
          />
        </div>
      )}
    </div>
  )
}

function TextPane({
  draft,
  t,
  onStyle,
  onText,
  onName
}: {
  draft: DrawingSnapshot
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  onStyle: (patch: Partial<DrawingStyle>) => void
  onText: (value: string) => void
  onName: (value: string) => void
}): ReactElement {
  const color = draft.style.textColor ?? draft.style.color
  return (
    <div className="space-y-3">
      <Field label={t('draw.textColor')}>
        <ColorInput value={color} onChange={(textColor) => onStyle({ textColor })} />
      </Field>
      <Field label={t('draw.label')}>
        <input
          type="text"
          value={draft.style.text ?? draft.text ?? ''}
          onChange={(event) => onText(event.target.value)}
          placeholder={t('draw.optionalLabel')}
          className={selectClass}
        />
      </Field>
      <Field label={t('draw.displayName')}>
        <input
          type="text"
          value={draft.name ?? ''}
          onChange={(event) => onName(event.target.value)}
          className={selectClass}
        />
      </Field>
    </div>
  )
}

function CoordinatesPane({
  points,
  t,
  onChange
}: {
  points: DrawingSnapshot['points']
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  onChange: (points: DrawingSnapshot['points']) => void
}): ReactElement {
  if (points.length === 0) {
    return <p className="text-xs text-zinc-500">{t('draw.noCoords')}</p>
  }
  return (
    <div className="space-y-2">
      {points.map((point, index) => (
        <div
          key={index}
          className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2"
        >
          <Field label={t('draw.pointTime', { n: index + 1 })}>
            <input
              type="number"
              value={typeof point.time === 'number' ? point.time : 0}
              onChange={(event) => {
                const next = points.map((item, i) =>
                  i === index ? { ...item, time: Number(event.target.value) as typeof item.time } : item
                )
                onChange(next)
              }}
              className={selectClass}
            />
          </Field>
          <Field label={t('draw.price')}>
            <input
              type="number"
              step="any"
              value={point.price}
              onChange={(event) => {
                const next = points.map((item, i) =>
                  i === index ? { ...item, price: Number(event.target.value) } : item
                )
                onChange(next)
              }}
              className={selectClass}
            />
          </Field>
        </div>
      ))}
    </div>
  )
}

function VisibilityPane({
  draft,
  t,
  onLocked,
  onHidden,
  onIntervals
}: {
  draft: DrawingSnapshot
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  onLocked: (locked: boolean) => void
  onHidden: (hidden: boolean) => void
  onIntervals: (enabled: string[]) => void
}): ReactElement {
  const enabled = timeframesFromVisibility(
    draft.visibility as Parameters<typeof timeframesFromVisibility>[0]
  )
  return (
    <div className="space-y-3">
      <Check label={t('draw.locked')} checked={Boolean(draft.locked)} onChange={onLocked} />
      <Check label={t('draw.hidden')} checked={Boolean(draft.hidden)} onChange={onHidden} />
      <Field label={t('draw.intervals')}>
        <div className="grid grid-cols-4 gap-1.5">
          {TIMEFRAME_IDS.map((tf) => {
            const on = enabled.includes(tf)
            return (
              <label
                key={tf}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-300"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...enabled, tf]
                      : enabled.filter((id) => id !== tf)
                    onIntervals(next.length > 0 ? next : enabled)
                  }}
                  className="h-3.5 w-3.5 accent-primary-500"
                />
                {tf}
              </label>
            )
          })}
        </div>
      </Field>
      <p className="text-[10px] leading-relaxed text-zinc-500">{t('draw.intervalsHint')}</p>
    </div>
  )
}

function ColorInput({
  value,
  onChange
}: {
  value: string | undefined
  onChange: (color: string) => void
}): ReactElement {
  return (
    <input
      type="color"
      value={cssHex(value)}
      onChange={(event) => onChange(event.target.value)}
      className="h-7 w-10 cursor-pointer rounded-md border border-zinc-700 bg-zinc-900"
    />
  )
}

function LineStyleSelect({
  value,
  t,
  onChange
}: {
  value: 'solid' | 'dashed' | 'dotted'
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  onChange: (value: 'solid' | 'dashed' | 'dotted') => void
}): ReactElement {
  return (
    <select
      value={value}
      aria-label={t('draw.line')}
      onChange={(event) => onChange(event.target.value as 'solid' | 'dashed' | 'dotted')}
      className={selectClass}
    >
      {LINE_STYLES.map((style) => (
        <option key={style} value={style}>
          {t(`draw.${style}`)}
        </option>
      ))}
    </select>
  )
}

function WidthSelect({
  value,
  t,
  onChange
}: {
  value: number
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  onChange: (width: number) => void
}): ReactElement {
  return (
    <select
      value={value}
      aria-label={t('draw.width')}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-8 w-16 rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-200"
    >
      {WIDTHS.map((width) => (
        <option key={width} value={width}>
          {width}px
        </option>
      ))}
    </select>
  )
}

function EndSelect({
  value,
  t,
  onChange
}: {
  value: number
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  onChange: (value: number) => void
}): ReactElement {
  return (
    <select
      value={value === 1 ? 1 : 0}
      onChange={(event) => onChange(Number(event.target.value))}
      className={selectClass}
    >
      <option value={0}>{t('draw.end.none')}</option>
      <option value={1}>{t('draw.end.arrow')}</option>
    </select>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-zinc-400">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  )
}

function Check({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}): ReactElement {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-primary-500"
      />
      {label}
    </label>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">{label}</span>
      {children}
    </label>
  )
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full rounded-lg px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
    >
      {label}
    </button>
  )
}

const selectClass =
  'h-8 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-200 focus:border-primary-500/50 focus:outline-none'
