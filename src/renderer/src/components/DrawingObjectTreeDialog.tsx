import { useMemo, type ReactElement } from 'react'
import { Eye, EyeOff, Lock, LockOpen, Trash2 } from 'lucide-react'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import {
  listAllDrawings,
  removeDrawing,
  setDrawingHidden,
  setDrawingLocked
} from '@/lib/drawings/drawingActions'
import * as bridge from '@/lib/drawings/drawingBridge'
import { kindLabel } from '@/lib/drawings/drawingProperties'
import { useT } from '@/i18n/useT'

/**
 * Drawing list shown in the right dock when Object tree is selected.
 */
export default function DrawingObjectTreeDialog(): ReactElement {
  const { t, locale } = useT()
  const revision = useDrawingUiStore((s) => s.revision)
  const openObjectDialog = useDrawingUiStore((s) => s.openObjectDialog)
  const selectedIds = useDrawingUiStore((s) => s.selectedIds)

  void revision
  const drawings = useMemo(() => listAllDrawings(), [revision])

  if (drawings.length === 0) {
    return <p className="px-4 py-10 text-center text-xs text-zinc-500">{t('rail.noDrawings')}</p>
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <ul className="flex flex-col divide-y divide-white/[0.06]">
        {drawings.map((drawing) => {
          const selected = selectedIds.includes(drawing.id)
          const kind = kindLabel(drawing.kind, locale)
          const state = drawing.hidden
            ? t('objects.hidden')
            : drawing.locked
              ? t('objects.locked')
              : null
          return (
            <li
              key={drawing.id}
              className={`flex items-center gap-1 px-2.5 py-2.5 transition-colors ${
                selected ? 'bg-primary-950/40' : 'hover:bg-white/[0.03]'
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 px-1 text-left"
                onClick={() => {
                  bridge.getPrimary()?.select([drawing.id])
                  useDrawingUiStore.getState().setSelectedIds([drawing.id])
                }}
                onDoubleClick={() => {
                  bridge.getPrimary()?.select([drawing.id])
                  openObjectDialog(drawing.id)
                }}
              >
                <span className="block truncate text-xs text-zinc-200">
                  {drawing.name || kind}
                </span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-zinc-500">
                  {drawing.name ? <span className="truncate">{kind}</span> : null}
                  {drawing.name && state ? <span className="text-zinc-700">·</span> : null}
                  {state ? <span className="truncate">{state}</span> : null}
                </span>
              </button>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  aria-label={drawing.hidden ? t('objects.show') : t('objects.hide')}
                  onClick={() => setDrawingHidden(drawing.id, !drawing.hidden)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  {drawing.hidden ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={drawing.locked ? t('objects.unlock') : t('objects.lock')}
                  onClick={() => setDrawingLocked(drawing.id, !drawing.locked)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  {drawing.locked ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <LockOpen className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={t('common.delete')}
                  onClick={() => removeDrawing(drawing.id)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-950/60 hover:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
