#!/usr/bin/env node
// @ts-check
/**
 * Run a single test (or a `-t`-grep subset of it) in a loop to reproduce
 * intermittent failures locally and gather diagnostics.
 *
 * Each iteration writes its full stdout/stderr to
 *   scripts/repro-flake/<timestamp>/<NN>-{pass,fail}.log
 *
 * The watchdog in `test/lib/router-act.ts` is automatically enabled with a
 * lower threshold so any `act` hangs are surfaced in those logs.
 *
 * Examples:
 *
 *   # Run the prefetching test 25 times in dev mode
 *   node scripts/repro-flake.mjs \
 *     --test test/e2e/app-dir/app-prefetch/prefetching.test.ts \
 *     --grep "should immediately render the loading state" \
 *     --runs 25 --mode dev
 *
 *   # Run with very aggressive watchdog so we see diagnostics every 2s
 *   node scripts/repro-flake.mjs --test ... --runs 50 --watchdog 2000
 */

import { spawn } from 'node:child_process'
import { mkdirSync, createWriteStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

/**
 * @param {string[]} argv
 * @returns {Record<string, string | boolean>}
 */
function parseArgs(argv) {
  /** @type Record<string, string | boolean> */
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        out[key] = true
      } else {
        out[key] = next
        i++
      }
    }
  }
  return out
}

function usage() {
  console.error(
    [
      'Usage: node scripts/repro-flake.mjs --test <path> [options]',
      '',
      'Options:',
      '  --test <path>          Required. Test file path (relative to repo root).',
      '  --grep <pattern>       Pass through to Jest as -t <pattern>.',
      '  --runs <N>             Number of iterations. Default 25.',
      '  --mode <dev|start>     Test mode. Default dev.',
      '  --bundler <turbo|webpack>',
      '                         Default turbo.',
      '  --watchdog <ms>        Override ROUTER_ACT_WATCHDOG_MS. Default 5000.',
      '  --concurrency <N>      Run N iterations in parallel. Default 1.',
      '  --stop-on-fail         Stop after the first failure.',
      '  --output <dir>         Output directory (default scripts/repro-flake).',
      '',
      'Each iteration writes its full stdout/stderr to a log file. Failures',
      'are kept for analysis; passing iterations are kept too but suffixed',
      'with "-pass.log" so you can compare timing/output.',
    ].join('\n')
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.test || args.test === true) {
    usage()
    process.exit(1)
  }
  const testPath = String(args.test)
  const grep = typeof args.grep === 'string' ? args.grep : null
  const runs = Number(args.runs ?? 25)
  const mode = String(args.mode ?? 'dev')
  const bundler = String(args.bundler ?? 'turbo')
  const watchdogMs = String(args.watchdog ?? 5000)
  const concurrency = Math.max(1, Number(args.concurrency ?? 1))
  const stopOnFail = Boolean(args['stop-on-fail'])

  if (!['dev', 'start'].includes(mode)) {
    console.error(`Invalid --mode: ${mode}. Must be dev or start.`)
    process.exit(1)
  }
  if (!['turbo', 'webpack'].includes(bundler)) {
    console.error(`Invalid --bundler: ${bundler}. Must be turbo or webpack.`)
    process.exit(1)
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const outputBase =
    typeof args.output === 'string' ? args.output : 'scripts/repro-flake'
  const outDir = path.resolve(repoRoot, outputBase, ts)
  mkdirSync(outDir, { recursive: true })

  const cmd = `test-${mode}-${bundler}`

  console.log(
    `Running ${runs} iterations of \`pnpm ${cmd} ${testPath}\` (concurrency ${concurrency})`
  )
  if (grep) console.log(`  grep: ${JSON.stringify(grep)}`)
  console.log(`  ROUTER_ACT_WATCHDOG_MS=${watchdogMs}`)
  console.log(`  Logs:  ${outDir}`)

  const results =
    /** @type {{run: number, code: number, ms: number, log: string}[]} */ ([])
  let failures = 0
  let nextRun = 1
  let stopped = false

  /**
   * @param {number} runIndex
   */
  async function runOne(runIndex) {
    const startedAt = Date.now()
    const pad = String(runIndex).padStart(String(runs).length, '0')
    const tmpLog = path.join(outDir, `${pad}-running.log`)
    const fileStream = createWriteStream(tmpLog)

    // Use the user-facing `pnpm test-<mode>-<bundler>` script so we inherit
    // the exact env setup CI uses (mode, bundler, headless, PATH for jest).
    const pnpmScript = `test-${mode}-${bundler}`
    const child = spawn(
      'pnpm',
      [pnpmScript, testPath].concat(grep ? ['-t', grep] : []),
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NEXT_SKIP_ISOLATE: '1',
          NEXT_TELEMETRY_DISABLED: '1',
          ROUTER_ACT_WATCHDOG_MS: watchdogMs,
          ROUTER_ACT_WATCHDOG_INTERVAL_MS: '2000',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )

    child.stdout.pipe(fileStream, { end: false })
    child.stderr.pipe(fileStream, { end: false })

    const code = await new Promise((resolve) => {
      child.on('close', (c) => resolve(c ?? 1))
    })
    await new Promise((resolve) => fileStream.end(resolve))

    const ms = Date.now() - startedAt
    const passed = code === 0
    const finalLog = path.join(outDir, `${pad}-${passed ? 'pass' : 'fail'}.log`)
    await renameFile(tmpLog, finalLog)
    results.push({ run: runIndex, code, ms, log: finalLog })
    if (!passed) {
      failures++
      console.log(`  ✗ run ${runIndex}/${runs} FAILED (${ms}ms) → ${finalLog}`)
      if (stopOnFail) stopped = true
    } else {
      console.log(`  ✓ run ${runIndex}/${runs} passed  (${ms}ms)`)
    }
  }

  async function worker() {
    while (!stopped) {
      const myRun = nextRun++
      if (myRun > runs) return
      try {
        await runOne(myRun)
      } catch (err) {
        console.error(`run ${myRun} crashed:`, err)
        failures++
        if (stopOnFail) stopped = true
      }
    }
  }

  const workers = []
  for (let i = 0; i < concurrency; i++) workers.push(worker())
  await Promise.all(workers)

  const summary = {
    runs: results.length,
    failures,
    passRate: results.length
      ? (1 - failures / results.length).toFixed(3)
      : 'n/a',
    avgMs: results.length
      ? Math.round(results.reduce((a, r) => a + r.ms, 0) / results.length)
      : 0,
    failedLogs: results.filter((r) => r.code !== 0).map((r) => r.log),
  }
  await writeFile(
    path.join(outDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  )

  console.log('')
  console.log(`Done. ${failures}/${results.length} runs failed.`)
  console.log(`Pass rate: ${summary.passRate}`)
  console.log(`Avg duration: ${summary.avgMs}ms`)
  console.log(`Summary: ${path.join(outDir, 'summary.json')}`)
  if (failures > 0) {
    console.log('')
    console.log('Failed runs (look for "[router-act" diagnostics in these):')
    for (const log of summary.failedLogs) console.log(`  ${log}`)
    process.exitCode = 1
  }
}

/**
 * @param {string} from
 * @param {string} to
 */
async function renameFile(from, to) {
  const { rename } = await import('node:fs/promises')
  await rename(from, to)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
