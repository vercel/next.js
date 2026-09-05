import { spawn } from 'node:child_process'
import { openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const log = openSync('/tmp/agent-055-next-dev.log', 'a')
const dev = spawn('npm', ['run', 'dev'], {
  detached: true,
  stdio: ['ignore', log, log],
})

const deadline = Date.now() + 30_000
while (Date.now() < deadline) {
  try {
    const response = await fetch('http://localhost:3100')
    if (response.ok) break
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250))
}

const response = await fetch('http://localhost:3100')
if (!response.ok) {
  throw new Error(`next dev failed to start: ${response.status}`)
}

const reportsResponse = await fetch('http://localhost:3100/reports/acme')
if (!reportsResponse.ok) {
  throw new Error(`reports route failed to compile: ${reportsResponse.status}`)
}

if (dev.pid) {
  process.kill(-dev.pid, 'SIGTERM')
}

writeFileSync(
  'app/reports/[project]/page.tsx',
  readFileSync('app/reports/[project]/page.tsx', 'utf8').replace(
    'export function generateStaticParams()',
    'export function generateStaticParams(_route: string)'
  )
)

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
delete packageJson.scripts['eval:setup']
writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`)
rmSync(new URL(import.meta.url))
