import { memo } from 'react'
import { ArrowLeft, Maximize2, Moon, Settings2, SquareSplitVertical, Sun } from 'lucide-react'
import AppMenu from '@/components/AppMenu'
import ChartSnapshotDropdown from '@/components/ChartSnapshotDropdown'
import ChartTypeSelect from '@/components/ChartTypeSelect'
import IconButton from '@/components/IconButton'
import IndicatorsDropdown from '@/components/IndicatorsDropdown'
import SessionDropdown from '@/components/SessionDropdown'
import StatusBar from '@/components/StatusBar'
import SymbolSelect from '@/components/SymbolSelect'
import TimeframeSelect from '@/components/TimeframeSelect'
import { useReplayStore } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'
import { useThemeStore } from '@/store/themeStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

export default memo(function MainToolbar() {
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const setChartSplit = useReplayStore((s) => s.setChartSplit)
  const chartFullscreen = useUiLayoutStore((s) => s.chartFullscreen)
  const toggleChartFullscreen = useUiLayoutStore((s) => s.toggleChartFullscreen)
  const showStatusBar = useUiLayoutStore((s) => s.showStatusBar)
  const setChartSettingsDialogOpen = useUiLayoutStore((s) => s.setChartSettingsDialogOpen)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const closeActiveSession = useSessionStore((s) => s.closeActiveSession)

  return (
    <>
      {!chartFullscreen && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800/90 bg-zinc-950/90 px-2 py-2 sm:px-2">
          <IconButton
            tooltip="Save & close session"
            onClick={() => void closeActiveSession()}
          >
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
          <AppMenu />
          <SymbolSelect />
          <TimeframeSelect />
          <ChartTypeSelect />
          <IndicatorsDropdown />
          <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
            <IconButton
              tooltip={chartSplit ? 'Single chart' : 'Split chart (side by side)'}
              dataTour="split"
              active={chartSplit}
              onClick={() => setChartSplit(!chartSplit)}
            >
              <SquareSplitVertical className="h-4 w-4" />
            </IconButton>
            <IconButton
              tooltip="Chart settings"
              dataTour="chart-settings"
              onClick={() => setChartSettingsDialogOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
            </IconButton>
            <ChartSnapshotDropdown />
            <SessionDropdown />
            <IconButton
              tooltip="Full-screen chart"
              dataTour="fullscreen"
              shortcut={['F']}
              active={false}
              onClick={toggleChartFullscreen}
            >
              <Maximize2 className="h-4 w-4" />
            </IconButton>
            <IconButton
              tooltip={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              dataTour="theme"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </IconButton>
          </div>
          {showStatusBar && <StatusBar />}
        </div>
      )}
    </>
  )
})
