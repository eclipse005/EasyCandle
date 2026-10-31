import { memo, useState, type ReactNode } from 'react'
import {
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

/**
 * TV-style drawing toolbar: a favourites rail (visible by default), grouped
 * tool submenus, magnet modes, keep-drawing, undo/redo, lock, hide, and
 * clear — all backed by the lightweight-charts-drawing DrawingManager.
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
  const setDrawingDialogOpen = useDrawingSettingsStore((s) => s.setDrawingDialogOpen)

  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)

  const disabled = mode === 'replay' && replayStatus === 'ended'

  function arm(kind: DrawingToolId | null): void {
    setArmedTool(kind)
    setOpenGroupId(null)
  }

  function renderGroupSubmenu(group: (typeof DRAWING_TOOL_GROUPS)[number]): ReactNode {
    return (
      <div
        role="menu"
        className="absolute left-full top-0 z-[70] ml-1 min-w-[11rem] rounded-2xl border border-white/10 bg-zinc-950/95 py-1.5 shadow-xl shadow-black/40 backdrop-blur-sm"
      >
        {group.tools.map((tool) => (
          <button
            key={tool.kind}
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={() => arm(armedTool === tool.kind ? null : tool.kind)}
            className={`flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              armedTool === tool.kind
                ? 'bg-zinc-800 text-amber-300'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
          >
            {tool.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      data-tour="drawing-toolbar"
      className="flex h-full w-[49px] shrink-0 flex-col items-center gap-0.5 rounded-2xl border border-white/5 bg-zinc-900/50 px-1.5 py-2 shadow-lg shadow-black/20"
    >
      {/* Select / pan */}
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

      {/* Favourites rail */}
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

      {/* Grouped tool submenus */}
      {DRAWING_TOOL_GROUPS.map((group) => (
        <div key={group.id} className="relative">
          <IconButton
            variant="ghost"
            tooltip={group.label}
            tooltipSide="right"
            disabled={disabled}
            active={openGroupId === group.id}
            onClick={() => setOpenGroupId(openGroupId === group.id ? null : group.id)}
          >
            <group.icon className="h-5 w-5" strokeWidth={1.25} />
          </IconButton>
          {openGroupId === group.id && renderGroupSubmenu(group)}
        </div>
      ))}
      <div className="my-1 h-px w-7 bg-zinc-800" aria-hidden />

      {/* Magnet */}
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

      {/* Keep drawing */}
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

      {/* Undo / redo */}
      <IconButton variant="ghost" tooltip="Undo" tooltipSide="right" disabled={!canUndo} onClick={undo}>
        <Undo2 className="h-5 w-5" strokeWidth={1.25} />
      </IconButton>
      <IconButton variant="ghost" tooltip="Redo" tooltipSide="right" disabled={!canRedo} onClick={redo}>
        <Redo2 className="h-5 w-5" strokeWidth={1.25} />
      </IconButton>

      {/* Lock */}
      <IconButton
        variant="ghost"
        tooltip={locked ? 'Unlock drawings' : 'Lock drawings'}
        tooltipSide="right"
        active={locked}
        disabled={disabled}
        onClick={() => setLocked((v) => !v)}
      >
        {locked ? <Lock className="h-5 w-5" /> : <LockOpen className="h-5 w-5" />}
      </IconButton>

      {/* Hide / show */}
      <IconButton
        variant="ghost"
        tooltip={drawingsVisible ? 'Hide all drawings' : 'Show all drawings'}
        tooltipSide="right"
        active={!drawingsVisible}
        disabled={disabled}
        onClick={() => setDrawingsVisible(!drawingsVisible)}
      >
        {drawingsVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
      </IconButton>

      {/* Clear */}
      <IconButton
        variant="ghost"
        tooltip="Remove all drawings"
        tooltipSide="right"
        disabled={disabled}
        onClick={() => {
          setArmedTool(null)
          bridge_clearAll()
        }}
      >
        <Trash2 className="h-5 w-5" strokeWidth={1.25} />
      </IconButton>

      <div className="my-1 h-px w-7 bg-zinc-800" aria-hidden />

      {/* Settings */}
      <IconButton
        variant="ghost"
        tooltip="Drawing settings"
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
  return <Pen2Inner {...props} />
}

function Pen2Inner(props: React.ComponentProps<'svg'>): ReactNode {
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

function bridge_clearAll(): void {
  // Delegate to the UI store's armed tool disarm + lib clear.
  const ui = useDrawingUiStore.getState()
  ui.setArmedTool(null)
  ui.bumpRevision()
  // The lib clear is done via the manager directly.
  import('@/lib/drawings/drawingBridge').then((bridge) => {
    bridge.getPrimary()?.clear()
    bridge.getSecondary()?.clear()
    ui.refreshUndoRedo()
  })
}
