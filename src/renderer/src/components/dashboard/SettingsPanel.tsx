import { useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, Moon, Sun } from 'lucide-react'
import SoftCard from '@/components/ui/SoftCard'
import SoftButton from '@/components/ui/SoftButton'
import { softSpace, softType } from '@/components/ui/softTokens'
import { useThemeStore } from '@/store/themeStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { APP_NAME } from '@shared/appName'

const GITHUB_URL = 'https://github.com/eclipse005/BarReplay'

/** Settings moved off the top header — theme, about, GitHub. */
export default function SettingsPanel(): ReactNode {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const setAboutOpen = useUiLayoutStore((s) => s.setAboutDialogOpen)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.getAppVersion().then(setVersion)
  }, [])

  return (
    <div className={`mx-auto w-full max-w-xl ${softSpace.stackGap}`}>
      <SoftCard className={softSpace.cardPad}>
        <h2 className={softType.section}>Appearance</h2>
        <p className="mt-1 text-caption text-zinc-500">
          Soft dark canvas by default. Theme also applies inside chart sessions.
        </p>
        <div className="mt-4 flex gap-2">
          <SoftButton
            variant={theme === 'dark' ? 'primary' : 'secondary'}
            onClick={() => setTheme('dark')}
            aria-pressed={theme === 'dark'}
          >
            <Moon className="h-3.5 w-3.5" aria-hidden />
            Dark
          </SoftButton>
          <SoftButton
            variant={theme === 'light' ? 'primary' : 'secondary'}
            onClick={() => setTheme('light')}
            aria-pressed={theme === 'light'}
          >
            <Sun className="h-3.5 w-3.5" aria-hidden />
            Light
          </SoftButton>
        </div>
      </SoftCard>

      <SoftCard className={softSpace.cardPad}>
        <h2 className={softType.section}>About</h2>
        <p className={`mt-1 leading-relaxed ${softType.caption}`}>
          {APP_NAME} is a pure-frontend candle replay and paper-trading app. All data stays in
          your browser (IndexedDB + localStorage).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <SoftButton variant="secondary" onClick={() => setAboutOpen(true)}>
            About {APP_NAME}
          </SoftButton>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-transparent px-3 text-xs font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            GitHub
          </a>
        </div>
        {version ? (
          <p className={`mt-4 ${softType.micro}`}>Version {version}</p>
        ) : null}
      </SoftCard>
    </div>
  )
}
