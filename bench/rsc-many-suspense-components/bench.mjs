import { execSync, spawn } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import prettyMs from 'pretty-ms'
import treeKill from 'tree-kill'
import { Bench } from 'tinybench'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '..', '..')
const CWD = __dirname
const NEXT_BIN = join(ROOT_DIR, 'packages', 'next', 'dist', 'bin', 'next')

const PORT = 3199
const URL = `http://localhost:${PORT}/`
const WARMUP_DURATION_MS = 10_000
const BENCH_REQUESTS = 200

function killApp(instance) {
  return new Promise((resolve, reject) => {
    treeKill(instance.pid, (err) => {
      if (err) {
        if (
          process.platform === 'win32' &&
          typeof err.message === 'string' &&
          (err.message.includes('no running instance of the task') ||
            err.message.includes('not found'))
        ) {
          return resolve()
        }
        return reject(err)
      }
      resolve()
    })
  })
}

function startServer() {
  return new Promise((resolve, reject) => {
    const instance = spawn(
      'node',
      [NEXT_BIN, 'start', '--port', String(PORT)],
      {
        cwd: CWD,
        env: {
          ...process.env,
          NODE_ENV: 'production',
        },
      }
    )

    let didResolve = false

    function handleStdout(data) {
      const message = data.toString()
      process.stdout.write(message)
      if (/Ready/i.test(message) || /started server/i.test(message)) {
        if (!didResolve) {
          didResolve = true
          resolve(instance)
        }
      }
    }

    function handleStderr(data) {
      process.stderr.write(data.toString())
    }

    instance.stdout.on('data', handleStdout)
    instance.stderr.on('data', handleStderr)

    instance.on('close', () => {
      if (!didResolve) {
        didResolve = true
        reject(new Error('Server closed before it was ready'))
      }
    })

    instance.on('error', reject)
  })
}

async function measureRequest(url) {
  const start = performance.now()
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`)
  }
  // Consume the body to ensure the full response is received
  await res.text()
  const duration = performance.now() - start
  return duration
}

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function statistics(durations) {
  const sorted = [...durations].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  }
}

async function main() {
  // Build the application
  console.log('Building application...')
  execSync(`node ${NEXT_BIN} build`, {
    cwd: CWD,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  })

  console.log('\nStarting server...')
  const instance = await startServer()

  try {
    // Benchmark requests using tinybench built-in warmup.
    console.log(`\nPreparing tinybench benchmark...`)
    const bench = new Bench({
      name: 'rsc-many-suspense-components',
      time: 0,
      iterations: BENCH_REQUESTS,
      warmup: true,
      warmupTime: WARMUP_DURATION_MS,
      retainSamples: true,
      throws: true,
    })

    bench.add(
      'request',
      async () => {
        await measureRequest(URL)
      },
      {
        async: true,
      }
    )

    console.log(
      `\nRunning ${BENCH_REQUESTS} benchmark requests with tinybench (${prettyMs(WARMUP_DURATION_MS)} built-in warmup)...\n`
    )
    await bench.run()

    const latency = bench.tasks[0]?.result?.latency
    const durations = Array.isArray(latency?.samples)
      ? [...latency.samples]
      : []
    const stats =
      latency &&
      typeof latency.min === 'number' &&
      typeof latency.max === 'number' &&
      typeof latency.mean === 'number' &&
      typeof latency.p50 === 'number' &&
      typeof latency.p75 === 'number' &&
      typeof latency.p95 === 'number' &&
      typeof latency.p99 === 'number'
        ? {
            min: latency.min,
            max: latency.max,
            avg: latency.mean,
            p50: latency.p50,
            p75: latency.p75,
            p95: latency.p95,
            p99: latency.p99,
          }
        : statistics(durations)

    console.log('Results:')
    console.log('─'.repeat(40))
    console.log(`  Requests:  ${BENCH_REQUESTS}`)
    console.log(`  Min:       ${prettyMs(stats.min)}`)
    console.log(`  Max:       ${prettyMs(stats.max)}`)
    console.log(`  Avg:       ${prettyMs(stats.avg)}`)
    console.log(`  P50:       ${prettyMs(stats.p50)}`)
    console.log(`  P75:       ${prettyMs(stats.p75)}`)
    console.log(`  P95:       ${prettyMs(stats.p95)}`)
    console.log(`  P99:       ${prettyMs(stats.p99)}`)
    console.log('─'.repeat(40))

    // Output raw durations as JSON for further analysis
    const output = {
      timestamp: new Date().toISOString(),
      config: {
        warmupDurationMs: WARMUP_DURATION_MS,
        benchRequests: BENCH_REQUESTS,
        url: URL,
      },
      statistics: {
        min: stats.min,
        max: stats.max,
        avg: stats.avg,
        p50: stats.p50,
        p75: stats.p75,
        p95: stats.p95,
        p99: stats.p99,
      },
      durations,
    }

    await fs.writeFile(
      join(CWD, 'bench-result.json'),
      JSON.stringify(output, null, 2)
    )
    console.log('\nDetailed results written to bench-result.json')
  } finally {
    await killApp(instance)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
