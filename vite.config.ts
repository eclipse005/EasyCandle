import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { appDefine, rendererAlias } from './config/vite.shared'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const sourcemap = command === 'serve'

  return {
    define: appDefine(__dirname),
    plugins: [react()],
    resolve: {
      alias: rendererAlias(__dirname)
    },
    css: {
      devSourcemap: sourcemap
    },
    build: {
      sourcemap
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Windows: atomic writes can be missed by the file watcher — poll instead.
      watch: {
        usePolling: true,
        interval: 300
      }
    }
  }
})
