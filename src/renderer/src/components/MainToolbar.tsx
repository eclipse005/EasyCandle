import { memo } from 'react'
import {
  ArrowLeft,
  Keyboard,
  Maximize2,
  Minimize2,
  Moon,
  Settings2,
  SquareSplitVertical,
  Sun
} from 'lucide-react'
import AppMenu from '@/components/AppMenu'
import ChartSnapshotDropdown from '@/components/ChartSnapshotDropdown'
import ChartTimezoneSelect from '@/components/ChartTimezoneSelect'
import ChartTypeSelect from '@/components/ChartTypeSelect'
import IconButton from '@/components/IconButton'
import IndicatorsDropdown from '@/components/IndicatorsDropdown'
import SessionDropdown from '@/components/SessionDropdown'
import SymbolSelect from '@/components/SymbolSelect'
import TimeframeSelect from '@/components/TimeframeSelect'
import { useT } from '@/i18n/useT'
import { useReplayStore } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'
import { useThemeStore } from '@/store/themeStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

export default memo(function MainToolbar() {
  const { t } = useT()
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const setChartSplit = useReplayStore((s) => s.setChartSplit)
  const chartFullscreen = useUiLayoutStore((s) => s.chartFullscreen)
  const toggleChartFullscreen = useUiLayoutStore((s) => s.toggleChartFullscreen)
  const setChartSettingsDialogOpen = useUiLayoutStore((s) => s.setChartSettingsDialogOpen)
  const setShortcutsDialogOpen = useUiLayoutStore((s) => s.setShortcutsDialogOpen)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const closeActiveSession = useSessionStore((s) => s.closeActiveSession)

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800/90 bg-zinc-950/90 px-2 py-2 sm:px-2">
          <IconButton
            tooltip={t('toolbar.closeSession')}
            onClick={() => void closeActiveSession()}
          >
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
          <AppMenu />
          <SymbolSelect />
          <TimeframeSelect />
          <ChartTimezoneSelect />
          <ChartTypeSelect />
          <IndicatorsDropdown />
          <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
            <IconButton
              tooltip={t('toolbar.chartSettings')}
              dataTour="chart-settings"
              onClick={() => setChartSettingsDialogOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
            </IconButton>
            <SessionDropdown />
          </div>
          <div className="ml-auto flex items-center gap-1">
              <IconButton
                tooltip={chartSplit ? t('toolbar.singleChart') : t('toolbar.splitChart')}
                dataTour="split"
                active={chartSplit}
                onClick={() => setChartSplit(!chartSplit)}
              >
                <SquareSplitVertical className="h-4 w-4" />
              </IconButton>
              <IconButton
                tooltip={theme === 'dark' ? t('toolbar.themeLight') : t('toolbar.themeDark')}
                dataTour="theme"
                onClick={toggleTheme}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </IconButton>
              <IconButton
                tooltip={t('menu.shortcuts')}
                onClick={() => setShortcutsDialogOpen(true)}
              >
                <Keyboard className="h-4 w-4" />
              </IconButton>
              <ChartSnapshotDropdown />
              <IconButton
                tooltip={
                  chartFullscreen ? t('toolbar.exitFullscreen') : t('toolbar.fullscreen')
                }
                dataTour="fullscreen"
                shortcut={['F']}
                active={chartFullscreen}
                onClick={toggleChartFullscreen}
              >
                {chartFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </IconButton>
          </div>
    </div>
  )
})
