import './lib/webApiBridge'
import '@fontsource-variable/inter/wght.css'
import './assets/main.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme, getStoredTheme } from '@/lib/theme'
import { applyStoredLocale } from '@/i18n/localeStore'
import { warmImportWorker } from '@/lib/importWorkerClient'
import App from './App'

applyTheme(getStoredTheme())
applyStoredLocale()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Dataset reads run in this worker; have it ready before the first resume.
const warmWorker = () => warmImportWorker()
if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(warmWorker, { timeout: 1500 })
} else {
  window.setTimeout(warmWorker, 300)
}
