import { useMemo, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { Eye, EyeOff, Lock, LockOpen, Trash2, X } from 'lucide-react'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import {
  listAllDrawings,
  removeDrawing,
  setDrawingHidden,
  setDrawingLocked
} from '@/lib/drawings/drawingActions'
import * as bridge from '@/lib/drawings/drawingBridge'

/**
 * FXR empty-RMB "Object tree" / "Table view": list every LCD drawing with
 * quick select / hide / lock / delete and open-settings.
 */
export default function DrawingObjectTreeDialog(): ReactElement | null {
  const open = useDrawingUiStore((s) => s.objectTreeOpen)
  const setOpen = useDrawingUiStore((s) => s.setObjectTreeOpen)
  const revision = useDrawingUiStore((s) => s.revision)
  const openObjectDialog = useDrawingUiStore((s) => s.openObjectDialog)
  const selectedIds = useDrawingUiStore((s) => s.selectedIds)

  void revision
  const drawings = useMemo(() => (open ? listAllDrawings() : []), [open, revision])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 pt-[10vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Object tree"
        className="w-[min(36rem,94vw)] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60"
      >
        <header className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-100">Object tree</p>
            <p className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
              {drawings.length} drawing{drawings.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-auto">
          {drawings.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-zinc-500">No drawings on this chart.</p>
          ) : (
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="sticky top-0 bg-zinc-950 text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drawings.map((d) => {
                  const selected = selectedIds.includes(d.id)
                  return (
                    <tr
                      key={d.id}
                      className={`border-t border-zinc-900 ${
                        selected ? 'bg-primary-950/40' : 'hover:bg-zinc-900/70'
                      }`}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-left hover:text-primary-300"
                          onClick={() => {
                            bridge.getPrimary()?.select([d.id])
                            useDrawingUiStore.getState().setSelectedIds([d.id])
                          }}
                          onDoubleClick={() => {
                            bridge.getPrimary()?.select([d.id])
                            openObjectDialog(d.id)
                            setOpen(false)
                          }}
                        >
                          {d.name || d.kind.replace(/-/g, ' ')}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-zinc-500">{d.kind}</td>
                      <td className="px-3 py-2 text-zinc-500">
                        {d.hidden ? 'hidden' : d.locked ? 'locked' : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label={d.hidden ? 'Show' : 'Hide'}
                            onClick={() => setDrawingHidden(d.id, !d.hidden)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                          >
                            {d.hidden ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label={d.locked ? 'Unlock' : 'Lock'}
                            onClick={() => setDrawingLocked(d.id, !d.locked)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                          >
                            {d.locked ? (
                              <Lock className="h-3.5 w-3.5" />
                            ) : (
                              <LockOpen className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label="Delete"
                            onClick={() => removeDrawing(d.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-950/70 hover:text-red-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
