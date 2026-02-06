#!/usr/bin/env node
/**
 * All-in-one SSR benchmark runner for Next.js
 *
 * Usage:
 *   node bench/basic-app/run-bench.js [options]
 *
 * Options:
 *   --profile         Start server with CPU profiling, analyze after run
 *   --marks           Enable NEXT_PERF_MARKS, collect phase timing
 *   --concurrency N   Override concurrency (default: runs both c1 and c100)
 *   --duration N      Seconds per benchmark run (default: 10)
 *   --warmup N        Number of warmup requests (default: 50)
 *   --port N          Port to use (default: 3000)
 *   --url PATH        URL path to benchmark (default: /)
 */

const http = require('http')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

// Parse CLI args
const args = process.argv.slice(2)
function getFlag(name) {
  return args.includes(`--${name}`)
}
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`)
  if (idx === -1 || idx + 1 >= args.length) return defaultVal
  return args[idx + 1]
}

const PROFILE = getFlag('profile')
const MARKS = getFlag('marks')
const DURATION = parseInt(getArg('duration', '10'), 10)
const WARMUP_COUNT = parseInt(getArg('warmup', '50'), 10)
const PORT = parseInt(getArg('port', '3000'), 10)
const URL_PATH = getArg('url', '/')
const CONCURRENCY_ARG = getArg('concurrency', null)
// When --marks is used without explicit concurrency, default to c1 only
// since phase timing is only accurate at c1 (marks are global, not request-scoped)
const CONCURRENCIES = CONCURRENCY_ARG
  ? [parseInt(CONCURRENCY_ARG, 10)]
  : MARKS
    ? [1]
    : [1, 100]

const BENCH_DIR = path.resolve(__dirname)
const MINIMAL_SERVER = path.resolve(
  __dirname,
  '../next-minimal-server/bin/minimal-server.js'
)
const RESULTS_FILE = path.join(BENCH_DIR, 'last-run.json')
const ANALYZE_SCRIPT = path.resolve(
  __dirname,
  '../../scripts/analyze-profile.js'
)

function log(msg) {
  process.stdout.write(`${msg}\n`)
}

function startServer() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
    }

    if (PROFILE) {
      env.NEXT_CPU_PROF = '1'
    }

    if (MARKS) {
      env.NEXT_PERF_MARKS = '1'
    }

    const serverProcess = spawn('node', [MINIMAL_SERVER], {
      cwd: BENCH_DIR,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let started = false
    let stderrBuf = ''

    serverProcess.stdout.on('data', (data) => {
      const str = data.toString()
      if (!started && str.includes('next-cold-start')) {
        started = true
        resolve(serverProcess)
      }
    })

    serverProcess.stderr.on('data', (data) => {
      stderrBuf += data.toString()
    })

    // Also store stderr for later retrieval
    serverProcess._stderrBuf = () => {
      const buf = stderrBuf
      stderrBuf = ''
      return buf
    }

    serverProcess.on('error', reject)
    serverProcess.on('exit', (code) => {
      if (!started) {
        reject(new Error(`Server exited with code ${code}`))
      }
    })

    // Timeout if server doesn't start in 30s
    setTimeout(() => {
      if (!started) {
        serverProcess.kill()
        reject(new Error('Server start timeout'))
      }
    }, 30000)
  })
}

function makeRequest() {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: URL_PATH,
        method: 'GET',
        headers: { host: 'localhost' },
      },
      (res) => {
        // Consume response body
        res.on('data', () => {})
        res.on('end', () => {
          resolve({
            duration: performance.now() - start,
            statusCode: res.statusCode,
          })
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

async function warmup(count) {
  log(`Warming up with ${count} requests...`)
  for (let i = 0; i < count; i++) {
    await makeRequest()
  }
}

async function runBenchmark(concurrency, durationSec) {
  const deadline = Date.now() + durationSec * 1000
  let completed = 0
  let errors = 0
  const latencies = []

  async function worker() {
    while (Date.now() < deadline) {
      try {
        const result = await makeRequest()
        latencies.push(result.duration)
        completed++
      } catch {
        errors++
      }
    }
  }

  const workers = []
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker())
  }
  await Promise.all(workers)

  latencies.sort((a, b) => a - b)
  const count = latencies.length

  return {
    concurrency,
    duration: durationSec,
    completed,
    errors,
    rps: completed / durationSec,
    latency:
      count > 0
        ? {
            min: latencies[0],
            p50: latencies[Math.floor(count * 0.5)],
            p95: latencies[Math.floor(count * 0.95)],
            p99: latencies[Math.floor(count * 0.99)],
            max: latencies[count - 1],
            avg: latencies.reduce((s, v) => s + v, 0) / count,
          }
        : null,
  }
}

function formatNum(n, decimals = 2) {
  return n.toFixed(decimals)
}

function printResults(results) {
  log('')
  log('='.repeat(80))
  log('  SSR Benchmark Results')
  log('='.repeat(80))
  log('')

  for (const r of results) {
    log(`  Concurrency: ${r.concurrency}`)
    log(`  Duration:    ${r.duration}s`)
    log(`  Requests:    ${r.completed} (${r.errors} errors)`)
    log(`  Throughput:  ${formatNum(r.rps)} req/s`)
    if (r.latency) {
      log(
        `  Latency:     avg=${formatNum(r.latency.avg)}ms  p50=${formatNum(r.latency.p50)}ms  p95=${formatNum(r.latency.p95)}ms  p99=${formatNum(r.latency.p99)}ms  min=${formatNum(r.latency.min)}ms  max=${formatNum(r.latency.max)}ms`
      )
    }
    log('')
  }
}

function printComparison(current, previous) {
  log('-'.repeat(80))
  log('  Comparison with previous run')
  log('-'.repeat(80))
  log('')

  for (const curr of current) {
    const prev = previous.find((p) => p.concurrency === curr.concurrency)
    if (!prev) continue
    const delta = ((curr.rps - prev.rps) / prev.rps) * 100
    const sign = delta >= 0 ? '+' : ''
    const indicator = delta > 2 ? ' FASTER' : delta < -2 ? ' SLOWER' : ''
    log(
      `  c${curr.concurrency}: ${formatNum(prev.rps)} -> ${formatNum(curr.rps)} req/s (${sign}${formatNum(delta)}%)${indicator}`
    )
  }
  log('')
}

async function findCpuProfile() {
  // CPU profiles are written to the cwd of the server process
  const files = fs
    .readdirSync(BENCH_DIR)
    .filter((f) => f.endsWith('.cpuprofile'))
  if (files.length === 0) return null
  // Return the most recently modified one
  files.sort((a, b) => {
    const aStat = fs.statSync(path.join(BENCH_DIR, a))
    const bStat = fs.statSync(path.join(BENCH_DIR, b))
    return bStat.mtimeMs - aStat.mtimeMs
  })
  return path.join(BENCH_DIR, files[0])
}

async function analyzeProfile(profilePath) {
  return new Promise((resolve) => {
    const proc = spawn('node', [ANALYZE_SCRIPT, profilePath], {
      stdio: 'inherit',
    })
    proc.on('exit', resolve)
  })
}

async function main() {
  log('Starting benchmark server...')

  let server
  try {
    server = await startServer()
  } catch (err) {
    log(`Failed to start server: ${err.message}`)
    process.exit(1)
  }

  log(`Server started on port ${PORT}`)

  try {
    await warmup(WARMUP_COUNT)

    const results = []
    for (const c of CONCURRENCIES) {
      log(`\nBenchmarking with concurrency=${c} for ${DURATION}s...`)
      const result = await runBenchmark(c, DURATION)
      results.push(result)
    }

    printResults(results)

    // Load previous results for comparison
    if (fs.existsSync(RESULTS_FILE)) {
      try {
        const previous = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'))
        printComparison(results, previous)
      } catch {
        // Ignore corrupt previous results
      }
    }

    // Save current results
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2))
    log(`Results saved to ${RESULTS_FILE}`)

    // Collect perf marks if enabled
    if (MARKS) {
      log('\nCollecting perf marks...')
      // Give a moment for any pending marks
      await new Promise((r) => setTimeout(r, 100))
      server.kill('SIGUSR1')
      // Wait for stats to be printed
      await new Promise((r) => setTimeout(r, 500))
      const stderr = server._stderrBuf()
      if (stderr) {
        log(stderr)
      }
    }

    // Handle CPU profiling
    if (PROFILE) {
      log('\nSaving CPU profile...')
      // Send SIGUSR2 to trigger saveCpuProfile() in the server
      server.kill('SIGUSR2')
      // Wait for the process to exit (it exits after writing the profile)
      await new Promise((resolve) => {
        server.on('exit', resolve)
        setTimeout(resolve, 10000)
      })

      const profilePath = await findCpuProfile()
      if (profilePath) {
        log(`CPU profile saved: ${profilePath}`)
        log('\nAnalyzing profile...\n')
        await analyzeProfile(profilePath)
      } else {
        log('Warning: No .cpuprofile file found')
      }
      return
    }
  } finally {
    // Kill server
    if (server && !server.killed) {
      server.kill('SIGTERM')
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
