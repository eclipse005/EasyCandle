import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BringToFront,
  Copy,
  Lock,
  LockOpen,
  MoreHorizontal,
  SendToBack,
  Settings2,
  Trash2,
  EyeOff,
} from 'lucide-react'
import Tooltip from '@/components/Tooltip'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import * as bridge from '@/lib/drawings/drawingBridge'
import {
  bringDrawingToFront,
  cloneDrawing,
  copyDrawing,
  patchDrawingStyle,
  removeDrawing,
  sendDrawingToBack,
  setDrawingHidden,
  setDrawingLocked
} from '@/lib/drawings/drawingActions'

const WIDTH_OPTIONS = [1, 2, 3, 4]

const STYLE_OPTIONS: { value: 'solid' | 'dashed' | 'dotted'; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dashed', label: 'Dashed' }
]

function CloneIcon(props: React.ComponentProps<'svg'>): ReactNode {
  // lucide "Clone" may not exist in older sets — fall back to Copy-like glyph.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16V4a2 2 0 0 1 2-2h12" />
    </svg>
  )
}

/**
 * FX Replay / TV floating style bar for the LCD selection: color, text color,
 * width, line style, settings, lock, delete, and a More menu (clone/copy/z-order/hide).
 */
export default memo(function DrawingSelectionBar(): ReactNode {
  const selectedIds = useDrawingUiStore((s) => s.selectedIds)
  const revision = useDrawingUiStore((s) => s.revision)
  const openObjectDialog = useDrawingUiStore((s) => s.openObjectDialog)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  const id = selectedIds[0] ?? null
  const drawing = id ? bridge.getPrimary()?.get(id) : undefined

  useEffect(() => {
    if (!moreOpen) return undefined
    function onPointerDown(event: PointerEvent): void {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [moreOpen])

  // Keep revision in the dep list so style edits re-render the bar.
  void revision

  if (!id || !drawing) return null

  const style = drawing.style
  const locked = Boolean(drawing.locked)
  const color = style?.color ?? '#2962ff'
  const textColor = style?.textColor ?? color
  const width = style?.width ?? 1
  const lineStyle = (style?.lineStyle ?? 'solid') as 'solid' | 'dashed' | 'dotted'

  return (
    <div
      role="toolbar"
      aria-label="Selected drawing"
      data-tour="drawing-selection-bar"
      className="pointer-events-auto absolute left-1/2 top-3 z-[55] flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-white/10 bg-zinc-950/95 px-1.5 py-1 shadow-xl shadow-black/40 backdrop-blur-sm"
    >
      <span className="mr-0.5 px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
        {drawing.kind.replace(/-/g, ' ')}
      </span>

      <label className="relative inline-flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-lg hover:bg-zinc-800">
        <Tooltip text="Line color" side="bottom">
          <span className="relative block h-4 w-4 overflow-hidden rounded-sm border border-zinc-700">
            <span className="absolute inset-0" style={{ background: color }} />
            <input
              type="color"
              aria-label="Line color"
              value={color.startsWith('#') ? color.slice(0, 7) : '#2962ff'}
              onChange={(e) => patchDrawingStyle(id, { color: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </span>
        </Tooltip>
      </label>

      <label className="relative inline-flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-lg hover:bg-zinc-800">
        <Tooltip text="Text color" side="bottom">
          <span className="relative flex h-4 w-4 items-center justify-center">
            <span className="text-[11px] font-bold" style={{ color: textColor }}>
              T
            </span>
            <span
              className="absolute bottom-0 left-0 right-0 h-0.5"
              style={{ background: textColor }}
            />
            <input
              type="color"
              aria-label="Text color"
              value={textColor.startsWith('#') ? textColor.slice(0, 7) : '#2962ff'}
              onChange={(e) => patchDrawingStyle(id, { textColor: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </span>
        </Tooltip>
      </label>

      <select
        aria-label="Line width"
        value={width}
        onChange={(e) => patchDrawingStyle(id, { width: Number(e.target.value) })}
        className="h-7 rounded-lg border border-zinc-800 bg-zinc-900 px-1 text-[11px] text-zinc-200 focus:border-primary-500/50 focus:outline-none"
      >
        {WIDTH_OPTIONS.map((w) => (
          <option key={w} value={w}>
            {w}px
          </option>
        ))}
      </select>

      <select
        aria-label="Line style"
        value={lineStyle}
        onChange={(e) =>
          patchDrawingStyle(id, {
            lineStyle: e.target.value as 'solid' | 'dashed' | 'dotted'
          })
        }
        className="h-7 max-w-[5.5rem] rounded-lg border border-zinc-800 bg-zinc-900 px-1 text-[11px] text-zinc-200 focus:border-primary-500/50 focus:outline-none"
      >
        {STYLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <Tooltip text="Settings" side="bottom">
        <button
          type="button"
          aria-label="Drawing settings"
          onClick={() => openObjectDialog(id)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </Tooltip>

      <Tooltip text={locked ? 'Unlock' : 'Lock'} side="bottom">
        <button
          type="button"
          aria-label={locked ? 'Unlock drawing' : 'Lock drawing'}
          onClick={() => setDrawingLocked(id, !locked)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
        </button>
      </Tooltip>

      <Tooltip text="Delete" side="bottom">
        <button
          type="button"
          aria-label="Delete drawing"
          onClick={() => removeDrawing(id)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-950/70 hover:text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </Tooltip>

      <div className="relative" ref={moreRef}>
        <Tooltip text="More" side="bottom">
          <button
            type="button"
            aria-label="More drawing actions"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
        {moreOpen && (
          <div
            role="menu"
            className="absolute right-0 top-8 z-[60] min-w-[10rem] rounded-xl border border-white/10 bg-zinc-950 py-1 shadow-xl shadow-black/50"
          >
            <MoreItem
              label="Clone"
              hint="Ctrl+D"
              icon={<CloneIcon className="h-3.5 w-3.5" />}
              onSelect={() => {
                cloneDrawing(id)
                setMoreOpen(false)
              }}
            />
            <MoreItem
              label="Copy"
              hint="Ctrl+C"
              icon={<Copy className="h-3.5 w-3.5" />}
              onSelect={() => {
                copyDrawing(id)
                setMoreOpen(false)
              }}
            />
            <MoreItem
              label="Bring to front"
              icon={<BringToFront className="h-3.5 w-3.5" />}
              onSelect={() => {
                bringDrawingToFront(id)
                setMoreOpen(false)
              }}
            />
            <MoreItem
              label="Send to back"
              icon={<SendToBack className="h-3.5 w-3.5" />}
              onSelect={() => {
                sendDrawingToBack(id)
                setMoreOpen(false)
              }}
            />
            <MoreItem
              label="Hide"
              icon={<EyeOff className="h-3.5 w-3.5" />}
              onSelect={() => {
                setDrawingHidden(id, true)
                setMoreOpen(false)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
})

function MoreItem({
  label,
  hint,
  icon,
  onSelect
}: {
  label: string
  hint?: string
  icon: ReactNode
  onSelect: () => void
}): ReactNode {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
    >
      <span className="text-zinc-500">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint ? <span className="text-[10px] text-zinc-500">{hint}</span> : null}
    </button>
  )
}

// Silence unused import if Clone is missing from lucide in this version.
