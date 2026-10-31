/** Per-session description / notes in localStorage (not part of Session blob). */

const STORAGE_KEY = 'bar-replay:session-notes'

type NotesMap = Record<string, string>

function readAll(): NotesMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: NotesMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(map: NotesMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode — ignore */
  }
}

export function getSessionNote(sessionId: string): string {
  if (!sessionId) return ''
  return readAll()[sessionId] ?? ''
}

export function setSessionNote(sessionId: string, note: string): void {
  if (!sessionId) return
  const map = readAll()
  const trimmed = note.trimEnd()
  if (!trimmed) delete map[sessionId]
  else map[sessionId] = trimmed
  writeAll(map)
}

export function clearSessionNote(sessionId: string): void {
  if (!sessionId) return
  const map = readAll()
  if (!(sessionId in map)) return
  delete map[sessionId]
  writeAll(map)
}

/** Drop every per-session note (Settings → clear backtest / all). */
export function clearAllSessionNotes(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* quota / private mode — ignore */
  }
}
