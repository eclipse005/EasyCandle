import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { GripVertical, Minus, X } from 'lucide-react'
import { clampPanelPos, type PanelPos } from '@/store/uiLayoutStore'

/** Pointer travel below this is a click, not a drag. */
const DRAG_CLICK_PX = 4

type FloatingPanelProps = {
  title?: string
  minimized?: boolean
  minimizedLabel?: string
  pos: PanelPos | null
  onPosChange: (pos: PanelPos) => void
  onMinimizedChange?: (minimized: boolean) => void
  /** Shown on the minimized pill. A click expands; a drag moves. */
  minimizedTitle?: string
  /** When set, show a close control that calls this (e.g. exit fullscreen-only panels). */
  onClose?: () => void
  /** Extra actions rendered in the header (e.g. custom icon buttons). */
  headerActions?: ReactNode
  /** Prefer bottom-center when pos is null; otherwise top-left / top-right. */
  defaultPlacement?: 'bottom-center' | 'top-left' | 'top-right'
  /** parent = stay inside the chart card. viewport = drag anywhere on the page. */
  scope?: 'parent' | 'viewport'
  /** header = title bar. inline = grip sits on the same row as the controls. */
  chrome?: 'header' | 'inline'
  /** Drag from anywhere on the panel, not only the grip. A click without movement still hits buttons. */
  dragFromAnywhere?: boolean
  /** Write the computed first-run position to storage (default true). */
  persistDefault?: boolean
  /** Top inset for top-left / top-right defaults. */
  topInset?: number
  /** Bottom inset for bottom-center defaults (leave room for a footer). */
  bottomInset?: number
  className?: string
  children: ReactNode
}

