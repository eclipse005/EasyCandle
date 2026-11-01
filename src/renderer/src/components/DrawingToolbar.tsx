import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  Circle,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Magnet,
  MousePointer2,
  Move3d,
  Redo2,
  Settings2,
  Smile,
  Star,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
  Waves,
  Waypoints,
  type LucideIcon
} from 'lucide-react'
import FloatingPanel from '@/components/FloatingPanel'
import IconButton from '@/components/IconButton'
import { cacheImage, decodeImage, type DrawingKind } from 'lightweight-charts-drawing'
import * as bridge from '@/lib/drawings/drawingBridge'
import { clearAllDrawings } from '@/lib/drawings/drawingActions'
import {
  EMOJIS,
  findGroup,
  groupTools,
  headerTitle,
  TOOL_GROUPS,
  toolHotkey,
  toolTitle,
  type ToolGroup
} from '@/lib/drawings/toolGroups'
import { useDrawingRailStore, lastToolOf } from '@/store/drawingRailStore'
import { useDrawingSettingsStore } from '@/store/drawingSettingsStore'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import { useReplayStore } from '@/store/replayStore'
import { useT } from '@/i18n/useT'

const GROUP_ICON: Record<string, LucideIcon> = {
  trend: TrendingUp,
  fibonacci: Waves,
  patterns: Waypoints,
  forecast: Move3d,
  shapes: Circle,
  annotation: Type
}

type Flyout =
  | { kind: 'group'; id: string; top: number; left: number }
  | { kind: 'emoji'; top: number; left: number }
  | { kind: 'magnet'; top: number; left: number }
  | { kind: 'hide'; top: number; left: number }
  | { kind: 'remove'; top: number; left: number }

function anchorOf(el: HTMLElement): { top: number; left: number } {
  const rect = el.getBoundingClientRect()
  return { top: rect.top, left: rect.right + 8 }
}

/**
 * TradingView left rail: one button per tool family, a corner arrow for the
 * flyout, and a favorites pill for starred tools.
 */
