import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const collector = spawn(process.execPath, ['-'], {
  detached: true,
  stdio: ['pipe', 'ignore', 'ignore'],
})
collector.stdin.end(`const http = require('node:http')
let coldMetadata = true
http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url === '/health') return res.end('{}')
  if (req.url === '/v1/traces') {
    return setTimeout(() => res.end('{}'), 40)
  }
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
collector.unref()

await retry(async () => {
  const response = await fetch('http://127.0.0.1:4318/health')
  if (!response.ok) throw new Error('collector is not ready')
})

const nextBin = 'node_modules/next/dist/bin/next'
const logDirectory = mkdtempSync(join(tmpdir(), 'agent-063-'))
const logPath = join(logDirectory, 'next-dev.log')
const log = openSync(logPath, 'wx', 0o600)
const next = spawn(process.execPath, [nextBin, 'dev', '--port', '3100'], {
  detached: true,
  stdio: ['ignore', log, log],
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
    REPORT_SERVICE_URL: 'http://127.0.0.1:4318',
  },
})
next.unref()
closeSync(log)

await retry(async () => {
  const output = readFileSync(logPath, 'utf8')
  if (!output.includes('Ready in')) throw new Error('dev server is not ready')
}, 60_000)
rmSync(logDirectory, { recursive: true, force: true })

const started = performance.now()
const response = await fetch('http://127.0.0.1:3100/reports')
await response.text()
const duration = performance.now() - started
if (!response.ok || duration < 3000) {
  throw new Error(
    `slow request was not prepared (${response.status}, ${duration}ms)`
  )
}

await retry(async () => {
  const snapshot = await (
    await fetch('http://127.0.0.1:3100/_next/development/request-insights')
  ).json()
  const request = snapshot.requests.find(
    (entry) =>
      entry.route === '/reports' &&
      entry.spans.some(
        (span) =>
          span.attributes?.['next.span_type'] ===
            'ResolveMetadata.generateMetadata' && span.durationMs >= 3000
      )
  )
  if (!request) throw new Error('retained metadata trace is not ready')
})

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
delete packageJson.scripts['eval:setup']
writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`)
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