export default memo(function FloatingPanel({
  title,
  minimized = false,
  minimizedLabel,
  minimizedTitle,
  pos,
  onPosChange,
  onMinimizedChange,
  onClose,
  headerActions,
  defaultPlacement = 'bottom-center',
  scope = 'parent',
  chrome = 'header',
  dragFromAnywhere = false,
  persistDefault = true,
  topInset = 48,
  bottomInset = 16,
  className = '',
  children
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef<{ x: number; y: number } | null>(null)
  const dragPosRef = useRef<PanelPos | null>(null)
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null)
  const dragMoved = useRef(false)
  const expandOnClickRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [dragPos, setDragPos] = useState<PanelPos | null>(null)
  const [previewPos, setPreviewPos] = useState<PanelPos | null>(null)

  const resolveDefaultPos = useCallback(
    (container: DOMRect, panel: DOMRect): PanelPos => {
      if (defaultPlacement === 'top-left') {
        return clampPanelPos({ x: 12, y: topInset }, container.width, container.height, panel.width, panel.height)
      }
      if (defaultPlacement === 'top-right') {
        return clampPanelPos(
          { x: Math.round(container.width - panel.width - 12), y: topInset },
          container.width,
          container.height,
          panel.width,
          panel.height
        )
      }
      return clampPanelPos(
        {
          x: Math.round((container.width - panel.width) / 2),
          y: Math.round(container.height - panel.height - bottomInset)
        },
        container.width,
        container.height,
        panel.width,
        panel.height
      )
    },
    [defaultPlacement, topInset, bottomInset]
  )

  const frame = useCallback((): { left: number; top: number; width: number; height: number } | null => {
    if (scope === 'viewport') {
      return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    }
    const parent = panelRef.current?.offsetParent as HTMLElement | null
    if (!parent) return null
    const rect = parent.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  }, [scope])

  const clampToParent = useCallback(
    (next: PanelPos): PanelPos | null => {
      const el = panelRef.current
      const box = frame()
      if (!el || !box || box.width <= 0 || box.height <= 0) return null
      const panelRect = el.getBoundingClientRect()
      return clampPanelPos(next, box.width, box.height, panelRect.width, panelRect.height)
    },
    [frame]
  )

  useLayoutEffect(() => {
    const el = panelRef.current
    const box = frame()
    if (!el || !box || box.width <= 0) return

    const panelRect = el.getBoundingClientRect()
    if (panelRect.width <= 0 || panelRect.height <= 0) return

    const next =
      pos == null
        ? resolveDefaultPos(
            { width: box.width, height: box.height } as DOMRect,
            panelRect
          )
        : clampPanelPos(pos, box.width, box.height, panelRect.width, panelRect.height)

    if (pos == null) {
      if (persistDefault) onPosChange(next)
      else setPreviewPos(next)
      return
    }
    if (next.x !== pos.x || next.y !== pos.y) {
      onPosChange(next)
    }
  }, [pos, minimized, resolveDefaultPos, onPosChange, frame, persistDefault])

  useEffect(() => {
    const el = panelRef.current
    if (!el) return

    const reclamp = (): void => {
      const current = pos ?? previewPos
      const box = frame()
      if (current == null || !box) return
      const panelRect = el.getBoundingClientRect()
      if (panelRect.width <= 0 || panelRect.height <= 0) return
      const next = clampPanelPos(current, box.width, box.height, panelRect.width, panelRect.height)
      if (pos == null) {
        setPreviewPos((prev) => (prev && prev.x === next.x && prev.y === next.y ? prev : next))
      } else if (next.x !== current.x || next.y !== current.y) {
        onPosChange(next)
      }
    }

    const observer = new ResizeObserver(reclamp)
    observer.observe(el)
    const parent = scope === 'parent' ? (el.offsetParent as HTMLElement | null) : null
    if (parent) observer.observe(parent)
    if (scope === 'viewport') window.addEventListener('resize', reclamp)
    return () => {
      observer.disconnect()
      if (scope === 'viewport') window.removeEventListener('resize', reclamp)
    }
  }, [pos, previewPos, onPosChange, frame, scope])

  useEffect(() => {
    if (!dragging) return undefined

    function onPointerMove(event: PointerEvent): void {
      if (!dragOffset.current) return
      const origin = pointerOrigin.current
      if (origin) {
        const dx = event.clientX - origin.x
        const dy = event.clientY - origin.y
        if (dx * dx + dy * dy > DRAG_CLICK_PX * DRAG_CLICK_PX) dragMoved.current = true
      }
      if (!dragMoved.current) return
      const box = frame()
      if (!box) return
      const raw: PanelPos = {
        x: event.clientX - box.left - dragOffset.current.x,
        y: event.clientY - box.top - dragOffset.current.y
      }
      const clamped = clampToParent(raw)
      if (clamped) {
        dragPosRef.current = clamped
        setDragPos(clamped)
      }
    }

    function onPointerUp(): void {
      const final = dragPosRef.current
      const moved = dragMoved.current
      const shouldExpand = expandOnClickRef.current && !moved
      dragOffset.current = null
      dragPosRef.current = null
      pointerOrigin.current = null
      expandOnClickRef.current = false
      dragMoved.current = false
      setDragPos(null)
      setDragging(false)
      if (moved) {
        const stopClick = (click: MouseEvent): void => {
          click.preventDefault()
          click.stopPropagation()
          window.removeEventListener('click', stopClick, true)
        }
        window.addEventListener('click', stopClick, true)
      }
      if (final) onPosChange(final)
      if (shouldExpand) onMinimizedChange?.(false)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [dragging, clampToParent, onPosChange, onMinimizedChange, frame])

  function beginDrag(
    event: ReactPointerEvent<HTMLElement>,
    expandOnClick: boolean,
    keepClick = false
  ): void {
    if (event.button !== 0) return
    const el = panelRef.current
    const box = frame()
    if (!el || !box) return
    expandOnClickRef.current = expandOnClick
    dragMoved.current = false
    pointerOrigin.current = { x: event.clientX, y: event.clientY }
    const panelRect = el.getBoundingClientRect()
    dragOffset.current = {
      x: event.clientX - panelRect.left,
      y: event.clientY - panelRect.top
    }
    if (pos == null) {
      onPosChange({
        x: panelRect.left - box.left,
        y: panelRect.top - box.top
      })
    }
    setDragging(true)
    if (!keepClick) event.preventDefault()
  }

  const displayPos = dragPos ?? pos ?? previewPos
  const style =
    displayPos != null
      ? { left: displayPos.x, top: displayPos.y }
      : defaultPlacement === 'bottom-center'
        ? { left: '50%', bottom: bottomInset, top: 'auto' as const, transform: 'translateX(-50%)' }
        : defaultPlacement === 'top-right'
          ? { right: 12, top: topInset, left: 'auto' as const }
          : { left: 12, top: topInset }
  const placed = scope === 'viewport' ? 'fixed' : 'absolute'

  const grip = (
    <button
      type="button"
      aria-label="Drag panel"
      title="Drag"
      onPointerDown={(event) => beginDrag(event, false)}
      className={`inline-flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300 active:cursor-grabbing ${
        dragging ? 'cursor-grabbing text-zinc-300' : ''
      }`}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )

  if (minimized) {
    const node = (
      <div
        ref={panelRef}
        className={`pointer-events-auto z-[60] ${placed} ${className}`}
        style={style}
      >
        <button
          type="button"
          title={minimizedTitle}
          aria-label={minimizedTitle ?? minimizedLabel ?? title ?? 'Controls'}
          onPointerDown={(event) => beginDrag(event, true)}
          className={`inline-flex h-8 cursor-grab items-center gap-1.5 rounded-full border border-primary-500/50 bg-zinc-900/95 px-2.5 text-xs font-medium text-primary-300 shadow-lg shadow-black/40 hover:border-primary-400 hover:text-primary-200 active:cursor-grabbing ${
            dragging ? 'cursor-grabbing' : ''
          }`}
        >
          <GripVertical className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
          {minimizedLabel ?? title ?? 'Controls'}
        </button>
      </div>
    )
    return scope === 'viewport' ? createPortal(node, document.body) : node
  }

  const minimizeButton = onMinimizedChange ? (
    <button
      type="button"
      aria-label="Minimize panel"
      title="Minimize"
      onClick={() => onMinimizedChange(true)}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
    >
      <Minus className="h-3.5 w-3.5" />
    </button>
  ) : null

  const closeButton = onClose ? (
    <button
      type="button"
      aria-label="Close panel"
      title="Close"
      onClick={onClose}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  ) : null

  const node = (
    <div
      ref={panelRef}
      className={`pointer-events-auto z-[80] max-w-[calc(100vw-1rem)] rounded-2xl border border-white/10 bg-zinc-900/95 shadow-lg shadow-black/30 backdrop-blur-sm ${placed} ${
        dragFromAnywhere ? 'cursor-grab active:cursor-grabbing' : ''
      } ${className}`}
      style={{ ...style, position: placed, zIndex: 80 }}
      onPointerDown={dragFromAnywhere ? (event) => beginDrag(event, false, true) : undefined}
    >
      {chrome === 'inline' ? (
        <div className="flex items-center gap-1 px-1 py-1">
          {grip}
          <div className="shrink-0">{children}</div>
          {headerActions}
          {minimizeButton}
          {closeButton}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 border-b border-white/5 px-1.5 py-1">
            {grip}
            {title ? (
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                {title}
              </span>
            ) : (
              <span className="min-w-0 flex-1" />
            )}
            {headerActions}
            {minimizeButton}
            {closeButton}
          </div>
          <div className="px-2 py-2">{children}</div>
        </>
      )}
    </div>
  )

  return scope === 'viewport' ? createPortal(node, document.body) : node
})
