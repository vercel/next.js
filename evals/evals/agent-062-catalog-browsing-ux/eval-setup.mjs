import { execFileSync, spawn } from 'node:child_process'
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'

// Both conditions get the same tools. Only the skills variant adds the Skill.
let browserVersion = ''
try {
  browserVersion = execFileSync('agent-browser', ['--version'], {
    encoding: 'utf8',
  }).trim()
} catch {}
if (browserVersion !== 'agent-browser 0.31.1') {
  execFileSync('npm', ['install', '--global', 'agent-browser@0.31.1'], {
    stdio: 'inherit',
  })
}
execFileSync('agent-browser', ['install'], { stdio: 'inherit' })
execFileSync('agent-browser', ['--version'], { stdio: 'inherit' })

const log = openSync('/tmp/agent-062-next-dev.log', 'a')
const dev = spawn('npm', ['run', 'dev'], {
  detached: true,
  stdio: ['ignore', log, log],
})
closeSync(log)
dev.unref()

try {
  const deadline = Date.now() + 120_000
  let ready = false
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://localhost:3100/products', {
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        ready = true
        break
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!ready) throw new Error('Catalog development server did not start')

  const response = await fetch('http://localhost:3100/_next/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (
    !response.ok ||
    !(await response.text()).includes('get_compilation_issues')
  ) {
    throw new Error(
      'This Next.js build does not support the Next Dev Loop MCP tools'
    )
  }
  execFileSync(
    'agent-browser',
    [
      '--session',
      'catalog-preflight',
      '--enable',
      'react-devtools',
      'open',
      'http://localhost:3100/products',
    ],
    { stdio: 'inherit', timeout: 60_000 }
  )
} finally {
  try {
    execFileSync('agent-browser', ['--session', 'catalog-preflight', 'close'], {
      stdio: 'inherit',
      timeout: 30_000,
    })
  } finally {
    // agent-eval moves the workspace after setup. Start the agent's server
    // from that final workspace, rather than leave it watching another copy.
    try {
      process.kill(-dev.pid, 'SIGTERM')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
}

mkdirSync('.git/info', { recursive: true })
appendFileSync('.git/info/exclude', '\n.next*/\n')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
delete pkg.scripts['eval:setup']
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
rmSync(new URL(import.meta.url))
