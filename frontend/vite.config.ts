import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function gitValue(command: string, fallback: string): string {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback
  } catch {
    return fallback
  }
}

/** GitHub project site: https://<user>.github.io/NimiqLens/ */
const githubPagesBase = process.env.GITHUB_PAGES === 'true' ? '/NimiqLens/' : undefined
const commitHash = process.env.VITE_APP_COMMIT_HASH || gitValue('git rev-parse HEAD', 'dev')
const buildTime = process.env.VITE_APP_BUILD_TIME || new Date().toISOString()

function emitVersionJson(commitHash: string, buildTime: string) {
  return {
    name: 'emit-version-json',
    closeBundle() {
      writeFileSync(
        resolve(__dirname, 'dist/version.json'),
        JSON.stringify({ commitHash, buildTime }),
      )
    },
  }
}

export default defineConfig({
  base: githubPagesBase,
  plugins: [vue(), tailwindcss(), emitVersionJson(commitHash, buildTime)],
  define: {
    __APP_COMMIT_HASH__: JSON.stringify(commitHash),
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
