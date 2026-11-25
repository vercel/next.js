// Runs `next build` of the generated app repeatedly and reports, per build and
// as mean ± stddev: the wall time, the Turbopack compile time (the
// `run-turbopack` span from `.next/trace`), the peak RSS, the size of the
// persistent cache (`.next/cache`) and a digest of all emitted `.nft.json`
// files.
//
// Builds are either cold (`.next` deleted first) or warm (a warm-up build
// fills the persistent cache, then some components are edited and the app is
// rebuilt). With several `--variant`s, the trials of the variants are
// interleaved to compare native binaries (e.g. base vs head) under the same
// host conditions.
//
// Usage:
//   node scripts/bench-build.mjs [--runs 3] [--mode cold|warm] [--cache on|off]
//                                [--variant base=/path/to/native ...]
//                                [--cpus 16] [--json out.json]
//
// See README.md for details.
import { execFileSync, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const APP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const NEXT_DIR = path.join(APP_DIR, '.next')
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
    mode: { type: 'string', default: 'cold' },
    cache: { type: 'string' },
    'compile-only': { type: 'boolean', default: false },
    'edit-components': { type: 'string', default: '50' },
    variant: { type: 'string', multiple: true, default: [] },
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
  --runs <n>              Number of measured builds per variant (default: 3)
  --mode <cold|warm>      cold: delete .next before every build (default).
                          warm: delete .next, run an untimed warm-up build,
                          edit --edit-components components, then measure the
                          rebuild with the persistent cache
  --edit-components <n>   Components to edit in warm mode (default: 50)
  --cache <on|off>        Turbopack persistent cache (default: on, or off if
                          TURBO_CACHE=0 is set). off sets TURBO_CACHE=0
  --compile-only          Pass --experimental-build-mode=compile to next build
  --variant <name>=<dir>  Native binary variant to measure: runs the build with
                          NEXT_TEST_NATIVE_DIR=<dir>. Repeat to compare
                          variants; their trials are interleaved and the first
                          one is the baseline for the deltas
  --cpus <n>              Pin the build to the first <n> CPUs this process may
                          use (Linux only, uses taskset)
  --cpu-list <list>       Pin the build to an explicit CPU list, e.g. 0-7 or
                          0,2,4,6 (Linux only, uses taskset)
  --json <file>           Also write the results to <file> as JSON
  --verbose               Print the full next build output

Every build runs with TURBO_ENGINE_IGNORE_DIRTY=1.`)
  process.exit(0)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function positiveInt(name) {
  const n = Number(args[name])
  if (!Number.isInteger(n) || n <= 0) {
    fail(`--${name} must be a positive integer, got ${args[name]}`)
  }
  return n
}

const runs = positiveInt('runs')
const mode = args.mode
if (mode !== 'cold' && mode !== 'warm') {
  fail(`--mode must be cold or warm, got ${mode}`)
}
const cache = args.cache ?? (process.env.TURBO_CACHE === '0' ? 'off' : 'on')
if (cache !== 'on' && cache !== 'off') {
  fail(`--cache must be on or off, got ${cache}`)
}
if (mode === 'warm' && cache === 'off') {
  fail(
    '--mode warm needs the persistent cache, it cannot be used with --cache off.'
  )
}
const editCount = mode === 'warm' ? positiveInt('edit-components') : 0

const variants = args.variant.map((spec) => {
  const eq = spec.indexOf('=')
  const name = eq > 0 ? spec.slice(0, eq) : ''
  const dir = eq > 0 ? spec.slice(eq + 1) : ''
  if (!name || !dir) fail(`--variant must be <name>=<dir>, got ${spec}`)
  const nativeDir = path.resolve(dir)
  if (!fs.statSync(nativeDir, { throwIfNoEntry: false })?.isDirectory()) {
    fail(`--variant ${name}: ${nativeDir} is not a directory`)
  }
  if (!fs.readdirSync(nativeDir).some((f) => /^next-swc\..+\.node$/.test(f))) {
    fail(`--variant ${name}: no next-swc.*.node binary in ${nativeDir}`)
  }
  return { name, nativeDir }
})
if (new Set(variants.map((v) => v.name)).size !== variants.length) {
  fail('--variant names must be unique.')
}
if (!variants.length) {
  // A single implicit variant using the current environment.
  variants.push({
    name: 'current',
    nativeDir: process.env.NEXT_TEST_NATIVE_DIR ?? null,
  })
}

if (!fs.existsSync(path.join(APP_DIR, 'app'))) {
  fail('The app has not been generated yet. Run `pnpm prepare-bench` first.')
}
if (!fs.existsSync(NEXT_BIN)) {
  fail(`${NEXT_BIN} not found. Build Next.js first (pnpm build).`)
}

// ---------------------------------------------------------------------------
// CPU pinning

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

// The CPUs this process is currently allowed to run on, which are not
// necessarily 0..n-1 (e.g. in containers or when already pinned).
function allowedCpus() {
  if (process.platform !== 'linux') return null
  const status = fs.readFileSync('/proc/self/status', 'utf8')
  return parseCpuList(
    /^Cpus_allowed_list:\s*(.+)$/m.exec(status)?.[1] ?? '',
    'Cpus_allowed_list'
  )
}

let pinnedCpus = null
if (args.cpus !== undefined || args['cpu-list'] !== undefined) {
  if (args.cpus !== undefined && args['cpu-list'] !== undefined) {
    fail('Pass either --cpus or --cpu-list, not both.')
  }
  if (process.platform !== 'linux') {
    fail(
      '--cpus and --cpu-list are only supported on Linux (they use taskset).'
    )
  }
  const allowed = allowedCpus()
  const allowedSet = new Set(allowed)
  if (args.cpus !== undefined) {
    const count = positiveInt('cpus')
    if (count > allowed.length) {
      fail(
        `--cpus ${count} requested, but only ${allowed.length} CPUs are available to this process.`
      )
    }
    pinnedCpus = allowed.slice(0, count)
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
    pinnedCpus = [
      ...new Set(parseCpuList(args['cpu-list'], '--cpu-list')),
    ].sort((a, b) => a - b)
  }
}
const cpuList = pinnedCpus && formatCpuList(pinnedCpus)

// ---------------------------------------------------------------------------
// Environment metadata

function tryExec(command, commandArgs) {
  try {
    return execFileSync(command, commandArgs, {
      cwd: APP_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

// Which logical CPUs share a physical core (SMT siblings), for the CPUs the
// builds run on. Linux only.
function cpuTopology(cpus) {
  if (!cpus) return null
  const siblings = {}
  for (const cpu of cpus) {
    try {
      siblings[cpu] = fs
        .readFileSync(
          `/sys/devices/system/cpu/cpu${cpu}/topology/thread_siblings_list`,
          'utf8'
        )
        .trim()
    } catch {
      return null
    }
  }
  return {
    logicalCpus: cpus.length,
    physicalCores: new Set(Object.values(siblings)).size,
    threadSiblings: siblings,
  }
}

const usedCpus = pinnedCpus ?? allowedCpus()
const environment = {
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  cpuModel: os.cpus()[0]?.model ?? null,
  logicalCpusOnHost: os.cpus().length,
  cpuList: cpuList ?? (usedCpus ? formatCpuList(usedCpus) : null),
  pinned: cpuList !== null,
  topology: cpuTopology(usedCpus),
  totalMemoryBytes: os.totalmem(),
  gitHead: tryExec('git', ['rev-parse', 'HEAD']),
  gitDirty: tryExec('git', ['status', '--porcelain']) ? true : false,
  loadAverageBefore: os.loadavg(),
  loadAverageAfter: null,
}

// ---------------------------------------------------------------------------
// Measurements

// Aggregate CPU time counters from /proc/stat, used to report the share of
// CPU time stolen by the hypervisor (host noise) during each build.
function readCpuTimes() {
  if (process.platform !== 'linux') return null
  const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0]
  const values = line.trim().split(/\s+/).slice(1).map(Number)
  // user nice system idle iowait irq softirq steal (guest time is already
  // included in user/nice).
  const total = values.slice(0, 8).reduce((a, b) => a + b, 0)
  return { total, steal: values[7] ?? 0 }
}

function stealPercent(before, after) {
  if (!before || !after || after.total === before.total) return null
  return (100 * (after.steal - before.steal)) / (after.total - before.total)
}

// Sum of the RSS of a process and all its descendants, from /proc. Linux only.
function treeRss(pid) {
  let rss = 0
  const stack = [pid]
  while (stack.length) {
    const p = stack.pop()
    try {
      const status = fs.readFileSync(`/proc/${p}/status`, 'utf8')
      rss += Number(/^VmRSS:\s*(\d+)\s*kB$/m.exec(status)?.[1] ?? 0) * 1024
      for (const task of fs.readdirSync(`/proc/${p}/task`)) {
        const children = fs
          .readFileSync(`/proc/${p}/task/${task}/children`, 'utf8')
          .trim()
        if (children) stack.push(...children.split(' ').map(Number))
      }
    } catch {
      // The process exited in the meantime.
    }
  }
  return rss
}

function dirSize(dir) {
  let size = 0
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return 0
    throw err
  }
  for (const entry of entries) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) size += dirSize(file)
    else if (entry.isFile()) size += fs.statSync(file).size
  }
  return size
}

function findFiles(dir, suffix, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return out
    throw err
  }
  for (const entry of entries) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // The persistent cache never contains build output.
      if (file !== path.join(NEXT_DIR, 'cache')) findFiles(file, suffix, out)
    } else if (entry.name.endsWith(suffix)) {
      out.push(file)
    }
  }
  return out
}

// A digest over every emitted .nft.json (relative path and content), to check
// that the traces are stable across runs and variants, plus their size.
function nftSummary() {
  const files = findFiles(NEXT_DIR, '.nft.json')
    .map((file) => path.relative(NEXT_DIR, file).split(path.sep).join('/'))
    .sort()
  const hash = crypto.createHash('sha256')
  let entries = 0
  for (const rel of files) {
    const content = fs.readFileSync(path.join(NEXT_DIR, rel))
    hash.update(rel).update('\0').update(content).update('\0')
    entries += JSON.parse(content).files?.length ?? 0
  }
  return {
    nftFiles: files.length,
    nftEntries: entries,
    nftEntriesPerFile: files.length ? entries / files.length : null,
    nftDigest: files.length ? hash.digest('hex') : null,
  }
}

// Reads the duration of the Turbopack compilation (the `run-turbopack` span)
// from the build trace. Returns seconds, or null if it can't be found.
function readCompileTime() {
  let trace
  try {
    trace = fs.readFileSync(path.join(NEXT_DIR, 'trace'), 'utf8')
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

function buildEnv(variant) {
  const env = {
    NEXT_TELEMETRY_DISABLED: '1',
    ...process.env,
    // Locally built binaries usually come from a dirty checkout, which
    // otherwise disables the persistent cache. Set it for every variant so
    // they all behave the same.
    TURBO_ENGINE_IGNORE_DIRTY: '1',
  }
  if (cache === 'off') env.TURBO_CACHE = '0'
  else delete env.TURBO_CACHE
  if (variant.nativeDir) env.NEXT_TEST_NATIVE_DIR = variant.nativeDir
  else delete env.NEXT_TEST_NATIVE_DIR
  return env
}

let currentBuild = null

function runBuild(variant) {
  const buildArgs = [NEXT_BIN, 'build']
  if (args['compile-only']) buildArgs.push('--experimental-build-mode=compile')
  const command = cpuList ? 'taskset' : process.execPath
  const commandArgs = cpuList
    ? ['-c', cpuList, process.execPath, ...buildArgs]
    : buildArgs

  return new Promise((resolve, reject) => {
    const cpuBefore = readCpuTimes()
    const start = process.hrtime.bigint()
    const child = spawn(command, commandArgs, {
      cwd: APP_DIR,
      env: buildEnv(variant),
      // Own process group, so an interrupt can stop the build's workers too.
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    currentBuild = child
    // Sample the RSS of the whole build process tree (Turbopack runs in the
    // main process, page data collection and static generation in workers).
    let peakRss = process.platform === 'linux' ? 0 : null
    const sampler =
      peakRss === null
        ? null
        : setInterval(() => {
            peakRss = Math.max(peakRss, treeRss(child.pid))
          }, 200)
    let output = ''
    const onData = (data) => {
      output += data
      if (args.verbose) process.stdout.write(data)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', (err) => {
      if (sampler) clearInterval(sampler)
      reject(
        err.code === 'ENOENT' && cpuList
          ? new Error('taskset not found (install util-linux).')
          : err
      )
    })
    child.on('close', (code) => {
      const wall = Number(process.hrtime.bigint() - start) / 1e9
      currentBuild = null
      if (sampler) clearInterval(sampler)
      if (code !== 0) {
        if (!args.verbose) process.stdout.write(output)
        reject(new Error(`next build exited with code ${code}`))
        return
      }
      try {
        resolve({
          wall,
          compile: readCompileTime(),
          peakRssBytes: peakRss,
          cacheBytes: dirSize(path.join(NEXT_DIR, 'cache')),
          cpuStealPercent: stealPercent(cpuBefore, readCpuTimes()),
          ...nftSummary(),
        })
      } catch (err) {
        reject(err)
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Warm mode: deterministic component edits

let editedFiles = new Map()

function restoreEdits() {
  for (const [file, content] of editedFiles) fs.writeFileSync(file, content)
  editedFiles = new Map()
}

// Stop the running build and restore the edited components if the benchmark
// is interrupted.
function stopCurrentBuild() {
  if (!currentBuild) return
  try {
    if (process.platform === 'win32') currentBuild.kill('SIGKILL')
    else process.kill(-currentBuild.pid, 'SIGKILL')
  } catch (err) {
    if (err.code !== 'ESRCH') throw err
  }
}

function onSignal(signal) {
  stopCurrentBuild()
  restoreEdits()
  process.exit(128 + os.constants.signals[signal])
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

// Evenly spaced components across the library (primitives to templates), so
// the edits invalidate modules shared by many routes as well as few.
function componentsToEdit() {
  const total = fs
    .readdirSync(path.join(APP_DIR, 'components'))
    .filter((name) => /^c\d+$/.test(name)).length
  if (editCount > total) {
    fail(
      `--edit-components ${editCount} exceeds the ${total} generated components.`
    )
  }
  return Array.from({ length: editCount }, (_, i) => {
    const id = Math.floor((i * total) / editCount)
    return path.join(APP_DIR, 'components', `c${id}`, `C${id}.tsx`)
  })
}

function applyEdits(files) {
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    editedFiles.set(file, content)
    // Changes the module's exports, so its dependents have to be rebuilt too.
    fs.writeFileSync(file, `${content}\nexport const benchEdit = 1\n`)
  }
}

// ---------------------------------------------------------------------------
// Run

function stats(values) {
  if (!values.length || values.some((v) => v === null)) return null
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

const GIB = 1024 ** 3
const MIB = 1024 ** 2
const METRICS = [
  ['wall', 'next build wall time', (v) => `${v.toFixed(2)}s`],
  ['compile', 'turbopack compile', (v) => `${v.toFixed(2)}s`],
  ['peakRssBytes', 'peak RSS', (v) => `${(v / GIB).toFixed(2)} GiB`],
  ['cacheBytes', '.next/cache size', (v) => `${(v / MIB).toFixed(1)} MiB`],
]

function formatBuild(result) {
  const parts = [`${result.wall.toFixed(2)}s wall`]
  if (result.compile !== null) {
    parts.push(`turbopack compile ${result.compile.toFixed(2)}s`)
  }
  if (result.peakRssBytes !== null) {
    parts.push(`peak RSS ${(result.peakRssBytes / GIB).toFixed(2)} GiB`)
  }
  parts.push(`cache ${(result.cacheBytes / MIB).toFixed(1)} MiB`)
  parts.push(
    `${result.nftFiles} nft (${result.nftEntriesPerFile === null ? '-' : Math.round(result.nftEntriesPerFile)} files/nft, digest ${result.nftDigest?.slice(0, 16) ?? '-'})`
  )
  if (result.cpuStealPercent !== null) {
    parts.push(`steal ${result.cpuStealPercent.toFixed(1)}%`)
  }
  return parts.join(', ')
}

console.log(
  `Running ${runs} ${mode} next build(s)${variants.length > 1 ? ` per variant (${variants.map((v) => v.name).join(', ')}, interleaved)` : ''}` +
    `, persistent cache ${cache}${args['compile-only'] ? ', compile only' : ''}` +
    `${mode === 'warm' ? `, editing ${editCount} components` : ''}` +
    `${cpuList ? `, pinned to CPUs ${cpuList}` : ''}...`
)
if (environment.topology) {
  console.log(
    `CPUs ${environment.cpuList}: ${environment.topology.logicalCpus} logical CPUs on ${environment.topology.physicalCores} physical cores`
  )
}

const edits = mode === 'warm' ? componentsToEdit() : []
const results = new Map(variants.map((v) => [v.name, []]))
const order = []
try {
  for (let round = 0; round < runs; round++) {
    // Rotate the variant order every round, so no variant always runs first
    // (or always right after a particular other one).
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[(round + i) % variants.length]
      order.push(variant.name)
      fs.rmSync(NEXT_DIR, { recursive: true, force: true })
      let warmup = null
      if (mode === 'warm') {
        warmup = await runBuild(variant)
        applyEdits(edits)
      }
      let result
      try {
        result = await runBuild(variant)
      } finally {
        restoreEdits()
      }
      if (warmup) result.warmup = warmup
      results.get(variant.name).push(result)
      console.log(
        `  round ${round + 1}, ${variant.name}: ${formatBuild(result)}` +
          (warmup ? `\n    (warm-up: ${formatBuild(warmup)})` : '')
      )
    }
  }
} finally {
  restoreEdits()
}
environment.loadAverageAfter = os.loadavg()

const summaries = variants.map((variant) => {
  const runResults = results.get(variant.name)
  const summary = { name: variant.name, nativeDir: variant.nativeDir }
  for (const [key] of METRICS) {
    summary[key] = stats(runResults.map((r) => r[key]))
  }
  summary.cpuStealPercent = stats(runResults.map((r) => r.cpuStealPercent))
  summary.nftFiles = stats(runResults.map((r) => r.nftFiles))
  summary.nftEntries = stats(runResults.map((r) => r.nftEntries))
  summary.nftEntriesPerFile = stats(runResults.map((r) => r.nftEntriesPerFile))
  summary.nftDigests = [...new Set(runResults.map((r) => r.nftDigest))]
  return summary
})

const fmtStat = (s, format) =>
  s
    ? `${format(s.mean)} ± ${format(s.stddev)} (min ${format(s.min)}, max ${format(s.max)})`
    : 'n/a'

console.log()
const base = summaries[0]
for (const summary of summaries) {
  if (summaries.length > 1) console.log(`${summary.name}:`)
  for (const [key, label, format] of METRICS) {
    if (!summary[key]) continue
    let line = `  ${`${label}:`.padEnd(22)}${fmtStat(summary[key], format)}`
    if (summary !== base && base[key]?.mean) {
      const delta =
        (100 * (summary[key].mean - base[key].mean)) / base[key].mean
      line += ` [${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs ${base.name}]`
    }
    console.log(line)
  }
  console.log(
    `  ${'nft files:'.padEnd(22)}${Math.round(summary.nftFiles.mean)}, ${Math.round(summary.nftEntries.mean)} traced entries` +
      (summary.nftEntriesPerFile
        ? ` (${Math.round(summary.nftEntriesPerFile.mean)} per nft)`
        : '')
  )
  if (summary.cpuStealPercent) {
    console.log(
      `  ${'cpu steal:'.padEnd(22)}${summary.cpuStealPercent.mean.toFixed(1)}% (max ${summary.cpuStealPercent.max.toFixed(1)}%)`
    )
  }
}
console.log(`n=${runs} per variant, order: ${order.join(', ')}`)

const shortDigest = (digest) => digest?.slice(0, 16) ?? 'none'
const warnings = []
for (const summary of summaries) {
  if (summary.nftDigests.includes(null)) {
    warnings.push(
      `${summary.name}: at least one build emitted no .nft.json files`
    )
  }
  if (summary.nftDigests.length > 1) {
    warnings.push(
      `${summary.name}: .nft.json output differs between runs (${summary.nftDigests.map(shortDigest).join(', ')})`
    )
  }
}
const digests = new Set(summaries.flatMap((s) => s.nftDigests))
if (summaries.length > 1 && digests.size > 1) {
  warnings.push(
    `.nft.json output differs between variants: ${summaries.map((s) => `${s.name} ${s.nftDigests.map(shortDigest).join('/')}`).join(', ')}`
  )
} else if (digests.size === 1 && !digests.has(null)) {
  console.log(
    `.nft.json output is identical in every build (digest ${shortDigest([...digests][0])})`
  )
}
for (const warning of warnings) console.log(`WARNING: ${warning}`)

if (args.json) {
  fs.writeFileSync(
    args.json,
    JSON.stringify(
      {
        // The CPU list the builds were pinned to (null if not pinned), and
        // the first variant's runs and wall/compile stats, in the format of
        // earlier versions of this script.
        cpus: cpuList,
        runs: results.get(base.name),
        wall: base.wall,
        compile: base.compile,
        options: {
          runs,
          mode,
          cache,
          compileOnly: args['compile-only'],
          editComponents: editCount,
        },
        environment,
        order,
        variants: summaries.map((summary) => ({
          ...summary,
          runs: results.get(summary.name),
        })),
        warnings,
      },
      null,
      2
    ) + '\n'
  )
}
