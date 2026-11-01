import { useState, type FormEvent, type ReactElement } from 'react'
import { Check, FolderOpen, FolderPlus, LogOut, Save, Settings2, Trash2 } from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import SoftConfirmDialog from '@/components/ui/SoftConfirmDialog'
import { useT } from '@/i18n/useT'
import { useSessionStore } from '@/store/sessionStore'
import Tooltip from '@/components/Tooltip'

export default function SessionDropdown(): ReactElement {
  const { t } = useT()
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const createSession = useSessionStore((s) => s.createSession)
  const loadSession = useSessionStore((s) => s.loadSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const saveActiveSession = useSessionStore((s) => s.saveActiveSession)
  const setSessionAutoSave = useSessionStore((s) => s.setSessionAutoSave)
  const closeActiveSession = useSessionStore((s) => s.closeActiveSession)
  const [name, setName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const active = sessions.find((session) => session.id === activeSessionId) ?? null

  function handleCreate(event: FormEvent): void {
    event.preventDefault()
    const id = createSession(name)
    if (id != null) setName('')
  }

  return (
    <>
      <Dropdown
        align="end"
        menuClassName="w-72"
        trigger={({ open, toggle }) => (
          <Tooltip text={t('sessions.title')} side="bottom">
            <button
              type="button"
              onClick={toggle}
              aria-label={t('sessions.title')}
              aria-expanded={open}
              data-tour="sessions"
              className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-2 text-xs font-medium transition-colors ${
                open || active
                  ? 'border-primary-500/50 bg-primary-950/40 text-primary-300'
                  : 'border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
              }`}
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </button>
          </Tooltip>
        )}
      >
        {({ close }) => (
          <>
            <form
              onSubmit={handleCreate}
              className="flex items-center gap-1.5 border-b border-zinc-800 px-2 py-1.5"
            >
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('sessions.placeholder')}
                aria-label={t('sessions.placeholder')}
                className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-primary-500/50"
              />
              <button
                type="submit"
                aria-label={t('sessions.createAria')}
                title={t('sessions.createTip')}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-zinc-800 text-zinc-300 transition-colors hover:border-primary-500/50 hover:text-primary-300"
              >
                <FolderPlus className="h-3.5 w-3.5" aria-hidden />
              </button>
            </form>

            {active && (
              <div className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-primary-300">
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{active.name}</span>
                  </span>
                  <div className="flex gap-1">
                    <Tooltip text={t('sessions.saveNow')} side="top">
                      <button
                        type="button"
                        onClick={() => void saveActiveSession()}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-300 hover:bg-zinc-700/60 transition-colors hover:text-primary-300"
                      >
                        <Save className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </Tooltip>
                    <Tooltip text={t('sessions.exit')} side="top">
                      <button
                        type="button"
                        onClick={() => {
                          void closeActiveSession()
                          close()
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-300 transition-colors hover:text-red-400 hover:bg-zinc-700/60"
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </Tooltip>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="block truncate text-[10px] text-zinc-500">
                    {t('trades.count', {
                      count: active.closedTrades.length + active.positions.length,
                      suffix: active.closedTrades.length + active.positions.length === 1 ? '' : 's'
                    })}
                  </span>
                  <button
                    type="button"
                    aria-pressed={active.autoSave}
                    onClick={() => setSessionAutoSave(active.id, !active.autoSave)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors bg-zinc-800 ${
                      active.autoSave
                        ? 'text-primary-300'
                        : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${active.autoSave ? 'bg-primary-400' : 'bg-zinc-600'}`}
                    />
                    {t('sessions.autoSave')}
                  </button>
                </div>
              </div>
            )}

            {sessions.length > 1 && active && <div className="my-1 h-px bg-zinc-800" />}

            {sessions.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-zinc-500">{t('sessions.none')}</p>
            ) : (
              <div className="max-h-56 overflow-y-auto px-1">
                {sessions.map((session) => {
                  const isActive = session.id === activeSessionId
                  return (
                    !isActive && (
                      <div
                        key={session.id}
                        className="group flex items-center gap-1 rounded px-1.5 py-1 hover:bg-zinc-800/60"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            void loadSession(session.id)
                            close()
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 text-left"
                        >
                          {isActive ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-primary-300" aria-hidden />
                          ) : (
                            <FolderOpen
                              className="h-3.5 w-3.5 shrink-0 text-zinc-500"
                              aria-hidden
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-zinc-200 mb-1">
                              {session.name}
                            </span>
                            <span className="block truncate text-[10px] text-zinc-500">
                              {t('trades.count', {
                                count: session.closedTrades.length + session.positions.length,
                                suffix:
                                  session.closedTrades.length + session.positions.length === 1
                                    ? ''
                                    : 's'
                              })}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`${t('sessions.deleteAria')} ${session.name}`}
                          onClick={() => setPendingDelete({ id: session.id, name: session.name })}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    )
                  )
                })}
              </div>
            )}

            <div className="my-1 h-px bg-zinc-800" />
            <button
              type="button"
              onClick={() => {
                void closeActiveSession()
                close()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100"
            >
              <Settings2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
              <span className="flex-1 font-medium">{t('sessions.manage')}</span>
            </button>
          </>
        )}
      </Dropdown>
      <SoftConfirmDialog
        open={pendingDelete != null}
        title={t('sessions.deleteTitle')}
        description={
          pendingDelete ? t('sessions.deleteBody', { name: pendingDelete.name }) : undefined
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteSession(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </>
  )
}
