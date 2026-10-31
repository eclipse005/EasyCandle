import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  Compass,
  ExternalLink,
  Home,
  Info,
  Keyboard,
  Moon,
  PanelBottom,
  PenLine,
  Play,
  TrendingUp,
  type LucideIcon
} from 'lucide-react'
import { useReplayStore } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'
import { useThemeStore } from '@/store/themeStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import iconUrl from '@/assets/barreplay-icon.svg'

type MenuEntry =
  | {
      type: 'item'
      label: string
      icon?: LucideIcon
      shortcut?: string
      checked?: boolean
      disabled?: boolean
      title?: string
      /** When set the entry renders as a real link opening in a new tab. */
      href?: string
      onSelect: () => void
    }
  | { type: 'separator' }

function MenuEntryView({ entry, onClose }: { entry: MenuEntry; onClose: () => void }): ReactNode {
  if (entry.type === 'separator') {
    return <div className="my-1 h-px bg-zinc-800" />
  }

  const checkable = entry.checked !== undefined
  const Icon = entry.icon

  if (entry.href) {
    return (
      <a
        role="menuitem"
        href={entry.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
        title={entry.title}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
      >
        <span className="flex w-4 shrink-0 items-center justify-center">
          {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
        </span>
        <span className="flex-1">{entry.label}</span>
      </a>
    )
  }

  return (
    <button
      type="button"
      role={checkable ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={checkable ? entry.checked : undefined}
      disabled={entry.disabled}
      title={entry.title}
      onClick={() => {
        entry.onSelect()
        onClose()
      }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex w-4 shrink-0 items-center justify-center">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
      </span>
      <span className="flex-1">{entry.label}</span>
      {entry.shortcut && (
        <span className="ml-4 shrink-0 text-[10px] text-zinc-500">{entry.shortcut}</span>
      )}
      {checkable && (
        <span
          aria-hidden
          className={`ml-3 inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
            entry.checked ? 'bg-amber-500/90' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`h-3 w-3 rounded-full bg-zinc-100 shadow transition-transform ${
              entry.checked ? 'translate-x-3.5' : 'translate-x-0.5'
            }`}
          />
        </span>
      )}
    </button>
  )
}

/**
 * App entry in the top-left corner of the main toolbar: logo + name, click to
 * open the unified settings panel (theme, panel visibility, dialogs, help).
 * Replaces the desktop menu bar; always visible so the panel can never be
 * unreachable through its own toggles.
 */
export default function AppMenu() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<boolean>(false)

  const chartFullscreen = useUiLayoutStore((s) => s.chartFullscreen)
  const showStatusBar = useUiLayoutStore((s) => s.showStatusBar)
  const showDrawingToolbar = useUiLayoutStore((s) => s.showDrawingToolbar)
  const showReplayControls = useUiLayoutStore((s) => s.showReplayControls)
  const showPaperTrade = useUiLayoutStore((s) => s.showPaperTrade)
  const toggleStatusBar = useUiLayoutStore((s) => s.toggleStatusBar)
  const toggleDrawingToolbar = useUiLayoutStore((s) => s.toggleDrawingToolbar)
  const toggleReplayControls = useUiLayoutStore((s) => s.toggleReplayControls)
  const togglePaperTrade = useUiLayoutStore((s) => s.togglePaperTrade)
  const setShortcutsDialogOpen = useUiLayoutStore((s) => s.setShortcutsDialogOpen)
  const closeActiveSession = useSessionStore((s) => s.closeActiveSession)
  const setAboutDialogOpen = useUiLayoutStore((s) => s.setAboutDialogOpen)
  const startTour = useUiLayoutStore((s) => s.startTour)
  const inReplay = useReplayStore((s) => s.mode === 'replay')
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  const entries: MenuEntry[] = [
    {
      type: 'item',
      label: 'Sessions home',
      icon: Home,
      onSelect: () => void closeActiveSession()
    },
    { type: 'separator' },
    {
      type: 'item',
      label: 'Dark theme',
      icon: Moon,
      checked: theme === 'dark',
      onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark')
    },
    {
      type: 'item',
      label: 'Paper trade',
      icon: TrendingUp,
      checked: showPaperTrade,
      onSelect: togglePaperTrade
    },
    {
      type: 'item',
      label: 'Status bar',
      icon: PanelBottom,
      checked: showStatusBar,
      onSelect: toggleStatusBar
    },
    {
      type: 'item',
      label: 'Drawing toolbar',
      icon: PenLine,
      checked: showDrawingToolbar,
      onSelect: toggleDrawingToolbar
    },
    {
      type: 'item',
      label: 'Replay controls',
      icon: Play,
      checked: showReplayControls,
      onSelect: toggleReplayControls
    },
    { type: 'separator' },
    {
      type: 'item',
      label: 'Take a tour',
      icon: Compass,
      disabled: inReplay,
      title: inReplay ? 'Exit replay to take the tour' : undefined,
      onSelect: startTour
    },
    {
      type: 'item',
      label: 'Keyboard shortcuts',
      icon: Keyboard,
      onSelect: () => setShortcutsDialogOpen(true)
    },
    {
      type: 'item',
      label: 'About',
      icon: Info,
      onSelect: () => setAboutDialogOpen(true)
    },
    { type: 'separator' },
    {
      type: 'item',
      label: 'GitHub (BarReplay)',
      icon: ExternalLink,
      href: 'https://github.com/eclipse005/EasyCandle',
      onSelect: () => {}
    }
  ]

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-stretch">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        data-tour="app-menu"
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1.5 rounded px-2 py-1 transition-colors ${
          open ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
        }`}
      >
        <img src={iconUrl} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded-sm" aria-hidden />
        <span className="text-xs font-bold tracking-tight text-amber-400">BarReplay</span>
        <ChevronDown className={`h-3 w-3 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && !chartFullscreen && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[13rem] rounded border border-zinc-700 bg-zinc-950 py-1 shadow-xl shadow-black/50"
        >
          {entries.map((entry, index) => (
            <MenuEntryView key={index} entry={entry} onClose={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  )
}
