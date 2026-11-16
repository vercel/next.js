// Benchmarks warm Turbopack compiles of `next build` (with the persistent
// filesystem cache, which is enabled by default) after changing N source files,
// e.g. to measure the incremental rebuild work after many changes.
//
// Run `pnpm prepare-bench` in this directory first to generate the app. Then:
//
//   node bench-warm-build.mjs [--files=100] [--iterations=20] [--warmup=5]
//     [--cold=true] [--seed=1]
//
// - `--files`: the number of component files changed before every warm build.
//   They are picked deterministically (by `--seed`) from `components/`, so
//   different runs change the same files. `0` measures a rebuild without
//   changes.
// - `--iterations`: the number of warm builds. Every iteration changes the
//   files differently, so every build has to recompute them.
// - `--warmup`: how many of the first warm builds are only warm-up. They are
//   printed, but excluded from the statistics, which are computed over the
//   remaining `iterations - warmup` builds.
// - `--cold`: whether to delete `.next` and do a (measured, but not counted)
//   cold build first that fills the cache. Use `--cold=false` to reuse the
//   cache of a previous run.
// - `--seed`: the seed for picking the changed files.
//
// Builds run with `--experimental-build-mode=compile`, which skips
// prerendering the 3000 routes, as that doesn't depend on the bundler's work.
// The reported compile time is the one `next build` prints. The first warm
// builds after a cold one tend to be slower than the following ones, hence the
// warm-up builds.
//
// The changed files are restored afterwards, also when the run fails or is
// interrupted.
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CWD = fileURLToPath(new URL('.', import.meta.url))
const ROOT_DIR = join(CWD, '..', '..')
const NEXT_BIN = join(ROOT_DIR, 'packages', 'next', 'dist', 'bin', 'next')
const COMPONENTS_DIR = join(CWD, 'components')

function parseInteger(name, value, min = Number.MIN_SAFE_INTEGER) {
  const number = /^-?\d+$/.test(value) ? Number(value) : NaN
  if (!Number.isSafeInteger(number) || number < min) {
    throw new Error(
      min === Number.MIN_SAFE_INTEGER
        ? `--${name} must be an integer`
        : `--${name} must be an integer >= ${min}`
    )
  }
  return number
}

function parseArgs(argv) {
  const options = {
    files: 100,
    iterations: 20,
    warmup: 5,
    cold: true,
    seed: 1,
  }
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg)
    if (!match || !Object.hasOwn(options, match[1])) {
      throw new Error(`Unknown argument: ${arg}`)
    }
    const [, name, value] = match
    switch (name) {
      case 'files':
        options.files = parseInteger(name, value, 0)
        break
      case 'iterations':
        options.iterations = parseInteger(name, value, 1)
        break
      case 'warmup':
        options.warmup = parseInteger(name, value, 0)
        break
      case 'seed':
        options.seed = parseInteger(name, value)
        break
      case 'cold':
        if (value !== 'true' && value !== 'false') {
          throw new Error('--cold must be true or false')
        }
        options.cold = value === 'true'
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (options.warmup >= options.iterations) {
    throw new Error(
      `--warmup=${options.warmup} must be smaller than --iterations=${options.iterations}`
    )
  }
  return options
}

// A small seeded PRNG (mulberry32), so the picked files are reproducible.
function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickFiles(count, seed) {
  const files = readdirSync(COMPONENTS_DIR)
    .filter((file) => file.endsWith('.jsx') && file !== 'index.jsx')
    .sort()
  if (count > files.length) {
    throw new Error(
      `--files=${count} is larger than the ${files.length} available components`
    )
  }
  // Fisher-Yates shuffle, then take the first `count`, so the files are spread
  // over the whole component tree.
  const random = createRandom(seed)
  for (let i = files.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[files[i], files[j]] = [files[j], files[i]]
  }
  return files.slice(0, count).map((file) => join(COMPONENTS_DIR, file))
}

// Changes the rendered output of every file, not just a comment, so the change
// propagates beyond parsing. The value (digits only) differs per run and
// iteration, so every build differs from what is in the cache, also with
// `--cold=false`.
function changeFiles(originals, value) {
  for (const [file, original] of originals) {
    // Also matches a file that is still changed, e.g. after the script was
    // killed without restoring it.
    const changed = original.replace(
      /<div(?: data-warm-build="\d*")?>/,
      `<div data-warm-build="${value}">`
    )
    if (changed === original) {
      throw new Error(`Found no <div> to change in ${file}`)
    }
    writeFileSync(file, changed)
  }
}

