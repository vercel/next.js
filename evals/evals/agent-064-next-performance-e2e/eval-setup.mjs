import { closeSync, openSync, readFileSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'

const service = spawn(process.execPath, ['-'], {
  detached: true,
  stdio: ['pipe', 'ignore', 'ignore'],
})
service.stdin.end(`const http = require('node:http')
let coldMetadata = true
http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url === '/health') return res.end('{}')
  if (req.url === '/metadata') {
    const delay = coldMetadata ? 3500 : 80
    coldMetadata = false
    return setTimeout(() => res.end(JSON.stringify({ title: 'Quarterly report' })), delay)
  }
  if (req.url === '/reports') {
    return setTimeout(() => res.end(JSON.stringify({
      title: 'Quarterly report',
      summary: 'Revenue and retention remain on plan.',
    })), 120)
  }
  res.end('{}')
}).listen(4318, '127.0.0.1')`)
service.unref()

await retry(async () => {
  const response = await fetch('http://127.0.0.1:4318/health')
  if (!response.ok) throw new Error('service is not ready')
})

const logPath = '/tmp/agent-064-next-dev.log'
const log = openSync(logPath, 'w')
const next = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--port', '3100'],
  {
    detached: true,
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_EVAL_EXPERIMENTAL: '{"requestInsights":true}',
      REPORT_SERVICE_URL: 'http://127.0.0.1:4318',
    },
  }
)
next.unref()
closeSync(log)

await retry(async () => {
  if (!readFileSync(logPath, 'utf8').includes('Ready in')) {
    throw new Error('dev server is not ready')
  }
}, 60_000)

rmSync(new URL(import.meta.url))

async function retry(fn, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (true) {
    try {
      return await fn()
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
