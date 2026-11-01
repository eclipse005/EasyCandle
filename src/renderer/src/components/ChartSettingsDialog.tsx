import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, Trash2, X } from 'lucide-react'
import {
  PRESET_NAME_MAX_LENGTH,
  resolveChartPalette,
  useChartSettingsStore,
  type ColorOverrides
} from '@/store/chartSettingsStore'
import { useThemeStore } from '@/store/themeStore'
import { useT } from '@/i18n/useT'
import { useUiLayoutStore, type ChartSettingsTab } from '@/store/uiLayoutStore'
import { CrosshairMode, LineStyle, PriceScaleMode, type LineWidth } from 'lightweight-charts'

const SETTINGS_TABS: ChartSettingsTab[] = ['symbol', 'canvas', 'scales']

function Group({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="mb-1 text-xs font-medium text-zinc-500">{title}</h3>
      <div className="divide-y divide-white/[0.06]">{children}</div>
    </section>
  )
}

type Rgba = { r: number; g: number; b: number; a: number }

const CHECKERBOARD = 'repeating-conic-gradient(#52525b 0% 25%, transparent 0% 50%) 50% / 8px 8px'

function parseColor(value: string): Rgba {
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value)
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] ? Math.min(1, Math.max(0, Number(rgba[4]))) : 1
    }
  }
  let hex = value.replace('#', '')
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (hex.length === 8) {
    const alpha = parseInt(hex.slice(6, 8), 16) / 255
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: alpha
    }
  }
  return {
    r: parseInt(hex.slice(0, 2), 16) || 0,
    g: parseInt(hex.slice(2, 4), 16) || 0,
    b: parseInt(hex.slice(4, 6), 16) || 0,
    a: 1
  }
}

