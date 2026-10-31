import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Database, ExternalLink, Moon, Sun } from 'lucide-react'
import SoftCard from '@/components/ui/SoftCard'
import SoftConfirmDialog from '@/components/ui/SoftConfirmDialog'
import SoftButton from '@/components/ui/SoftButton'
import { softSpace, softType } from '@/components/ui/softTokens'
import { cn } from '@/components/ui/cn'
import { useThemeStore } from '@/store/themeStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { useT } from '@/i18n/useT'
import { LOCALE_OPTIONS, type Locale } from '@/i18n/messages'
import { APP_NAME } from '@shared/appName'
import AccountTimezoneSelect from '@/components/dashboard/AccountTimezoneSelect'
import {
  clearAllLocalAppData,
  clearBacktestRecordsOnly,
  clearMarketDataOnly,
  estimateLocalUsage,
  formatStorageBytes
} from '@/lib/localData'

const GITHUB_URL = 'https://github.com/eclipse005/BarReplay'

type ClearKind = 'market' | 'backtest' | 'all' | null

/** Settings — Language / Appearance / About / Account TZ / Storage Soft SaaS layout. */
export default function SettingsPanel(): ReactNode {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const setAboutOpen = useUiLayoutStore((s) => s.setAboutDialogOpen)
  const { locale, t, setLocale } = useT()
  const [version, setVersion] = useState('')

  const [usageLabel, setUsageLabel] = useState<string>('—')
  const [usageBusy, setUsageBusy] = useState(false)
  const [clearKind, setClearKind] = useState<ClearKind>(null)
  const [clearBusy, setClearBusy] = useState(false)

  const refreshUsage = useCallback(async () => {
    setUsageBusy(true)
    try {
      const usage = await estimateLocalUsage()
      const fmt = formatStorageBytes(usage.totalBytes)
      setUsageLabel(
        t('settings.storageUsageValue', { value: fmt.value, unit: fmt.unit })
      )
    } catch {
      setUsageLabel(t('settings.storageUsageUnknown'))
    } finally {
      setUsageBusy(false)
    }
  }, [t])

  useEffect(() => {
    void window.api.getAppVersion().then(setVersion)
  }, [])

  useEffect(() => {
    void refreshUsage()
  }, [refreshUsage])

  async function runClear(): Promise<void> {
    if (!clearKind) return
    setClearBusy(true)
    try {
      if (clearKind === 'market') await clearMarketDataOnly()
      else if (clearKind === 'backtest') await clearBacktestRecordsOnly()
      else await clearAllLocalAppData()
      setClearKind(null)
      await refreshUsage()
    } finally {
      setClearBusy(false)
    }
  }

  const confirmTitle =
    clearKind === 'market'
      ? t('settings.storageClearMarketTitle')
      : clearKind === 'backtest'
        ? t('settings.storageClearBacktestTitle')
        : clearKind === 'all'
          ? t('settings.storageClearAllTitle')
          : ''

  const confirmBody =
    clearKind === 'market'
      ? t('settings.storageClearMarketBody')
      : clearKind === 'backtest'
        ? t('settings.storageClearBacktestBody')
        : clearKind === 'all'
          ? t('settings.storageClearAllBody')
          : undefined

  return (
    <div className={`mx-auto w-full max-w-4xl ${softSpace.stackGap}`}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        {/* Top-left: Language */}
        <SoftCard className={cn(softSpace.cardPadSm, 'md:col-start-1 md:row-start-1')}>
          <h2 className={softType.section}>{t('settings.language')}</h2>
          <p className={`mt-2 ${softType.bodyMuted}`}>{t('settings.languageHint')}</p>
          <div
            className="mt-5 inline-flex rounded-xl border border-white/10 bg-zinc-950/40 p-1"
            role="group"
            aria-label={t('settings.language')}
          >
            {LOCALE_OPTIONS.map((opt) => {
              const active = locale === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setLocale(opt.id as Locale)}
                  className={cn(
                    'min-w-[4.5rem] rounded-lg px-3.5 py-2 text-caption font-medium transition-colors',
                    active
                      ? 'bg-primary-500/90 text-white shadow-sm shadow-primary-950/30'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                  )}
                >
                  {opt.nativeLabel}
                </button>
              )
            })}
          </div>
        </SoftCard>

        {/* Top-right: Appearance */}
        <SoftCard className={cn(softSpace.cardPadSm, 'md:col-start-2 md:row-start-1')}>
          <h2 className={softType.section}>{t('settings.appearance')}</h2>
          <p className={`mt-2 ${softType.bodyMuted}`}>{t('settings.appearanceHint')}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <SoftButton
              variant={theme === 'dark' ? 'primary' : 'secondary'}
              onClick={() => setTheme('dark')}
              aria-pressed={theme === 'dark'}
            >
              <Moon className="h-3.5 w-3.5" aria-hidden />
              {t('settings.dark')}
            </SoftButton>
            <SoftButton
              variant={theme === 'light' ? 'primary' : 'secondary'}
              onClick={() => setTheme('light')}
              aria-pressed={theme === 'light'}
            >
              <Sun className="h-3.5 w-3.5" aria-hidden />
              {t('settings.light')}
            </SoftButton>
          </div>
        </SoftCard>

        {/* Under Language: About */}
        <SoftCard className={cn(softSpace.cardPadSm, 'md:col-start-1 md:row-start-2')}>
          <h2 className={softType.section}>{t('settings.about')}</h2>
          <p className={`mt-1 leading-relaxed ${softType.bodyMuted}`}>
            {t('settings.aboutBody', { app: APP_NAME })}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SoftButton variant="secondary" onClick={() => setAboutOpen(true)}>
              {t('settings.aboutButton', { app: APP_NAME })}
            </SoftButton>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-transparent px-4 text-body font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {t('settings.github')}
            </a>
          </div>
          {version ? (
            <p className={`mt-4 ${softType.micro}`}>
              {t('settings.version', { version })}
            </p>
          ) : null}
        </SoftCard>

        {/* Under Appearance: Account timezone */}
        <SoftCard className={cn(softSpace.cardPadSm, 'md:col-start-2 md:row-start-2')}>
          <h2 className={softType.section}>{t('settings.accountTimezone')}</h2>
          <p className={`mt-2 ${softType.bodyMuted}`}>{t('settings.accountTimezoneHint')}</p>
          <div className="mt-5">
            <span className="sr-only">{t('settings.accountTimezone')}</span>
            <AccountTimezoneSelect />
          </div>
        </SoftCard>

        {/* Full-width row: Storage / 本地数据 */}
        <SoftCard className={cn(softSpace.cardPadSm, 'md:col-span-2 md:col-start-1 md:row-start-3')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className={softType.section}>{t('settings.storage')}</h2>
              <p className={`mt-2 ${softType.bodyMuted}`}>{t('settings.storageHint')}</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2">
              <Database className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
              <span className="text-caption font-medium tabular-nums text-zinc-200">
                {usageBusy ? '…' : usageLabel}
              </span>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <SoftButton
              size="sm"
              variant="secondary"
              disabled={clearBusy}
              onClick={() => {
                setClearKind('market')
              }}
            >
              {t('settings.storageClearMarket')}
            </SoftButton>
            <SoftButton
              size="sm"
              variant="secondary"
              disabled={clearBusy}
              onClick={() => {
                setClearKind('backtest')
              }}
            >
              {t('settings.storageClearBacktest')}
            </SoftButton>
            <SoftButton
              size="sm"
              variant="danger"
              disabled={clearBusy}
              onClick={() => {
                setClearKind('all')
              }}
            >
              {t('settings.storageClearAll')}
            </SoftButton>
          </div>
        </SoftCard>
      </div>

      <SoftConfirmDialog
        open={clearKind != null}
        title={confirmTitle}
        description={confirmBody}
        confirmLabel={t('settings.storageConfirmClear')}
        cancelLabel={t('common.cancel')}
        busy={clearBusy}
        onCancel={() => {
          if (!clearBusy) setClearKind(null)
        }}
        onConfirm={() => {
          void runClear()
        }}
      />
    </div>
  )
}
