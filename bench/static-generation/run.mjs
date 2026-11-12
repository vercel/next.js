#!/usr/bin/env node
// Benchmarks static generation in `next build` on the fixtures in
// ./fixtures. See ./README.md.
//
// Usage:
//   node bench/static-generation/run.mjs \
//     [--fixtures=fetch-skewed,cpu-bound,memory-heavy] [--runs=1] \
//     [--label=baseline] [--out=results.json] [--env=KEY=VALUE ...]
//
// Every build runs with NEXT_STATIC_GENERATION_PROFILE=1 and the runner reads
// `.next/diagnostics/static-generation-summary.json` afterwards.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../..')
const nextBin = path.join(repoRoot, 'packages/next/dist/bin/next')

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const prefix = `--${name}=`
  const found = args.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}
const extraEnv = Object.fromEntries(
  args
    .filter((arg) => arg.startsWith('--env='))
    .map((arg) => {
      const [key, ...rest] = arg.slice('--env='.length).split('=')
      return [key, rest.join('=')]
    })
)

const fixtures = getArg('fixtures', 'fetch-skewed,cpu-bound,memory-heavy')
  .split(',')
  .filter(Boolean)
const runs = Number(getArg('runs', '1'))
const label = getArg('label', 'run')
const out = getArg('out', undefined)

// A local upstream that answers after `ms` milliseconds.
function startDelayServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost')
      const ms = Number(url.searchParams.get('ms') || 0)
      setTimeout(() => {
        res.setHeader('content-type', 'application/json')
        res.end(
          JSON.stringify({
            ms,
            id: url.searchParams.get('id'),
            bucket: url.searchParams.get('bucket'),
          })
        )
      }, ms)
    })
    server.keepAliveTimeout = 60_000
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function runBuild(fixtureDir, env) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint()
    const child = spawn(process.execPath, [nextBin, 'build', fixtureDir], {
      cwd: fixtureDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (d) => (output += d))
    child.stderr.on('data', (d) => (output += d))
    child.on('exit', (code, signal) => {
      const wallMs = Number(process.hrtime.bigint() - start) / 1e6
      resolve({ code, signal, output, wallMs })
    })
  })
}

const OOM_PATTERN =
  /heap out of memory|Reached heap limit|ERR_WORKER_OUT_OF_MEMORY|signal: SIGKILL|signal: SIGABRT/

const MB = 1024 * 1024
const results = []
const server = await startDelayServer()
const origin = `http://127.0.0.1:${server.address().port}`

try {
  for (const fixture of fixtures) {
    const fixtureDir = path.join(__dirname, 'fixtures', fixture)
    for (let run = 1; run <= runs; run++) {
      fs.rmSync(path.join(fixtureDir, '.next'), {
        recursive: true,
        force: true,
      })
      const env = {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_STATIC_GENERATION_PROFILE: '1',
        BENCH_DELAY_ORIGIN: origin,
        ...extraEnv,
      }
      process.stderr.write(`[${label}] ${fixture} run ${run}/${runs}... `)
      const { code, signal, output, wallMs } = await runBuild(fixtureDir, env)
      const summaryPath = path.join(
        fixtureDir,
        '.next/diagnostics/static-generation-summary.json'
      )
      const summary = fs.existsSync(summaryPath)
        ? JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
        : null
      const oomCount = (output.match(new RegExp(OOM_PATTERN, 'g')) || []).length
      const ok = code === 0
      const result = {
        label,
        fixture,
        run,
        ok,
        exitCode: code,
        signal,
        oomCount,
        buildWallMs: Math.round(wallMs),
        staticGenMs: summary?.windowMs ?? null,
        tailSpreadMs: summary?.tailSpreadMs ?? null,
        meanIdlePct: summary?.meanIdlePct ?? null,
        meanNoWorkPct: summary?.meanNoWorkPct ?? null,
        peakRssMB: summary ? Math.round(summary.peakRss / MB) : null,
        peakPostGcHeapMB: summary
          ? Math.round(summary.peakPostGcHeap / MB)
          : null,
        fetchHitRate: summary?.fetchHitRate ?? null,
        pages: summary?.pages ?? null,
        workers: summary?.workers ?? null,
        perWorker: summary?.perWorker?.map((w) => ({
          workerId: w.workerId,
          pages: w.pages,
          finishOffsetMs: w.finishOffsetMs,
          idlePct: w.idlePct,
          ioWaitPct: w.ioWaitPct,
          noWorkPct: w.noWorkPct,
          peakRssMB: Math.round(w.peakRss / MB),
          maxInFlight: w.maxInFlight,
        })),
      }
      if (!ok) {
        result.outputTail = output.split('\n').slice(-40).join('\n')
      }
      results.push(result)
      process.stderr.write(
        `${ok ? 'ok' : `FAILED (code ${code}, signal ${signal})`} ` +
          `static gen ${result.staticGenMs}ms, tail ${result.tailSpreadMs}ms, ` +
          `idle ${result.meanIdlePct}%, peak RSS ${result.peakRssMB}MB, OOM ${oomCount}\n`
      )
    }
  }
} finally {
  server.close()
}

console.table(
  results.map(({ perWorker, outputTail, ...rest }) => rest),
  [
    'label',
    'fixture',
    'run',
    'ok',
    'oomCount',
    'buildWallMs',
    'staticGenMs',
    'tailSpreadMs',
    'meanIdlePct',
    'peakRssMB',
    'fetchHitRate',
  ]
)
if (out) {
  fs.writeFileSync(out, JSON.stringify(results, null, 2))
}