function toColorString({ r, g, b, a }: Rgba): string {
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  const alpha = Math.round(a * 100) / 100
  return alpha >= 1 ? hex : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function ColorField({
  label,
  value,
  onChange,
  open,
  onOpenChange
}: {
  label: string
  value: string
  onChange: (color: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const { r, g, b, a } = parseColor(value || '#000000')
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  const alphaPercent = Math.round(a * 100)

  function togglePopup(): void {
    if (open) {
      setPos(null)
      onOpenChange(false)
      return
    }
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const POPUP_WIDTH = 240
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPUP_WIDTH - 8))
    setPos({ top: rect.bottom + 4, left })
    onOpenChange(true)
  }

  useEffect(() => {
    if (!open) return undefined

    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popupRef.current?.contains(target)) return
      onOpenChange(false)
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onOpenChange(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  return (
    <div className="min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={togglePopup}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded px-1 py-1 transition-colors ${
          open ? 'bg-zinc-900 ring-1 ring-primary-500/40' : 'hover:bg-zinc-900'
        }`}
      >
        <span
          className="relative h-5 w-7 shrink-0 overflow-hidden rounded-xl border border-zinc-800"
          style={{ background: CHECKERBOARD }}
        >
          <span
            className="absolute inset-0"
            style={{ background: `rgba(${r}, ${g}, ${b}, ${a})` }}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-xs text-zinc-300">{label}</span>
        <span className="shrink-0 text-[9px] tabular-nums text-zinc-500">{alphaPercent}%</span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label={`${label} color`}
            className="fixed z-[70] w-60 rounded-xl border border-zinc-800 bg-zinc-950 p-3 shadow-2xl shadow-black/60"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                {label}
              </span>
              <button
                type="button"
                aria-label="Close color picker"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>

            <label
              className="relative mt-2 block h-20 w-full cursor-pointer overflow-hidden rounded-xl border border-zinc-800"
              style={{ background: CHECKERBOARD }}
            >
              <span
                className="absolute inset-0"
                style={{ background: `rgba(${r}, ${g}, ${b}, ${a})` }}
              />
              <input
                type="color"
                value={hex}
                onChange={(event) =>
                  onChange(toColorString({ ...parseColor(event.target.value), a }))
                }
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`${label} color picker`}
              />
            </label>

            <div className="mt-3 flex items-center gap-2">
              <span className="shrink-0 text-[10px] text-zinc-500">Opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                value={alphaPercent}
                onChange={(event) =>
                  onChange(toColorString({ r, g, b, a: Number(event.target.value) / 100 }))
                }
                className="h-3 min-w-0 flex-1 cursor-pointer accent-primary-500"
                aria-label={`${label} opacity`}
              />
              <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-zinc-400">
                {alphaPercent}%
              </span>
            </div>

            <code className="mt-2 block text-[10px] text-zinc-500">
              {toColorString({ r, g, b, a })}
            </code>
          </div>,
          document.body
        )}
    </div>
  )
}

function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}): ReactElement {
  return (
    <label className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-zinc-200">{label}</span>
      <select
        value={String(value)}
        onChange={(event) => {
          const match = options.find((option) => String(option.value) === event.target.value)
          if (match) onChange(match.value)
        }}
        className="h-8 min-w-[8.5rem] rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-sm text-zinc-100 focus:border-primary-500/50 focus:outline-none"
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ToggleField({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}): ReactElement {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-zinc-200">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-primary-500/80' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full shadow transition-all ${
            checked ? 'translate-x-4 bg-white' : 'translate-x-0 bg-zinc-400'
          }`}
        />
      </button>
    </label>
  )
}

function SaveTemplateAsDialog({
  open,
  onClose,
  onSave
}: {
  open: boolean
  onClose: () => void
  onSave: (name: string) => boolean
}): ReactElement | null {
  const { t } = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    setName('')
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  const trimmed = name.trim()

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-template-title"
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <h2 id="save-template-title" className="text-sm font-semibold text-zinc-100">
            {t('settings.saveTitle')}
          </h2>
          <button
            type="button"
            aria-label={t('settings.close')}
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <form
          className="px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!trimmed) return
            if (onSave(trimmed)) onClose()
          }}
        >
          <label htmlFor="template-name" className="block text-xs text-zinc-400">
            {t('settings.templateName')}
          </label>
          <input
            ref={inputRef}
            id="template-name"
            type="text"
            value={name}
            maxLength={PRESET_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 h-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-200 focus:border-primary-500/50 focus:outline-none"
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center rounded-xl border border-zinc-800 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
            >
              {t('settings.cancel')}
            </button>
            <button
              type="submit"
              disabled={!trimmed}
              className="inline-flex h-8 items-center rounded-xl border border-primary-500/40 bg-primary-500/15 px-3 text-xs font-medium text-primary-300 hover:border-primary-400/70 hover:bg-primary-500/25 hover:text-primary-200 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
            >
              {t('settings.save')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default function ChartSettingsDialog(): ReactElement | null {
  const { t } = useT()
  const open = useUiLayoutStore((s) => s.chartSettingsDialogOpen)
  const tab = useUiLayoutStore((s) => s.chartSettingsTab)
  const setOpen = useUiLayoutStore((s) => s.setChartSettingsDialogOpen)
  const theme = useThemeStore((s) => s.theme)
  const colors = useChartSettingsStore((s) => s.colors)
  const crosshair = useChartSettingsStore((s) => s.crosshair)
  const priceScale = useChartSettingsStore((s) => s.priceScale)
  const timeScale = useChartSettingsStore((s) => s.timeScale)
  const setColors = useChartSettingsStore((s) => s.setColors)
  const setCrosshair = useChartSettingsStore((s) => s.setCrosshair)
  const setPriceScale = useChartSettingsStore((s) => s.setPriceScale)
  const setTimeScale = useChartSettingsStore((s) => s.setTimeScale)
  const resetAll = useChartSettingsStore((s) => s.resetAll)
  const presets = useChartSettingsStore((s) => s.presets)
  const savePreset = useChartSettingsStore((s) => s.savePreset)
  const restorePreset = useChartSettingsStore((s) => s.restorePreset)
  const deletePreset = useChartSettingsStore((s) => s.deletePreset)

  const palette = resolveChartPalette(theme, colors)
  const [openColorKey, setOpenColorKey] = useState<string | null>(null)
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const templateMenuRef = useRef<HTMLDivElement>(null)

  function closeDialog(): void {
    setOpenColorKey(null)
    setTemplateMenuOpen(false)
    setSaveAsOpen(false)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      if (saveAsOpen) return
      if (templateMenuOpen) {
        setTemplateMenuOpen(false)
        return
      }
      if (openColorKey != null) {
        setOpenColorKey(null)
        return
      }
      setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen, openColorKey, templateMenuOpen, saveAsOpen])

  useEffect(() => {
    if (!templateMenuOpen) return undefined

    function onPointerDown(event: PointerEvent): void {
      if (templateMenuRef.current?.contains(event.target as Node)) return
      setTemplateMenuOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [templateMenuOpen])

  if (!open) return null

  const colorField = (key: keyof ColorOverrides, label: string): ReactElement => (
    <ColorField
      label={label}
      value={palette[key] ?? ''}
      onChange={(value) => setColors({ [key]: value })}
      open={openColorKey === key}
      onOpenChange={(isOpen) => setOpenColorKey(isOpen ? key : null)}
    />
  )

  const crosshairModes = [
    { value: CrosshairMode.Normal, label: t('settings.crosshair.normal') },
    { value: CrosshairMode.Magnet, label: t('settings.crosshair.magnet') },
    { value: CrosshairMode.Hidden, label: t('settings.crosshair.hidden') }
  ]
  const lineStyles = [
    { value: LineStyle.Solid, label: t('settings.style.solid') },
    { value: LineStyle.Dotted, label: t('settings.style.dotted') },
    { value: LineStyle.Dashed, label: t('settings.style.dashed') },
    { value: LineStyle.LargeDashed, label: t('settings.style.largeDashed') },
    { value: LineStyle.SparseDotted, label: t('settings.style.sparseDotted') }
  ]
  const lineWidths: { value: LineWidth; label: string }[] = [
    { value: 1, label: '1' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 4, label: '4' }
  ]
  const tabLabel: Record<ChartSettingsTab, 'settings.tab.symbol' | 'settings.tab.canvas' | 'settings.tab.scales'> = {
    symbol: 'settings.tab.symbol',
    canvas: 'settings.tab.canvas',
    scales: 'settings.tab.scales'
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={closeDialog}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-settings-title"
        className="flex h-[min(36rem,calc(100vh-4rem))] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <h2 id="chart-settings-title" className="text-sm font-semibold text-zinc-100">
            {t('settings.title')}
          </h2>
          <button
            type="button"
            aria-label={t('settings.close')}
            onClick={closeDialog}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div
            role="tablist"
            aria-label={t('settings.title')}
            className="flex w-36 shrink-0 flex-col gap-0.5 border-r border-white/[0.06] px-2 py-3"
          >
            {SETTINGS_TABS.map((id) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => useUiLayoutStore.setState({ chartSettingsTab: id })}
                  className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? 'bg-zinc-900 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-200'
                  }`}
                >
                  {t(tabLabel[id])}
                </button>
              )
            })}
          </div>

          <div role="tabpanel" className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-4">
            {tab === 'symbol' ? (
              <>
                <Group title={t('settings.upCandle')}>
                  <div className="grid grid-cols-3 gap-2 py-2">
                    {colorField('upColor', t('settings.body'))}
                    {colorField('borderUpColor', t('settings.border'))}
                    {colorField('wickUpColor', t('settings.wick'))}
                  </div>
                </Group>
                <Group title={t('settings.downCandle')}>
                  <div className="grid grid-cols-3 gap-2 py-2">
                    {colorField('downColor', t('settings.body'))}
                    {colorField('borderDownColor', t('settings.border'))}
                    {colorField('wickDownColor', t('settings.wick'))}
                  </div>
                </Group>
                <Group title={t('settings.line')}>
                  <div className="max-w-xs py-2">{colorField('lineColor', t('settings.line'))}</div>
                </Group>
              </>
            ) : null}

            {tab === 'canvas' ? (
              <>
                <Group title={t('settings.tab.canvas')}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 py-2 sm:grid-cols-3">
                    {colorField('background', t('settings.background'))}
                    {colorField('text', t('settings.text'))}
                    {colorField('grid', t('settings.grid'))}
                    {colorField('scaleBorder', t('settings.scaleBorder'))}
                    {colorField('watermark', t('settings.watermark'))}
                  </div>
                </Group>
                <Group title={t('settings.crosshair')}>
                  {colorField('crosshairColor', t('settings.crosshair'))}
                  <SelectField
                    label={t('settings.crosshairMode')}
                    value={crosshair.mode}
                    options={crosshairModes}
                    onChange={(mode) => setCrosshair({ mode })}
                  />
                  <SelectField
                    label={t('settings.lineStyle')}
                    value={crosshair.lineStyle}
                    options={lineStyles}
                    onChange={(lineStyle) => setCrosshair({ lineStyle })}
                  />
                  <SelectField
                    label={t('settings.lineWidth')}
                    value={crosshair.lineWidth}
                    options={lineWidths}
                    onChange={(lineWidth) => setCrosshair({ lineWidth })}
                  />
                  <ToggleField
                    label={t('settings.showCrosshair')}
                    checked={crosshair.visible}
                    onChange={(visible) => setCrosshair({ visible })}
                  />
                  <ToggleField
                    label={t('settings.showLabels')}
                    checked={crosshair.labelVisible}
                    onChange={(labelVisible) => setCrosshair({ labelVisible })}
                  />
                </Group>
              </>
            ) : null}

            {tab === 'scales' ? (
              <>
                <Group title={t('settings.priceScale')}>
                  <SelectField
                    label={t('scale.mode')}
                    value={priceScale.mode}
                    options={[
                      { value: PriceScaleMode.Normal, label: t('scale.regular') },
                      { value: PriceScaleMode.Percentage, label: t('scale.percent') },
                      { value: PriceScaleMode.IndexedTo100, label: t('scale.indexed') },
                      { value: PriceScaleMode.Logarithmic, label: t('scale.log') }
                    ]}
                    onChange={(mode) => setPriceScale({ mode })}
                  />
                  <ToggleField
                    label={t('scale.auto')}
                    checked={priceScale.autoScale}
                    onChange={(autoScale) => setPriceScale({ autoScale })}
                  />
                  <ToggleField
                    label={t('scale.lockRatio')}
                    checked={priceScale.lockToBarRatio}
                    onChange={(lockToBarRatio) => setPriceScale({ lockToBarRatio })}
                  />
                  <ToggleField
                    label={t('scale.invert')}
                    checked={priceScale.invertScale}
                    onChange={(invertScale) => setPriceScale({ invertScale })}
                  />
                  <ToggleField
                    label={t('scale.scaleChartOnly')}
                    checked={priceScale.scalePriceChartOnly}
                    onChange={(scalePriceChartOnly) => setPriceScale({ scalePriceChartOnly })}
                  />
                  <ToggleField
                    label={t('scale.moveLeft')}
                    checked={priceScale.scaleOnLeft}
                    onChange={(scaleOnLeft) => setPriceScale({ scaleOnLeft })}
                  />
                  <ToggleField
                    label={t('scale.noOverlap')}
                    checked={priceScale.noOverlappingLabels}
                    onChange={(noOverlappingLabels) => setPriceScale({ noOverlappingLabels })}
                  />
                  <ToggleField
                    label={t('scale.countdown')}
                    checked={priceScale.countdownToBarClose}
                    onChange={(countdownToBarClose) => setPriceScale({ countdownToBarClose })}
                  />
                  <ToggleField
                    label={t('scale.prevClose')}
                    checked={priceScale.previousDayClose}
                    onChange={(previousDayClose) => setPriceScale({ previousDayClose })}
                  />
                  <ToggleField
                    label={t('scale.highLow')}
                    checked={priceScale.highAndLow}
                    onChange={(highAndLow) => setPriceScale({ highAndLow })}
                  />
                  <ToggleField
                    label={t('scale.plus')}
                    checked={priceScale.plusButton}
                    onChange={(plusButton) => setPriceScale({ plusButton })}
                  />
                </Group>
                <Group title={t('settings.timeScale')}>
                  <ToggleField
                    label={t('settings.showTime')}
                    checked={timeScale.timeVisible}
                    onChange={(timeVisible) => setTimeScale({ timeVisible })}
                  />
                  <ToggleField
                    label={t('settings.showSeconds')}
                    checked={timeScale.secondsVisible}
                    onChange={(secondsVisible) => setTimeScale({ secondsVisible })}
                  />
                </Group>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3">
          <div ref={templateMenuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={templateMenuOpen}
              onClick={() => setTemplateMenuOpen((value) => !value)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition-colors ${
                templateMenuOpen
                  ? 'border-primary-500/50 bg-primary-950/40 text-primary-300'
                  : 'border-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
              }`}
            >
              {t('settings.template')}
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            </button>
            {templateMenuOpen && (
              <div
                role="menu"
                className="absolute bottom-full left-0 z-50 mb-1 min-w-[11rem] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-xl shadow-black/40"
              >
                {presets.length > 0 && (
                  <>
                    <div className="max-h-40 overflow-y-auto">
                      {[...presets]
                        .sort((a, b) => b.savedAt - a.savedAt)
                        .map((preset) => (
                          <div key={preset.id} className="flex items-center gap-0.5 pr-1">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                restorePreset(preset.id)
                                setTemplateMenuOpen(false)
                              }}
                              className="min-w-0 flex-1 truncate px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100"
                            >
                              {preset.name}
                            </button>
                            <button
                              type="button"
                              aria-label={t('settings.deleteTemplate', { name: preset.name })}
                              onClick={() => deletePreset(preset.id)}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden />
                            </button>
                          </div>
                        ))}
                    </div>
                    <div className="my-1 border-t border-zinc-800" />
                  </>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    resetAll()
                    setTemplateMenuOpen(false)
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100"
                >
                  {t('settings.applyDefaults')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setTemplateMenuOpen(false)
                    setSaveAsOpen(true)
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100"
                >
                  {t('settings.saveAs')}
                </button>
              </div>
            )}
          </div>
          <span className="text-[11px] text-zinc-500">{t('settings.bothPanes')}</span>
        </div>
      </div>
      <SaveTemplateAsDialog
        open={saveAsOpen}
        onClose={() => setSaveAsOpen(false)}
        onSave={savePreset}
      />
    </div>,
    document.body
  )
}
