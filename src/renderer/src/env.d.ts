/// <reference types="vite/client" />

import type { BarReplayApi } from '@shared/appApi'

declare const __APP_VERSION__: string

declare global {
  interface Window {
    api: BarReplayApi
  }
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.svg?raw' {
  const src: string
  export default src
}

export {}
