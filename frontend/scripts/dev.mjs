import { execSync, spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const viteBin = join(root, 'node_modules', '.bin', 'vite')

execSync('node scripts/prepare-ocr-assets.mjs', { cwd: root, stdio: 'inherit' })

const vite = spawn(viteBin, [], { cwd: root, stdio: 'inherit' })

function shutdown(signal) {
  if (!vite.killed) {
    vite.kill(signal)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

vite.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
