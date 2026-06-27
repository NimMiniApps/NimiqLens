import { execSync } from 'node:child_process'

const port = process.env.VITE_PORT ?? '5173'

try {
  const pids = execSync(`lsof -ti :${port} -sTCP:LISTEN`, { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
  for (const pid of pids) {
    process.kill(Number(pid), 'SIGTERM')
  }
  console.log(`Stopped dev server on port ${port} (PIDs: ${pids.join(', ')})`)
} catch {
  console.log(`No process listening on port ${port}`)
}
