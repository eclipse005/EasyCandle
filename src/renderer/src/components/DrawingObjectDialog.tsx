import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import * as bridge from '@/lib/drawings/drawingBridge'
import { patchDrawing, patchDrawingStyle, setDrawingHidden, setDrawingLocked } from '@/lib/drawings/drawingActions'

type Tab = 'style' | 'text' | 'coordinates' | 'visibility'

const WIDTH_OPTIONS = [1, 2, 3, 4]
const STYLE_OPTIONS: { value: 'solid' | 'dashed' | 'dotted'; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dashed', label: 'Dashed' }
]

/**
 * Per-drawing settings (FXR / TV dblclick): Style / Text / Coordinates / Visibility.
 */
export default function DrawingObjectDialog(): ReactElement | null {
  const id = useDrawingUiStore((s) => s.objectDialogId)
  const revision = useDrawingUiStore((s) => s.revision)
  const openObjectDialog = useDrawingUiStore((s) => s.openObjectDialog)
  const [tab, setTab] = useState<Tab>('style')

  void revision
  const drawing = id ? bridge.getPrimary()?.get(id) : undefined

  useEffect(() => {
    if (!id) setTab('style')
  }, [id])

  useEffect(() => {
    if (!id) return undefined
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') openObjectDialog(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [id, openObjectDialog])

  if (!id || !drawing) return null

  const style = drawing.style
  const color = style?.color ?? '#2962ff'
  const textColor = style?.textColor ?? color
  const width = style?.width ?? 1
  const lineStyle = (style?.lineStyle ?? 'solid') as 'solid' | 'dashed' | 'dotted'
  const labelText = style?.text ?? drawing.text ?? ''
  const locked = Boolean(drawing.locked)
  const hidden = Boolean(drawing.hidden)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'style', label: 'Style' },
    { id: 'text', label: 'Text' },
    { id: 'coordinates', label: 'Coordinates' },
    { id: 'visibility', label: 'Visibility' }
  ]

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) openObjectDialog(null)
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Drawing settings"
        className="w-[min(26rem,92vw)] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60"
      >
        <header className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">
              {drawing.name || drawing.kind.replace(/-/g, ' ')}
            </p>
            <p className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{drawing.kind}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => openObjectDialog(null)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <nav className="flex gap-0.5 border-b border-zinc-800 px-2 pt-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg px-3 py-1.5 text-xs transition-colors ${
                tab === t.id
                  ? 'bg-zinc-900 text-primary-300'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="space-y-3 px-4 py-4">
          {tab === 'style' && (
            <>
              <Field label="Color">
                <input
                  type="color"
                  value={color.startsWith('#') ? color.slice(0, 7) : '#2962ff'}
                  onChange={(e) => patchDrawingStyle(id, { color: e.target.value })}
                  className="h-8 w-full cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900"
                />
              </Field>
              <Field label="Line width">
                <select
                  value={width}
                  onChange={(e) => patchDrawingStyle(id, { width: Number(e.target.value) })}
                  className={selectClass}
                >
                  {WIDTH_OPTIONS.map((w) => (
                    <option key={w} value={w}>
                      {w}px
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Line style">
                <select
                  value={lineStyle}
                  onChange={(e) =>
                    patchDrawingStyle(id, {
                      lineStyle: e.target.value as 'solid' | 'dashed' | 'dotted'
                    })
                  }
                  className={selectClass}
                >
                  {STYLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          {tab === 'text' && (
            <>
              <Field label="Text color">
                <input
                  type="color"
                  value={textColor.startsWith('#') ? textColor.slice(0, 7) : '#2962ff'}
                  onChange={(e) => patchDrawingStyle(id, { textColor: e.target.value })}
                  className="h-8 w-full cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900"
                />
              </Field>
              <Field label="Label">
                <input
                  type="text"
                  value={labelText}
                  onChange={(e) => {
                    const value = e.target.value
                    patchDrawingStyle(id, { text: value })
                    patchDrawing(id, { text: value })
                  }}
                  placeholder="Optional label"
                  className={selectClass}
                />
              </Field>
              <Field label="Display name">
                <input
                  type="text"
                  value={drawing.name ?? ''}
                  onChange={(e) => patchDrawing(id, { name: e.target.value || undefined })}
                  placeholder={drawing.kind}
                  className={selectClass}
                />
              </Field>
            </>
          )}

          {tab === 'coordinates' && (
            <div className="space-y-2">
              {(drawing.points ?? []).map((p, index) => (
                <div
                  key={index}
                  className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2"
                >
                  <Field label={`Point ${index + 1} time`}>
                    <input
                      type="number"
                      value={typeof p.time === 'number' ? p.time : 0}
                      onChange={(e) => {
                        const points = (drawing.points ?? []).map((pt, i) =>
                          i === index
                            ? { ...pt, time: Number(e.target.value) as typeof pt.time }
                            : pt
                        )
                        patchDrawing(id, { points: points as typeof drawing.points })
                      }}
                      className={selectClass}
                    />
                  </Field>
                  <Field label="Price">
                    <input
                      type="number"
                      step="any"
                      value={p.price}
                      onChange={(e) => {
                        const points = (drawing.points ?? []).map((pt, i) =>
                          i === index ? { ...pt, price: Number(e.target.value) } : pt
                        )
                        patchDrawing(id, { points: points as typeof drawing.points })
                      }}
                      className={selectClass}
                    />
                  </Field>
                </div>
              ))}
              {(drawing.points ?? []).length === 0 && (
                <p className="text-xs text-zinc-500">No editable coordinates for this drawing.</p>
              )}
            </div>
          )}

          {tab === 'visibility' && (
            <>
              <label className="flex items-center justify-between gap-3 text-xs text-zinc-300">
                <span>Locked</span>
                <input
                  type="checkbox"
                  checked={locked}
                  onChange={(e) => setDrawingLocked(id, e.target.checked)}
                  className="h-4 w-4 accent-primary-500"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-xs text-zinc-300">
                <span>Hidden</span>
                <input
                  type="checkbox"
                  checked={hidden}
                  onChange={(e) => setDrawingHidden(id, e.target.checked)}
                  className="h-4 w-4 accent-primary-500"
                />
              </label>
              <p className="text-[10px] leading-relaxed text-zinc-500">
                Interval visibility (show on M1 / H1 / …) is not wired yet — drawings stay visible on
                every timeframe.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

const selectClass =
  'h-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-200 focus:border-primary-500/50 focus:outline-none'

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  )
}
