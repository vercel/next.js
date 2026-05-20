import { createWriteStream } from 'node:fs'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const repoRoot = resolve(import.meta.dirname, '../..')
const appDir = resolve(import.meta.dirname, 'app')
const runLabel = process.env.RUN_LABEL || 'default'
const outDir = resolve(import.meta.dirname, 'artifacts', runLabel)
const profileDir = resolve(appDir, '.next-profiles')
const port = Number(process.env.PORT || 3157)
const iterations = Number(process.env.ITERATIONS || 40)
const nextBin = resolve(repoRoot, 'packages/next/dist/bin/next')
const extraNextArgs = (process.env.EXTRA_NEXT_ARGS || '')
  .split(/\s+/)
  .filter(Boolean)

await rm(outDir, { recursive: true, force: true })
await rm(profileDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
await mkdir(profileDir, { recursive: true })

const serverLog = createWriteStream(resolve(outDir, 'next-dev.log'))
const server = spawn(
  process.execPath,
  [
    nextBin,
    'dev',
    '--experimental-cpu-prof',
    ...extraNextArgs,
    '--port',
    String(port),
  ],
  {
    cwd: appDir,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PRIVATE_LOCAL_DEV: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
)

let logBuffer = ''
server.stdout.on('data', (chunk) => {
  logBuffer += chunk.toString()
  serverLog.write(chunk)
})
server.stderr.on('data', (chunk) => {
  logBuffer += chunk.toString()
  serverLog.write(chunk)
})

async function waitForReady() {
  const started = Date.now()
  while (Date.now() - started < 60_000) {
    if (logBuffer.includes('Ready in')) return
    if (server.exitCode !== null) {
      throw new Error(`next dev exited early with code ${server.exitCode}`)
    }
    await sleep(100)
  }
  throw new Error('Timed out waiting for next dev to become ready')
}

async function timedFetch(pathname) {
  const started = performance.now()
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    headers: {
      'x-profile-run': '1',
    },
  })
  const text = await response.text()
  const duration = performance.now() - started
  if (!response.ok || !text.includes('RSC route')) {
    throw new Error(
      `Unexpected response for ${pathname}: ${response.status} ${text.slice(
        0,
        120
      )}`
    )
  }
  return duration
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((total, value) => total + value, 0)
  const percentile = (p) => sorted[Math.floor((sorted.length - 1) * p)]
  return {
    count: values.length,
    avg: sum / values.length,
    min: sorted[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted[sorted.length - 1],
  }
}

try {
  await waitForReady()

  const cold = {
    sync: await timedFetch('/'),
    async: await timedFetch('/async'),
  }

  const warm = {
    sync: [],
    async: [],
  }

  for (let index = 0; index < iterations; index++) {
    warm.sync.push(await timedFetch('/'))
    warm.async.push(await timedFetch('/async'))
  }

  server.kill('SIGINT')
  await new Promise((resolveExit) => server.once('exit', resolveExit))
  serverLog.end()

  const profileFiles = (await readdir(profileDir)).filter((file) =>
    file.endsWith('.cpuprofile')
  )
  for (const file of profileFiles) {
    await copyFile(resolve(profileDir, file), resolve(outDir, file))
  }

  const result = {
    appDir,
    runLabel,
    cacheComponents: process.env.CACHE_COMPONENTS === '1',
    extraNextArgs,
    port,
    iterations,
    coldMs: cold,
    warmMs: {
      sync: summarize(warm.sync),
      async: summarize(warm.async),
    },
    profileFiles,
  }

  await writeFile(
    resolve(outDir, 'results.json'),
    `${JSON.stringify(result, null, 2)}\n`
  )
  console.log(JSON.stringify(result, null, 2))
} finally {
  if (server.exitCode === null && !server.killed) {
    server.kill('SIGINT')
  }
}
