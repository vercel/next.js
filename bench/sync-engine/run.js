#!/usr/bin/env node
// Benchmark harness: builds the generated app with the async and the sync
// turbo-tasks engine and reports the ratio.
//
//   node bench/sync-engine/run.js [--preset medium] [--runs 3] [--limit 999]
//                                 [--only sync|async] [--env KEY=VAL ...]
//
// Both binaries are `next-build-test`, compiled from the same source with
// different cargo features, into separate target dirs so switching modes does
// not trigger a rebuild:
//
//   async: cargo build --release -p next-build-test --target-dir target/bench-async
//   sync:  cargo build --release -p next-build-test --no-default-features \
//            --features sync --target-dir target/bench-sync
//
// Pass --build to (re)compile them first.

const { execFileSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const REPO = path.resolve(__dirname, '..', '..')
const BINARIES = {
  async: path.join(REPO, 'target', 'bench-async', 'release', 'next-build-test'),
  sync: path.join(REPO, 'target', 'bench-sync', 'release', 'next-build-test'),
}
const BUILD_ARGS = {
  async: [
    'build',
    '--release',
    '-p',
    'next-build-test',
    '--target-dir',
    'target/bench-async',
  ],
  sync: [
    'build',
    '--release',
    '-p',
    'next-build-test',
    '--no-default-features',
    '--features',
    'sync',
    '--target-dir',
    'target/bench-sync',
  ],
}

function parseArgs(argv) {
  const out = {
    preset: 'medium',
    runs: 3,
    limit: 999,
    only: null,
    build: false,
    env: {},
    strategies: null,
    json: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--preset') out.preset = argv[++i]
    else if (a === '--runs') out.runs = Number(argv[++i])
    else if (a === '--limit') out.limit = Number(argv[++i])
    else if (a === '--only') out.only = argv[++i]
    else if (a === '--build') out.build = true
    else if (a === '--json') out.json = argv[++i]
    else if (a === '--strategies') out.strategies = argv[++i].split(',')
    else if (a === '--env') {
      const [k, ...rest] = argv[++i].split('=')
      out.env[k] = rest.join('=')
    } else throw new Error(`unknown arg ${a}`)
  }
  return out
}

function fmt(ms) {
  return `${(ms / 1000).toFixed(2)}s`
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function ensureApp(preset) {
  const appDir = path.join(__dirname, 'generated', preset)
  if (!fs.existsSync(path.join(appDir, 'app', 'layout.js'))) {
    console.log(`generating app (preset=${preset})...`)
    execFileSync(
      process.execPath,
      [path.join(__dirname, 'generate.js'), preset],
      {
        stdio: 'inherit',
      }
    )
  }
  return appDir
}

function ensureBinary(mode, forceBuild) {
  if (!forceBuild && fs.existsSync(BINARIES[mode])) return
  console.log(`building ${mode} binary...`)
  const r = spawnSync('cargo', BUILD_ARGS[mode], {
    cwd: REPO,
    stdio: 'inherit',
  })
  if (r.status !== 0) throw new Error(`cargo build (${mode}) failed`)
}

function ensureProjectOptions(appDir, mode) {
  const file = path.join(appDir, 'project_options.json')
  if (fs.existsSync(file)) return
  console.log('generating project_options.json...')
  const out = execFileSync(BINARIES[mode], ['generate', '.'], {
    cwd: appDir,
    maxBuffer: 64 * 1024 * 1024,
  })
  fs.writeFileSync(file, out)
}

// The build prints per-phase tracing lines; pull the interesting ones out so a
// regression can be attributed to a phase rather than just "the build".
function parsePhases(stderr) {
  const phases = {}
  const rendered = stderr.match(/rendered (\d+) pages in ([\d.]+)(m?s)/)
  if (rendered) {
    phases.pages = Number(rendered[1])
    phases.renderMs = Number(rendered[2]) * (rendered[3] === 'ms' ? 1 : 1000)
  }
  const mem = stderr.match(/memory usage: (\d+) MiB/)
  if (mem) phases.memMiB = Number(mem[1])
  return phases
}

// `/usr/bin/time -l` (macOS) / `-v` (GNU) reports user+sys CPU seconds. The ratio
// (user+sys)/real is the average number of cores kept busy — the single most useful
// number when comparing two schedulers on the same workload.
function parseCpu(stderr) {
  // macOS: "        3.87 real         5.12 user         1.02 sys"
  const m = stderr.match(/([\d.]+)\s+real\s+([\d.]+)\s+user\s+([\d.]+)\s+sys/)
  if (m) return { userSec: Number(m[2]), sysSec: Number(m[3]) }
  const gnuUser = stderr.match(/User time \(seconds\): ([\d.]+)/)
  const gnuSys = stderr.match(/System time \(seconds\): ([\d.]+)/)
  if (gnuUser && gnuSys) {
    return { userSec: Number(gnuUser[1]), sysSec: Number(gnuSys[1]) }
  }
  return {}
}

function runOnce(mode, appDir, strategy, limit, env) {
  fs.rmSync(path.join(appDir, '.next'), { recursive: true, force: true })
  const args = ['run', strategy, '1', String(limit)]
  const useTime = fs.existsSync('/usr/bin/time')
  const bin = useTime ? '/usr/bin/time' : BINARIES[mode]
  const argv = useTime
    ? [process.platform === 'darwin' ? '-l' : '-v', BINARIES[mode], ...args]
    : args
  const started = Date.now()
  const r = spawnSync(bin, argv, {
    cwd: appDir,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, RUST_LOG: 'info', ...env },
  })
  const wall = Date.now() - started
  if (r.status !== 0) {
    process.stderr.write(r.stdout || '')
    process.stderr.write(r.stderr || '')
    throw new Error(`${mode}/${strategy} build failed (exit ${r.status})`)
  }
  const stderr = r.stderr || ''
  const cpu = parseCpu(stderr)
  const cores =
    cpu.userSec != null ? ((cpu.userSec + cpu.sysSec) * 1000) / wall : undefined
  return { wall, cores, ...cpu, ...parsePhases(stderr) }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const appDir = ensureApp(opts.preset)

  const modes =
    opts.only === 'sync'
      ? ['sync']
      : opts.only === 'async'
        ? ['async']
        : ['async', 'sync']
  for (const m of modes) ensureBinary(m, opts.build)
  ensureProjectOptions(appDir, modes[0])

  // Async supports both the sequential driver (apples-to-apples with sync) and
  // the concurrent one (what a real `next build` does). Sync only has sequential.
  const plan = []
  for (const mode of modes) {
    const strategies =
      opts.strategies ??
      (mode === 'async' ? ['sequential', 'concurrent'] : ['sequential'])
    for (const s of strategies) plan.push({ mode, strategy: s })
  }

  const results = []
  for (const { mode, strategy } of plan) {
    const label = `${mode}/${strategy}`
    const walls = []
    const phases = []
    for (let i = 0; i < opts.runs; i++) {
      process.stdout.write(`  ${label} run ${i + 1}/${opts.runs}... `)
      const r = runOnce(mode, appDir, strategy, opts.limit, opts.env)
      walls.push(r.wall)
      phases.push(r)
      process.stdout.write(
        `${fmt(r.wall)}${r.cores ? `  (${r.cores.toFixed(2)} cores busy)` : ''}\n`
      )
    }
    const cores = phases.map((p) => p.cores).filter((c) => c != null)
    results.push({
      label,
      mode,
      strategy,
      walls,
      median: median(walls),
      min: Math.min(...walls),
      cores: cores.length ? median(cores) : undefined,
      pages: phases[0].pages,
      memMiB: phases[0].memMiB,
    })
  }

  console.log('\n=== results (median of %d) ===', opts.runs)
  const baseline =
    results.find((r) => r.label === 'async/sequential') ?? results[0]
  for (const r of results) {
    const ratio = r.median / baseline.median
    console.log(
      `  ${r.label.padEnd(20)} median ${fmt(r.median).padStart(8)}  min ${fmt(r.min).padStart(8)}` +
        `  ${ratio.toFixed(2)}x vs ${baseline.label}` +
        (r.cores != null ? `  cores=${r.cores.toFixed(2)}` : '') +
        (r.pages != null ? `  routes=${r.pages}` : '') +
        (r.memMiB != null ? `  mem=${r.memMiB}MiB` : '')
    )
  }

  if (opts.json) {
    fs.writeFileSync(opts.json, JSON.stringify({ opts, results }, null, 2))
    console.log(`\nwrote ${opts.json}`)
  }
}

main()
