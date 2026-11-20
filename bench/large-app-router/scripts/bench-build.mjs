// Runs N cold `next build` runs of the generated app and reports the wall time
// and the Turbopack compile time (the `run-turbopack` span from `.next/trace`)
// as mean ± stddev.
//
// Usage:
//   node scripts/bench-build.mjs [--runs 3] [--cpus 16] [--json out.json]
//
// See README.md for details.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const APP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const NEXT_BIN = path.join(
  APP_DIR,
  '..',
  '..',
  'packages',
  'next',
  'dist',
  'bin',
  'next'
)

const { values: args } = parseArgs({
  options: {
    runs: { type: 'string', default: '3' },
    cpus: { type: 'string' },
    'cpu-list': { type: 'string' },
    json: { type: 'string' },
    verbose: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (args.help) {
  console.log(`Usage: node scripts/bench-build.mjs [options]

Options:
  --runs <n>         Number of cold builds to run (default: 3)
  --cpus <n>         Pin the build to the first <n> CPUs this process may use
                     (Linux only, uses taskset)
  --cpu-list <list>  Pin the build to an explicit CPU list, e.g. 0-7 or
                     0,2,4,6 (Linux only, uses taskset)
  --json <file>      Also write the results to <file> as JSON
  --verbose          Print the full next build output`)
  process.exit(0)
}

const runs = Number(args.runs)
if (!Number.isInteger(runs) || runs <= 0) {
  fail(`--runs must be a positive integer, got ${args.runs}`)
}

if (!fs.existsSync(path.join(APP_DIR, 'app'))) {
  fail('The app has not been generated yet. Run `pnpm prepare-bench` first.')
}
if (!fs.existsSync(NEXT_BIN)) {
  fail(`${NEXT_BIN} not found. Build Next.js first (pnpm build).`)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

// Parses a CPU list like "0-3,8,10-11" into ranges.
function parseCpuRanges(list, name) {
  const ranges = []
  for (const part of list.trim().split(',')) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part)
    const start = match && Number(match[1])
    const end = match && Number(match[2] ?? match[1])
    if (
      !match ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      end < start
    ) {
      fail(`Invalid ${name} ${list}, expected e.g. 0-7 or 0,2,4`)
    }
    ranges.push([start, end])
  }
  return ranges
}

function parseCpuList(list, name) {
  const cpus = []
  for (const [start, end] of parseCpuRanges(list, name)) {
    for (let cpu = start; cpu <= end; cpu++) cpus.push(cpu)
  }
  return cpus
}

// Formats [0, 1, 2, 3, 8, 10, 11] as "0-3,8,10-11".
function formatCpuList(cpus) {
  const ranges = []
  for (const cpu of cpus) {
    const last = ranges[ranges.length - 1]
    if (last && cpu === last[1] + 1) last[1] = cpu
    else ranges.push([cpu, cpu])
  }
  return ranges
    .map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`))
    .join(',')
}

let cpuList = null
if (args.cpus !== undefined || args['cpu-list'] !== undefined) {
  if (args.cpus !== undefined && args['cpu-list'] !== undefined) {
    fail('Pass either --cpus or --cpu-list, not both.')
  }
  if (process.platform !== 'linux') {
    fail(
      '--cpus and --cpu-list are only supported on Linux (they use taskset).'
    )
  }
  // The CPUs this process is currently allowed to run on, which are not
  // necessarily 0..n-1 (e.g. in containers or when already pinned).
  const status = fs.readFileSync('/proc/self/status', 'utf8')
  const allowed = parseCpuList(
    /^Cpus_allowed_list:\s*(.+)$/m.exec(status)?.[1] ?? '',
    'Cpus_allowed_list'
  )
  const allowedSet = new Set(allowed)
  let cpus
  if (args.cpus !== undefined) {
    const count = Number(args.cpus)
    if (!Number.isInteger(count) || count <= 0) {
      fail(`--cpus must be a positive integer, got ${args.cpus}`)
    }
    if (count > allowed.length) {
      fail(
        `--cpus ${count} requested, but only ${allowed.length} CPUs are available to this process.`
      )
    }
    cpus = allowed.slice(0, count)
  } else {
    const ranges = parseCpuRanges(args['cpu-list'], '--cpu-list')
    const unavailable = ranges.filter(([start, end]) => {
      if (end - start + 1 > allowed.length) return true
      for (let cpu = start; cpu <= end; cpu++) {
        if (!allowedSet.has(cpu)) return true
      }
      return false
    })
    if (unavailable.length) {
      fail(
        `CPU list ${args['cpu-list']} includes CPUs not available to this process (allowed: ${formatCpuList(allowed)}).`
      )
    }
    cpus = [...new Set(parseCpuList(args['cpu-list'], '--cpu-list'))].sort(
      (a, b) => a - b
    )
  }
  cpuList = formatCpuList(cpus)
}

function runBuild() {
  fs.rmSync(path.join(APP_DIR, '.next'), { recursive: true, force: true })
  const command = cpuList ? 'taskset' : process.execPath
  const commandArgs = cpuList
    ? ['-c', cpuList, process.execPath, NEXT_BIN, 'build']
    : [NEXT_BIN, 'build']

  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint()
    const child = spawn(command, commandArgs, {
      cwd: APP_DIR,
      env: { NEXT_TELEMETRY_DISABLED: '1', ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const onData = (data) => {
      output += data
      if (args.verbose) process.stdout.write(data)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', (err) => {
      reject(
        err.code === 'ENOENT' && cpuList
          ? new Error('taskset not found (install util-linux).')
          : err
      )
    })
    child.on('close', (code) => {
      const wall = Number(process.hrtime.bigint() - start) / 1e9
      if (code !== 0) {
        if (!args.verbose) process.stdout.write(output)
        reject(new Error(`next build exited with code ${code}`))
        return
      }
      resolve({ wall, compile: readCompileTime() })
    })
  })
}

// Reads the duration of the Turbopack compilation (the `run-turbopack` span)
// from the build trace. Returns seconds, or null if it can't be found.
function readCompileTime() {
  let trace
  try {
    trace = fs.readFileSync(path.join(APP_DIR, '.next', 'trace'), 'utf8')
  } catch {
    return null
  }
  for (const line of trace.split('\n')) {
    if (!line) continue
    for (const event of JSON.parse(line)) {
      if (event.name === 'run-turbopack') return event.duration / 1e6
    }
  }
  return null
}

function stats(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance =
    values.length > 1
      ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
        (values.length - 1)
      : 0
  return {
    mean,
    stddev: Math.sqrt(variance),
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

const fmt = (s) => `${s.mean.toFixed(2)}s ± ${s.stddev.toFixed(2)}s`

console.log(
  `Running ${runs} cold next build(s)${cpuList ? ` pinned to CPUs ${cpuList}` : ''}...`
)
const results = []
for (let i = 0; i < runs; i++) {
  const result = await runBuild()
  results.push(result)
  console.log(
    `  run ${i + 1}: ${result.wall.toFixed(2)}s wall` +
      (result.compile !== null
        ? `, turbopack compile ${result.compile.toFixed(2)}s`
        : '')
  )
}

const wall = stats(results.map((r) => r.wall))
const compiles = results.map((r) => r.compile).filter((c) => c !== null)
const compile = compiles.length === results.length ? stats(compiles) : null
console.log(
  `\nnext build wall time: ${fmt(wall)} (min ${wall.min.toFixed(2)}s, max ${wall.max.toFixed(2)}s, n=${runs})`
)
if (compile) {
  console.log(
    `turbopack compile:    ${fmt(compile)} (min ${compile.min.toFixed(2)}s, max ${compile.max.toFixed(2)}s)`
  )
}

if (args.json) {
  fs.writeFileSync(
    args.json,
    JSON.stringify({ cpus: cpuList, runs: results, wall, compile }, null, 2) +
      '\n'
  )
}