function restoreFiles(originals) {
  for (const [file, original] of originals) {
    writeFileSync(file, original)
  }
}

/** The running `next build` process, if any. */
let currentBuild = null

function build() {
  const args = [NEXT_BIN, 'build', '--experimental-build-mode=compile']
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint()
    const child = spawn(process.execPath, args, {
      cwd: CWD,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        // A native binary built locally from a dirty checkout disables the
        // filesystem cache, which would turn every warm build into a cold one.
        TURBO_ENGINE_IGNORE_DIRTY: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    currentBuild = child
    let output = ''
    child.stdout.on('data', (data) => (output += data))
    child.stderr.on('data', (data) => (output += data))
    child.on('error', reject)
    child.on('close', (code, signal) => {
      currentBuild = null
      const wallMs = Number(process.hrtime.bigint() - start) / 1e6
      if (code !== 0) {
        reject(
          new Error(
            `next build failed (${signal ?? `exit code ${code}`}):\n${output}`
          )
        )
        return
      }
      if (/File System Cache is disabled/.test(output)) {
        reject(
          new Error(
            `The filesystem cache is disabled, see the output:\n${output}`
          )
        )
        return
      }
      // e.g. "✓ Compiled successfully in 12.3s" or "in 850ms"
      const match = /Compiled successfully in (\d+(?:\.\d+)?)(ms|s|min)/.exec(
        output
      )
      const compileMs = match
        ? Number(match[1]) * { ms: 1, s: 1000, min: 60_000 }[match[2]]
        : undefined
      resolve({ wallMs, compileMs })
    })
  })
}

function formatMs(ms) {
  return ms === undefined ? '-' : `${(ms / 1000).toFixed(2)}s`
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function summarize(label, values) {
  if (values.length === 0) {
    return `${label}: -`
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  // The sample standard deviation, which needs at least two samples.
  const stdDev =
    values.length > 1
      ? Math.sqrt(
          values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
            (values.length - 1)
        )
      : undefined
  return `${label} (${values.length} builds): median ${formatMs(
    median(values)
  )}, mean ${formatMs(mean)}, std dev ${formatMs(stdDev)}, min ${formatMs(
    Math.min(...values)
  )}, max ${formatMs(Math.max(...values))}`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!existsSync(join(COMPONENTS_DIR, 'index.jsx'))) {
    throw new Error('The app is not generated yet, run `pnpm prepare-bench`')
  }
  if (!existsSync(NEXT_BIN)) {
    throw new Error(`${NEXT_BIN} doesn't exist, build next first`)
  }

  const originals = new Map(
    pickFiles(options.files, options.seed).map((file) => [
      file,
      readFileSync(file, 'utf8'),
    ])
  )
  const restore = () => restoreFiles(originals)
  let interrupted = false
  const onSignal = (signal) => {
    if (interrupted) {
      return
    }
    interrupted = true
    const exit = () => {
      restore()
      process.exit(128 + (signal === 'SIGINT' ? 2 : 15))
    }
    // Wait for the build to exit, so it doesn't keep reading the changed files
    // or writing to `.next` after the files were restored.
    const child = currentBuild
    if (child && child.exitCode === null && child.signalCode === null) {
      child.once('exit', exit)
      child.kill(signal)
    } else {
      exit()
    }
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  console.log(
    `Warm builds after changing ${options.files} files, ${options.iterations} iterations (${options.warmup} warm-up)`
  )
  try {
    if (options.cold) {
      await rm(join(CWD, '.next'), { recursive: true, force: true })
      const cold = await build()
      console.log(
        `cold: wall ${formatMs(cold.wallMs)}, compile ${formatMs(cold.compileMs)}`
      )
    }
    const runId = Date.now()
    const wall = []
    const compile = []
    for (let iteration = 1; iteration <= options.iterations; iteration++) {
      changeFiles(originals, `${runId}${String(iteration).padStart(4, '0')}`)
      const result = await build()
      const isWarmup = iteration <= options.warmup
      if (!isWarmup) {
        wall.push(result.wallMs)
        if (result.compileMs !== undefined) {
          compile.push(result.compileMs)
        }
      }
      console.log(
        `warm #${iteration}${isWarmup ? ' (warm-up, excluded)' : ''}: wall ${formatMs(result.wallMs)}, compile ${formatMs(result.compileMs)}`
      )
    }
    console.log(summarize('warm wall', wall))
    console.log(summarize('warm compile', compile))
  } finally {
    restore()
  }
}

await main()
