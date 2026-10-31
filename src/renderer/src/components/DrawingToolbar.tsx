import { memo, useRef, useState, type ReactNode } from 'react'
import {
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Magnet,
  MousePointer2,
  Redo2,
  Settings2,
  Trash2,
  Undo2
} from 'lucide-react'
import IconButton from '@/components/IconButton'
import { DRAWING_TOOL_GROUPS, FAVOURITE_TOOLS, type DrawingToolId } from '@/lib/drawings/drawingTools'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import { useDrawingSettingsStore } from '@/store/drawingSettingsStore'
import { useReplayStore } from '@/store/replayStore'
import { clearAllDrawings } from '@/lib/drawings/drawingActions'

/**
 * TV / FXR drawing toolbar: favourites rail, grouped flyouts (single-click arms
 * the group's default tool; double-click opens the flyout — not settings),
 * magnet modes, keep-drawing, undo/redo, lock, hide/remove menus.
 */
export default memo(function DrawingToolbar() {
  const mode = useReplayStore((s) => s.mode)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const armedTool = useDrawingUiStore((s) => s.armedTool)
  const setArmedTool = useDrawingUiStore((s) => s.setArmedTool)
  const magnet = useDrawingUiStore((s) => s.magnet)
  const setMagnet = useDrawingUiStore((s) => s.setMagnet)
  const stayInDrawingMode = useDrawingUiStore((s) => s.stayInDrawingMode)
  const toggleStayInDrawingMode = useDrawingUiStore((s) => s.toggleStayInDrawingMode)
  const canUndo = useDrawingUiStore((s) => s.canUndo)
  const canRedo = useDrawingUiStore((s) => s.canRedo)
  const undo = useDrawingUiStore((s) => s.undo)
  const redo = useDrawingUiStore((s) => s.redo)
  const drawingsVisible = useDrawingUiStore((s) => s.drawingsVisible)
  const setDrawingsVisible = useDrawingUiStore((s) => s.setDrawingsVisible)
  const drawingsLocked = useDrawingUiStore((s) => s.drawingsLocked)
  const setDrawingsLocked = useDrawingUiStore((s) => s.setDrawingsLocked)
  const setDrawingDialogOpen = useDrawingSettingsStore((s) => s.setDrawingDialogOpen)

  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [hideMenuOpen, setHideMenuOpen] = useState(false)
  const [removeMenuOpen, setRemoveMenuOpen] = useState(false)
  const lastGroupClickRef = useRef<{ id: string; t: number } | null>(null)

  const disabled = mode === 'replay' && replayStatus === 'ended'

  function arm(kind: DrawingToolId | null): void {
    setArmedTool(kind)
    setOpenGroupId(null)
  }

  function onGroupClick(groupId: string, defaultTool: DrawingToolId): void {
    const now = Date.now()
    const last = lastGroupClickRef.current
    if (last && last.id === groupId && now - last.t < 350) {
      // Double-click → open flyout (FXR: not settings).
      setOpenGroupId(groupId)
      lastGroupClickRef.current = null
      return
    }
    lastGroupClickRef.current = { id: groupId, t: now }
    // Single-click → arm the group's first (default) tool.
    window.setTimeout(() => {
      const cur = lastGroupClickRef.current
      if (cur && cur.id === groupId && cur.t === now) {
        arm(armedTool === defaultTool ? null : defaultTool)
        lastGroupClickRef.current = null
      }
    }, 280)
  }

  function renderGroupSubmenu(group: (typeof DRAWING_TOOL_GROUPS)[number]): ReactNode {
    return (
      <div
        role="menu"
        className="absolute left-full top-0 z-[70] ml-1 min-w-[11rem] rounded-2xl border border-white/10 bg-zinc-950/95 py-1.5 shadow-xl shadow-black/40 backdrop-blur-sm"
      >
        <div className="flex items-center gap-1 px-3 pb-1 pt-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-zinc-500">
          {group.label}
          <ChevronRight className="h-3 w-3" />
        </div>
        {group.tools.map((tool) => (
          <button
            key={tool.kind}
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={() => arm(armedTool === tool.kind ? null : tool.kind)}
            className={`flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              armedTool === tool.kind
                ? 'bg-zinc-800 text-primary-300'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
          >
            {tool.label}
          </button>
        ))}
        <div className="my-1 h-px bg-zinc-800" />
        <p className="px-3 py-1 text-[10px] text-zinc-600">Favourites live on the rail above.</p>
      </div>
    )
  }

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      data-tour="drawing-toolbar"
      className="flex h-full w-[49px] shrink-0 flex-col items-center gap-0.5 rounded-2xl border border-white/5 bg-zinc-900/50 px-1.5 py-2 shadow-lg shadow-black/20"
      onContextMenu={(e) => e.preventDefault()}
    >
      <IconButton
        variant="ghost"
        tooltip="Select / pan"
        tooltipSide="right"
        active={armedTool == null}
        disabled={disabled}
        onClick={() => arm(null)}
      >
        <MousePointer2 className="h-6 w-6" strokeWidth={1.25} />
      </IconButton>
      <div className="my-1 h-px w-7 bg-zinc-800" aria-hidden />

      {FAVOURITE_TOOLS.map((tool) => (
        <IconButton
          key={tool.kind}
          variant="ghost"
          tooltip={tool.label}
          tooltipSide="right"
          active={armedTool === tool.kind}
          disabled={disabled}
          onClick={() => arm(armedTool === tool.kind ? null : tool.kind)}
        >
          <tool.icon className="h-5 w-5" strokeWidth={1.25} />
        </IconButton>
      ))}
      <div className="my-1 h-px w-7 bg-zinc-800" aria-hidden />

      {DRAWING_TOOL_GROUPS.map((group) => {
        const defaultTool = group.tools[0]?.kind
        const groupArmed = group.tools.some((t) => t.kind === armedTool)
        return (
          <div key={group.id} className="relative">
            <IconButton
              variant="ghost"
              tooltip={`${group.label} (dbl-click for menu)`}
              tooltipSide="right"
              disabled={disabled || !defaultTool}
              active={openGroupId === group.id || groupArmed}
              onClick={() => {
                if (!defaultTool) return
                onGroupClick(group.id, defaultTool)
              }}
            >
              <group.icon className="h-5 w-5" strokeWidth={1.25} />
            </IconButton>
            {openGroupId === group.id && renderGroupSubmenu(group)}
          </div>
        )
      })}
      <div className="my-1 h-px w-7 bg-zinc-800" aria-hidden />

      <IconButton
        variant="ghost"
        tooltip={`Magnet: ${magnet}`}
        tooltipSide="right"
        active={magnet !== 'off'}
        disabled={disabled}
        onClick={() => setMagnet(magnet === 'off' ? 'weak' : magnet === 'weak' ? 'strong' : 'off')}
      >
        <Magnet className="h-5 w-5" strokeWidth={1.25} />
      </IconButton>

      <IconButton
        variant="ghost"
        tooltip="Keep drawing mode"
        tooltipSide="right"
        active={stayInDrawingMode}
        disabled={disabled}
        onClick={toggleStayInDrawingMode}
      >
        <Pen2 className="h-5 w-5" strokeWidth={1.25} />
      </IconButton>

      <div className="my-1 h-px w-7 bg-zinc-800" aria-hidden />

      <IconButton variant="ghost" tooltip="Undo" tooltipSide="right" disabled={!canUndo} onClick={undo}>
        <Undo2 className="h-5 w-5" strokeWidth={1.25} />
      </IconButton>
      <IconButton variant="ghost" tooltip="Redo" tooltipSide="right" disabled={!canRedo} onClick={redo}>
        <Redo2 className="h-5 w-5" strokeWidth={1.25} />
      </IconButton>

      <IconButton
        variant="ghost"
        tooltip={drawingsLocked ? 'Unlock all drawings' : 'Lock all drawings'}
        tooltipSide="right"
        active={drawingsLocked}
        disabled={disabled}
        onClick={() => setDrawingsLocked(!drawingsLocked)}
      >
        {drawingsLocked ? <Lock className="h-5 w-5" /> : <LockOpen className="h-5 w-5" />}
      </IconButton>

      <div className="relative">
        <IconButton
          variant="ghost"
          tooltip="Hide…"
          tooltipSide="right"
          active={!drawingsVisible || hideMenuOpen}
          disabled={disabled}
          onClick={() => {
            setHideMenuOpen((v) => !v)
            setRemoveMenuOpen(false)
          }}
        >
          {drawingsVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
        </IconButton>
        {hideMenuOpen && (
          <div
            role="menu"
            className="absolute left-full top-0 z-[70] ml-1 min-w-[11rem] rounded-2xl border border-white/10 bg-zinc-950/95 py-1.5 shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={() => {
                setDrawingsVisible(!drawingsVisible)
                setHideMenuOpen(false)
              }}
            >
              {drawingsVisible ? 'Hide all drawings' : 'Show all drawings'}
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <IconButton
          variant="ghost"
          tooltip="Remove…"
          tooltipSide="right"
          active={removeMenuOpen}
          disabled={disabled}
          onClick={() => {
            setRemoveMenuOpen((v) => !v)
            setHideMenuOpen(false)
          }}
        >
          <Trash2 className="h-5 w-5" strokeWidth={1.25} />
        </IconButton>
        {removeMenuOpen && (
          <div
            role="menu"
            className="absolute left-full top-0 z-[70] ml-1 min-w-[11rem] rounded-2xl border border-white/10 bg-zinc-950/95 py-1.5 shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={() => {
                setArmedTool(null)
                clearAllDrawings()
                setRemoveMenuOpen(false)
              }}
            >
              Remove all drawings
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={() => {
                useReplayStore.setState({ activeIndicators: [] })
                setRemoveMenuOpen(false)
              }}
            >
              Remove all indicators
            </button>
          </div>
        )}
      </div>

      <div className="my-1 h-px w-7 bg-zinc-800" aria-hidden />

      <IconButton
        variant="ghost"
        tooltip="Drawing defaults"
        tooltipSide="right"
        disabled={disabled}
        onClick={() => setDrawingDialogOpen(true, 'toolbar')}
      >
        <Settings2 className="h-5 w-5" strokeWidth={1.25} />
      </IconButton>
    </div>
  )
})

function Pen2(props: React.ComponentProps<'svg'>): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}
