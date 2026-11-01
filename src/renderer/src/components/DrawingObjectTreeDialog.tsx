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

  return (
      <aside
        aria-label={t('rail.objects')}
        className="flex h-full w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950"
      >
        <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
          <p className="min-w-0 flex-1 text-sm font-medium text-zinc-100">{t('rail.objects')}</p>
          <p className="text-xs tabular-nums text-zinc-500">{drawings.length}</p>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          {drawings.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-zinc-500">{t('rail.noDrawings')}</p>
          ) : (
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="sticky top-0 bg-zinc-950 text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('objects.name')}</th>
                  <th className="px-3 py-2 font-medium">{t('objects.kind')}</th>
                  <th className="px-3 py-2 font-medium">{t('objects.state')}</th>
                  <th className="px-3 py-2 font-medium text-right">
                    {t('objects.actions')}
                  </th>
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
                          }}
                        >
                          {d.name || kindLabel(d.kind, locale)}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {kindLabel(d.kind, locale)}
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {d.hidden
                          ? t('objects.hidden')
                          : d.locked
                            ? t('objects.locked')
                            : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label={d.hidden ? t('objects.show') : t('objects.hide')}
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
                            aria-label={d.locked ? t('objects.unlock') : t('objects.lock')}
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
                            aria-label={t('common.delete')}
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
      </aside>
  )
}