export default memo(function DrawingToolbar() {
  const { t, locale } = useT()
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
  const revision = useDrawingUiStore((s) => s.revision)
  const setDrawingDialogOpen = useDrawingSettingsStore((s) => s.setDrawingDialogOpen)
  const favorites = useDrawingRailStore((s) => s.favorites)
  const lastUsed = useDrawingRailStore((s) => s.lastUsed)
  const toggleFavorite = useDrawingRailStore((s) => s.toggleFavorite)
  const remember = useDrawingRailStore((s) => s.remember)
  const [flyout, setFlyout] = useState<Flyout | null>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lang = locale === 'zh' ? 'zh' : 'en'
  const disabled = mode === 'replay' && replayStatus === 'ended'
  void revision

  function closeFlyout(): void {
    setFlyout(null)
  }

  function arm(kind: DrawingKind | null, groupId?: string): void {
    if (kind && groupId) remember(groupId, kind)
    setArmedTool(armedTool === kind ? null : kind)
    closeFlyout()
  }

  function openAt(next: Flyout, button: HTMLElement): void {
    const pos = anchorOf(button)
    setFlyout({ ...next, ...pos })
  }

  useEffect(() => {
    if (!flyout) return undefined
    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node
      if (flyoutRef.current?.contains(target)) return
      if ((target as HTMLElement).closest?.('[data-draw-anchor]')) return
      closeFlyout()
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') closeFlyout()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [flyout])

  async function onImage(file: File): Promise<void> {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    const image = await decodeImage(url)
    const name = `${Date.now().toString(36)}-${file.name}`
    cacheImage(name, image)
    bridge.getPrimary()?.addImage({ name, width: image.width, height: image.height })
  }

  const hidden = bridge.getPrimary()?.drawings().filter((drawing) => drawing.hidden) ?? []

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      data-tour="drawing-toolbar"
      className="flex h-full w-11 shrink-0 flex-col items-center overflow-hidden border-r border-white/10 bg-zinc-950 py-1"
      onContextMenu={(event) => event.preventDefault()}
    >
      <IconButton
        variant="ghost"
        className="!h-8 !w-8"
        tooltip={t('draw.cursor')}
        tooltipSide="right"
        active={armedTool == null}
        disabled={disabled}
        onClick={() => arm(null)}
      >
        <MousePointer2 className="h-5 w-5" strokeWidth={1.5} />
      </IconButton>
      <div className="my-0.5 h-px w-6 shrink-0 bg-zinc-800" aria-hidden />

      {TOOL_GROUPS.map((group) => {
        const kind = lastToolOf(group, lastUsed) as DrawingKind
        const Icon = GROUP_ICON[group.id] ?? TrendingUp
        const active = groupTools(group).some((tool) => tool.kind === armedTool)
        const label = lang === 'zh' ? group.titleZh : group.title
        return (
          <div key={group.id} className="relative" data-draw-anchor="">
            <button
              type="button"
              disabled={disabled}
              title={label}
              onClick={() => arm(kind, group.id)}
              className={`relative flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.06] disabled:opacity-40 ${
                active || (flyout?.kind === 'group' && flyout.id === group.id)
                  ? 'bg-zinc-800 text-primary-300'
                  : ''
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label={t('draw.moreTools')}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation()
                if (flyout?.kind === 'group' && flyout.id === group.id) closeFlyout()
                else openAt({ kind: 'group', id: group.id, top: 0, left: 0 }, event.currentTarget)
              }}
              className="absolute bottom-0 right-0 z-[1] flex h-3.5 w-3.5 items-center justify-center text-zinc-500 hover:text-zinc-100"
            >
              <Caret />
            </button>
          </div>
        )
      })}

      <div className="relative" data-draw-anchor="">
        <button
          type="button"
          title={t('draw.emojis')}
          disabled={disabled}
          onClick={(event) => {
            if (flyout?.kind === 'emoji') closeFlyout()
            else openAt({ kind: 'emoji', top: 0, left: 0 }, event.currentTarget)
          }}
          className={`relative flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.06] ${
            flyout?.kind === 'emoji' || armedTool === 'font-icon' ? 'bg-zinc-800 text-primary-300' : ''
          }`}
        >
          <Smile className="h-5 w-5" strokeWidth={1.5} />
          <span className="absolute bottom-0.5 right-0.5 text-zinc-500">
            <Caret />
          </span>
        </button>
      </div>

      <div className="my-0.5 h-px w-6 shrink-0 bg-zinc-800" aria-hidden />

      <div className="relative" data-draw-anchor="">
        <button
          type="button"
          title={t('draw.magnet')}
          disabled={disabled}
          onClick={() => {
            closeFlyout()
            setMagnet(magnet === 'off' ? 'weak' : 'off')
          }}
          className={`relative flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/[0.06] ${
            magnet !== 'off' ? 'bg-zinc-800 text-primary-300' : 'text-zinc-300'
          }`}
        >
          <Magnet className="h-5 w-5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label={t('draw.moreTools')}
          disabled={disabled}
          onClick={(event) => {
            if (flyout?.kind === 'magnet') closeFlyout()
            else openAt({ kind: 'magnet', top: 0, left: 0 }, event.currentTarget)
          }}
          className="absolute bottom-0 right-0 z-[1] flex h-3.5 w-3.5 items-center justify-center text-zinc-500 hover:text-zinc-100"
        >
          <Caret />
        </button>
      </div>

      <IconButton
        variant="ghost"
        className="!h-8 !w-8"
        tooltip={t('draw.keepDrawing')}
        tooltipSide="right"
        active={stayInDrawingMode}
        disabled={disabled}
        onClick={toggleStayInDrawingMode}
      >
        <Pen2 className="h-5 w-5" />
      </IconButton>

      <div className="my-0.5 h-px w-6 shrink-0 bg-zinc-800" aria-hidden />

      <IconButton variant="ghost" className="!h-8 !w-8" tooltip={t('draw.undo')} tooltipSide="right" disabled={!canUndo} onClick={undo}>
        <Undo2 className="h-5 w-5" strokeWidth={1.5} />
      </IconButton>
      <IconButton variant="ghost" className="!h-8 !w-8" tooltip={t('draw.redo')} tooltipSide="right" disabled={!canRedo} onClick={redo}>
        <Redo2 className="h-5 w-5" strokeWidth={1.5} />
      </IconButton>
      <IconButton
        variant="ghost"
        className="!h-8 !w-8"
        tooltip={drawingsLocked ? t('draw.unlock') : t('draw.lock')}
        tooltipSide="right"
        active={drawingsLocked}
        disabled={disabled}
        onClick={() => setDrawingsLocked(!drawingsLocked)}
      >
        {drawingsLocked ? <Lock className="h-5 w-5" /> : <LockOpen className="h-5 w-5" />}
      </IconButton>

      <div className="relative" data-draw-anchor="">
        <button
          type="button"
          title={drawingsVisible ? t('draw.hideAll') : t('draw.showAll')}
          disabled={disabled}
          onClick={() => {
            closeFlyout()
            setDrawingsVisible(!drawingsVisible)
          }}
          className={`relative flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/[0.06] ${
            !drawingsVisible ? 'bg-zinc-800 text-primary-300' : 'text-zinc-300'
          }`}
        >
          {drawingsVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
        </button>
        <button
          type="button"
          aria-label={t('draw.moreTools')}
          disabled={disabled}
          onClick={(event) => {
            if (flyout?.kind === 'hide') closeFlyout()
            else openAt({ kind: 'hide', top: 0, left: 0 }, event.currentTarget)
          }}
          className="absolute bottom-0 right-0 z-[1] flex h-3.5 w-3.5 items-center justify-center text-zinc-500 hover:text-zinc-100"
        >
          <Caret />
        </button>
      </div>

      <div className="relative" data-draw-anchor="">
        <button
          type="button"
          title={t('draw.removeDrawings')}
          disabled={disabled}
          onClick={(event) => {
            if (flyout?.kind === 'remove') closeFlyout()
            else openAt({ kind: 'remove', top: 0, left: 0 }, event.currentTarget)
          }}
          className={`relative flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.06] ${
            flyout?.kind === 'remove' ? 'bg-zinc-800 text-primary-300' : ''
          }`}
        >
          <Trash2 className="h-5 w-5" />
          <span className="absolute bottom-0.5 right-0.5 text-zinc-500">
            <Caret />
          </span>
        </button>
      </div>

      <IconButton
        variant="ghost"
        className="!h-8 !w-8"
        tooltip={t('draw.defaults')}
        tooltipSide="right"
        disabled={disabled}
        onClick={() => setDrawingDialogOpen(true, 'toolbar')}
      >
        <Settings2 className="h-5 w-5" strokeWidth={1.5} />
      </IconButton>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void onImage(file)
        }}
      />

      {flyout
        ? createPortal(
            <FlyoutPanel
              flyout={flyout}
              panelRef={flyoutRef}
              lang={lang}
              disabled={disabled}
              armedTool={armedTool}
              magnet={magnet}
              favorites={favorites}
              hidden={hidden.map((drawing) => ({
                id: drawing.id,
                label: toolTitle(drawing.kind, lang)
              }))}
              onArm={(kind, groupId) => arm(kind, groupId)}
              onEmoji={(glyph) => {
                setArmedTool('font-icon', glyph)
                closeFlyout()
              }}
              onImage={() => {
                closeFlyout()
                fileRef.current?.click()
              }}
              onFavorite={toggleFavorite}
              onMagnet={(mode) => {
                setMagnet(mode)
                closeFlyout()
              }}
              onShow={(id) => {
                bridge.getPrimary()?.setHidden(id, false)
                closeFlyout()
              }}
              onRemoveDrawings={() => {
                setArmedTool(null)
                clearAllDrawings()
                closeFlyout()
              }}
              onRemoveIndicators={() => {
                useReplayStore.setState({ activeIndicators: [] })
                closeFlyout()
              }}
            />,
            document.body
          )
        : null}
    </div>
  )
})

function Caret(): ReactNode {
  return (
    <svg viewBox="0 0 6 6" className="h-2 w-2" aria-hidden>
      <path d="M0 0 L6 0 L3 5 Z" fill="currentColor" />
    </svg>
  )
}

function Pen2(props: React.ComponentProps<'svg'>): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}

function FlyoutPanel({
  flyout,
  panelRef,
  lang,
  disabled,
  armedTool,
  magnet,
  favorites,
  hidden,
  onArm,
  onEmoji,
  onImage,
  onFavorite,
  onMagnet,
  onShow,
  onRemoveDrawings,
  onRemoveIndicators
}: {
  flyout: Flyout
  panelRef: RefObject<HTMLDivElement | null>
  lang: 'zh' | 'en'
  disabled: boolean
  armedTool: DrawingKind | null
  magnet: 'off' | 'weak' | 'strong'
  favorites: string[]
  hidden: { id: string; label: string }[]
  onArm: (kind: DrawingKind, groupId: string) => void
  onEmoji: (glyph: string) => void
  onImage: () => void
  onFavorite: (kind: string) => void
  onMagnet: (mode: 'weak' | 'strong') => void
  onShow: (id: string) => void
  onRemoveDrawings: () => void
  onRemoveIndicators: () => void
}): ReactNode {
  const { t } = useT()
  const [box, setBox] = useState({ top: flyout.top, left: flyout.left })

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const top = Math.max(8, Math.min(flyout.top, window.innerHeight - rect.height - 8))
    const left = Math.min(flyout.left, window.innerWidth - rect.width - 8)
    setBox({ top, left })
  }, [flyout, panelRef])

  const group = flyout.kind === 'group' ? TOOL_GROUPS.find((item) => item.id === flyout.id) : undefined

  return (
    <div
      ref={panelRef}
      role="menu"
      style={{ top: box.top, left: box.left }}
      className="fixed z-[80] max-h-[min(32rem,calc(100vh-1rem))] w-[18.5rem] overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/95 py-1.5 shadow-xl shadow-black/50"
    >
      {group ? (
        <GroupMenu
          group={group}
          lang={lang}
          disabled={disabled}
          armedTool={armedTool}
          favorites={favorites}
          onArm={onArm}
          onFavorite={onFavorite}
          onImage={onImage}
        />
      ) : null}
      {flyout.kind === 'emoji' ? (
        <div className="px-2 py-1">
          <p className="px-1 pb-1 text-[11px] font-medium text-zinc-500">{t('draw.emojis')}</p>
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((glyph) => (
              <button
                key={glyph}
                type="button"
                className="flex h-8 items-center justify-center rounded-md text-base hover:bg-zinc-800"
                onClick={() => onEmoji(glyph)}
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {flyout.kind === 'magnet' ? (
        <>
          <MenuRow
            label={t('draw.weakMagnet')}
            active={magnet === 'weak'}
            onClick={() => onMagnet('weak')}
          />
          <MenuRow
            label={t('draw.strongMagnet')}
            active={magnet === 'strong'}
            onClick={() => onMagnet('strong')}
          />
        </>
      ) : null}
      {flyout.kind === 'hide' ? (
        <>
          <p className="px-3 pb-1 pt-1 text-[11px] font-medium text-zinc-500">{t('draw.hiddenList')}</p>
          {hidden.length === 0 ? (
            <p className="px-3 py-1.5 text-xs text-zinc-500">{t('draw.noHidden')}</p>
          ) : (
            hidden.map((drawing) => (
              <MenuRow
                key={drawing.id}
                label={drawing.label}
                hint={t('draw.showOne')}
                onClick={() => onShow(drawing.id)}
              />
            ))
          )}
        </>
      ) : null}
      {flyout.kind === 'remove' ? (
        <>
          <MenuRow label={t('draw.removeDrawings')} onClick={onRemoveDrawings} />
          <MenuRow label={t('draw.removeIndicators')} onClick={onRemoveIndicators} />
        </>
      ) : null}
    </div>
  )
}

function GroupMenu({
  group,
  lang,
  disabled,
  armedTool,
  favorites,
  onArm,
  onFavorite,
  onImage
}: {
  group: ToolGroup
  lang: 'zh' | 'en'
  disabled: boolean
  armedTool: DrawingKind | null
  favorites: string[]
  onArm: (kind: DrawingKind, groupId: string) => void
  onFavorite: (kind: string) => void
  onImage: () => void
}): ReactNode {
  const { t } = useT()
  return (
    <>
      {group.sections.map((section) => (
        <div key={section.header}>
          <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            {headerTitle(section.header, lang)}
          </p>
          {section.tools.map((tool) => {
            const starred = favorites.includes(tool.kind)
            return (
              <div key={tool.kind} className="flex items-center pr-1">
                <button
                  type="button"
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => (tool.kind === 'image' ? onImage() : onArm(tool.kind, group.id))}
                  className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-[13px] disabled:opacity-40 ${
                    armedTool === tool.kind
                      ? 'bg-zinc-800 text-zinc-50'
                      : 'text-zinc-200 hover:bg-zinc-800/80'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {lang === 'zh' ? toolTitle(tool.kind, 'zh') : tool.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-zinc-500">{toolHotkey(tool.kind)}</span>
                </button>
                <button
                  type="button"
                  aria-label={starred ? t('draw.unfavorite') : t('draw.favorite')}
                  title={starred ? t('draw.unfavorite') : t('draw.favorite')}
                  onClick={() => onFavorite(tool.kind)}
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                    starred ? 'text-amber-300' : 'text-zinc-600 hover:text-zinc-300'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${starred ? 'fill-current' : ''}`} />
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}

function MenuRow({
  label,
  hint,
  active,
  onClick
}: {
  label: string
  hint?: string
  active?: boolean
  onClick: () => void
}): ReactNode {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] ${
        active ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-200 hover:bg-zinc-800/80'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? <span className="text-[10px] text-zinc-500">{hint}</span> : null}
    </button>
  )
}

/** Floating strip of starred tools. Hidden until something is favorited. */
export const DrawingFavoritesBar = memo(function DrawingFavoritesBar(): ReactNode {
  const { locale } = useT()
  const favorites = useDrawingRailStore((s) => s.favorites)
  const favoritesPos = useDrawingRailStore((s) => s.favoritesPos)
  const setFavoritesPos = useDrawingRailStore((s) => s.setFavoritesPos)
  const remember = useDrawingRailStore((s) => s.remember)
  const armedTool = useDrawingUiStore((s) => s.armedTool)
  const setArmedTool = useDrawingUiStore((s) => s.setArmedTool)
  const lang = locale === 'zh' ? 'zh' : 'en'
  if (favorites.length === 0) return null

  return (
    <FloatingPanel
      scope="viewport"
      chrome="inline"
      dragFromAnywhere
      persistDefault={false}
      topInset={56}
      pos={favoritesPos}
      onPosChange={setFavoritesPos}
      defaultPlacement="top-left"
      className="!rounded-full !border-white/10 bg-zinc-950/95 shadow-lg shadow-black/40"
    >
      <div className="flex items-center gap-0.5 pr-1">
      {favorites.map((kind) => {
        const group = findGroup(kind)
        const Icon = (group && GROUP_ICON[group.id]) || TrendingUp
        const active = armedTool === kind
        return (
          <button
            key={kind}
            type="button"
            title={toolTitle(kind, lang)}
            onClick={() => {
              if (group) remember(group.id, kind)
              setArmedTool(armedTool === kind ? null : (kind as DrawingKind))
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              active ? 'bg-zinc-800 text-primary-200' : 'text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )
      })}
      </div>
    </FloatingPanel>
  )
})
