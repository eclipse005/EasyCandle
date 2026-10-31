import './lib/webApiBridge'
import '@fontsource-variable/inter/wght.css'
import './assets/main.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme, getStoredTheme } from '@/lib/theme'
import { applyStoredLocale } from '@/i18n/localeStore'
import App from './App'

applyTheme(getStoredTheme())
applyStoredLocale()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
