// Image optimizer benchmark: native sharp vs the WebAssembly build of sharp.
// Must be run with tsx (`pnpm bench:image-optimizer-sharp`).
//
// `next/image-optimizer-transform` (the code behind `/_next/image`) loads
// `sharp`, and sharp picks its binding at load time: the prebuilt native
// `@img/sharp-<platform>` package when it is installed, otherwise the
// WebAssembly `@img/sharp-wasm32` package. Which one a deployment gets is an
// install-time decision (`npm install sharp` vs `npm install --cpu=wasm32
// sharp`, the latter being what Next.js suggests when sharp fails to load).
//
// This benchmark installs both variants of the exact sharp version the
// repository uses into isolated directories, then runs the real
// `optimizeImage()` pipeline against each one from a child process
// (`worker.cjs`) that redirects `require('sharp')` to the chosen install.
// Every (source image, output format, width) combination is timed, and the
// outputs of the two variants are compared byte-for-byte and, when the bytes
// differ, pixel-for-pixel after decoding.
//
// The default source set is generated on first run (`.images/`): a
// multi-megabyte synthetic 12 megapixel photo as JPEG and PNG, plus a
// multi-megabyte PNG screenshot that already lives in the repository. Pass
// `--images=<dir>` to add real photos.

import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BENCH_DIR = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = path.resolve(BENCH_DIR, '..', '..')
const WORKER = path.join(BENCH_DIR, 'worker.cjs')
const SCREENSHOT_PNG = path.join(
  REPO_ROOT,
  'packages/next/src/next-devtools/dev-overlay/app.png'
)

type Variant = 'native' | 'wasm'

type CliOptions = {
  variants: Variant[]
  sharpVersion: string
  imagesDir: string | null
  generated: boolean
  outputs: string[]
  widths: number[]
  iterations: number
  warmup: number
  quality: number
  concurrency: number | null
  operationCache: boolean
  timeoutInSeconds: number
  installDir: string
  artifactDir: string
}

type Source = {
  name: string
  path: string
  contentType: string
  bytes: number
  width: number
  height: number
}

type Job = {
  id: string
  source: string
  imagePath: string
  outputType: string
  outputExt: string
  width: number
}

type WorkerJobResult = {
  id: string
  durationsMs: number[]
  errors: string[]
  outputBytes: number | null
  outputSha256: string | null
  outputFile: string | null
  peakRssBytes: number
}

type WorkerResult = {
  variant: Variant
  environment: {
    bindingPackage: string
    isWasm: boolean
    sharpEntry: string
    versions: Record<string, string>
    concurrency: number
    loadMs: number
  }
  maxRssBytes: number
  results: WorkerJobResult[]
}

type Stats = {
  n: number
  min: number
  median: number
  mean: number
  p95: number
  max: number
  stddev: number
}

type PixelDiff = {
  samples: number
  differing: number
  maxAbsDiff: number
  meanAbsDiff: number
  psnrDb: number | null
  // Set when the outputs could not be compared sample by sample, e.g. because
  // they decoded to different dimensions.
  error?: string
}

type Comparison = {
  job: Job
  perVariant: Record<
    string,
    {
      stats: Stats | null
      errors: string[]
      outputBytes: number | null
      outputSha256: string | null
    }
  >
  // Only present when both the native and wasm variants ran.
  wasmOverNative: number | null
  identicalBytes: boolean | null
  pixelDiff: PixelDiff | null
}

const OUTPUT_EXTENSIONS: Record<string, string> = {
  'image/avif': 'avif',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

const INPUT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
}

function usage() {
  console.log(`Usage: pnpm bench:image-optimizer-sharp [options]

Options:
  --variants=<csv>           native,wasm (default: both)
  --sharp-version=<version>  (default: the version installed for packages/next)
  --images=<dir>             additional source images (png/jpg/webp/avif/gif/tiff)
  --generated=true|false     include the generated default sources (default: true)
  --outputs=<csv>            output MIME types (default: image/webp,image/avif,image/jpeg,image/png)
  --widths=<csv>             target widths (default: 1920,640)
  --iterations=<n>           timed runs per combination (default: 5)
  --warmup=<n>               untimed runs per combination (default: 1)
  --quality=<n>              q parameter (default: 75)
  --concurrency=<n>          experimental.imgOptConcurrency (default: Next.js default)
  --operation-cache=true|false  experimental.imgOptOperationCache (default: false)
  --timeout-seconds=<n>      experimental.imgOptTimeoutInSeconds (default: 7, the Next.js default)
  --install-dir=<path>       where the sharp variants are installed (default: bench/image-optimizer-sharp/.installs)
  --artifact-dir=<path>      (default: bench/image-optimizer-sharp/artifacts/<timestamp>)
  --render=<results.json>    only re-render results.md from a previous run
`)
}

function parseCli(): CliOptions {
  const rawArgs = process.argv.slice(2)
  if (rawArgs.includes('--help')) {
    usage()
    process.exit(0)
  }

  const args = new Map<string, string>()
  for (const rawArg of rawArgs) {
    if (!rawArg.startsWith('--')) continue
    const eq = rawArg.indexOf('=')
    if (eq === -1) {
      args.set(rawArg.slice(2), 'true')
    } else {
      args.set(rawArg.slice(2, eq), rawArg.slice(eq + 1))
    }
  }

  const csv = (key: string, fallback: string) =>
    (args.get(key) ?? fallback)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  const number = (key: string, fallback: number) => {
    const value = args.get(key)
    if (value === undefined) return fallback
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid numeric value for --${key}: ${value}`)
    }
    return parsed
  }
  const boolean = (key: string, fallback: boolean) => {
    const value = args.get(key)
    if (value === undefined) return fallback
    return value === '1' || value === 'true' || value === 'yes'
  }

  const variants = csv('variants', 'native,wasm') as Variant[]
  for (const variant of variants) {
    if (variant !== 'native' && variant !== 'wasm') {
      throw new Error(`Invalid --variants value: ${variant}. Use native|wasm`)
    }
  }
  const outputs = csv('outputs', 'image/webp,image/avif,image/jpeg,image/png')
  for (const output of outputs) {
    if (!OUTPUT_EXTENSIONS[output]) {
      throw new Error(`Unsupported output type: ${output}`)
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return {
    variants,
    sharpVersion: args.get('sharp-version') ?? workspaceSharpVersion(),
    imagesDir: args.has('images')
      ? path.resolve(process.cwd(), args.get('images')!)
      : null,
    generated: boolean('generated', true),
    outputs,
    widths: csv('widths', '1920,640').map(Number),
    iterations: number('iterations', 5),
    warmup: number('warmup', 1),
    quality: number('quality', 75),
    concurrency: args.has('concurrency') ? number('concurrency', 1) : null,
    operationCache: boolean('operation-cache', false),
    timeoutInSeconds: number('timeout-seconds', 7),
    installDir: path.resolve(
      REPO_ROOT,
      args.get('install-dir') ?? 'bench/image-optimizer-sharp/.installs'
    ),
    artifactDir: path.resolve(
      REPO_ROOT,
      args.get('artifact-dir') ??
        `bench/image-optimizer-sharp/artifacts/${timestamp}`
    ),
  }
}

// The sharp resolved for packages/next, i.e. what `next start` loads in this
// checkout. It is not a dependency of the repository root.
const nextRequire = createRequire(
  path.join(REPO_ROOT, 'packages/next/package.json')
)

function workspaceSharpVersion(): string {
  const entry = nextRequire.resolve('sharp')
  const packageJson = path.join(path.dirname(entry), '..', 'package.json')
  return JSON.parse(fs.readFileSync(packageJson, 'utf8')).version
}

// Any sharp will do for generating sources and decoding outputs; the
// workspace install is always present. (`sharp` is not resolvable from the
// repository root, so borrow the type through `next`.)
const workspaceSharp: ReturnType<
  typeof import('next/image-optimizer-transform').getSharp
> = nextRequire('sharp')

// Reports which binding package a `require('sharp')` from `dir` ends up with.
const BINDING_PROBE = `
const sharp = require('sharp')
const pattern = /[\\\\/]@img[\\\\/](sharp-(?!libvips-)[^\\\\/]+)[\\\\/]/
const loaded = Object.keys(require.cache).find((file) => pattern.test(file))
console.log(JSON.stringify({
  binding: loaded ? loaded.match(pattern)[1] : null,
  version: sharp.versions.sharp,
}))
`

// sharp loads whichever binding `require()` can reach, and pnpm's `.bin`
// shims (so `pnpm bench:...`) export a NODE_PATH that includes the
// repository's hoisted `node_modules/.pnpm/node_modules`, where the native
// `@img/sharp-linux-x64` lives. With that inherited, a wasm-only install
// silently loads the native binding, so child processes get a clean env.
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.NODE_PATH
  return env
}

function probeInstall(dir: string): {
  binding: string | null
  version: string
} {
  const stdout = execFileSync(process.execPath, ['-e', BINDING_PROBE], {
    cwd: dir,
    encoding: 'utf8',
    env: childEnv(),
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return JSON.parse(stdout.trim().split('\n').pop()!)
}

function ensureInstall(
  variant: Variant,
  version: string,
  installDir: string
): string {
  const dir = path.join(installDir, `${variant}-${version}`)
  const expectedBinding =
    variant === 'wasm'
      ? (binding: string | null) => binding === 'sharp-wasm32'
      : (binding: string | null) => !!binding && binding !== 'sharp-wasm32'

  if (fs.existsSync(path.join(dir, 'node_modules/sharp/package.json'))) {
    try {
      const probe = probeInstall(dir)
      if (probe.version === version && expectedBinding(probe.binding)) {
        console.log(`[install] reusing ${variant} sharp@${version} in ${dir}`)
        return dir
      }
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true })
  }

  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: `sharp-${variant}-install`, private: true })
  )
  const packages = [`sharp@${version}`]
  const npmArgs = [
    'install',
    '--no-audit',
    '--no-fund',
    '--no-package-lock',
    '--loglevel=error',
  ]
  if (variant === 'wasm') {
    // `--cpu=wasm32` keeps npm from installing the native
    // `@img/sharp-<platform>` optional dependency, which sharp would otherwise
    // prefer at load time. This is the install command Next.js documents as
    // the fallback when the native binaries cannot be used.
    npmArgs.push('--cpu=wasm32')
    packages.push(`@img/sharp-wasm32@${version}`)
  }
  console.log(
    `[install] npm ${[...npmArgs, ...packages].join(' ')} (in ${dir})`
  )
  execFileSync('npm', [...npmArgs, ...packages], {
    cwd: dir,
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  const probe = probeInstall(dir)
  if (probe.version !== version || !expectedBinding(probe.binding)) {
    throw new Error(
      `Expected ${variant} sharp@${version} in ${dir} but \`require('sharp')\` loaded ${probe.binding}@${probe.version}`
    )
  }
  console.log(
    `[install] ${variant}: require('sharp') loads @img/${probe.binding}`
  )
  return dir
}

// Deterministic 12 megapixel "photo": smooth sky gradient, textured ground,
// hard-edged shapes and a little sensor-like grain. Noise keeps the PNG from
// compressing to nothing and keeps the JPEG in the multi-megabyte range.
function renderSyntheticPhoto(width: number, height: number): Buffer {
  const data = Buffer.allocUnsafe(width * height * 3)
  let seed = 0x9e3779b9
  const random = () => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const clamp = (value: number) => (value < 0 ? 0 : value > 255 ? 255 : value)
  let offset = 0
  for (let y = 0; y < height; y++) {
    const v = y / height
    for (let x = 0; x < width; x++) {
      const u = x / width
      const horizon =
        0.58 + 0.06 * Math.sin(u * 7.1) + 0.03 * Math.sin(u * 19.3 + 1.7)
      let r: number
      let g: number
      let b: number
      if (v < horizon) {
        // sky with a sun
        const t = v / horizon
        r = 90 + 110 * t
        g = 140 + 70 * t
        b = 230 - 40 * t
        const dx = u - 0.72
        const dy = (v - 0.22) * (height / width)
        if (dx * dx + dy * dy < 0.0036) {
          r = 255
          g = 245
          b = 200
        }
      } else {
        // ground with stripes of different texture
        const band = Math.floor((v - horizon) * 14 + u * 2)
        const texture = 18 * Math.sin(x * 0.21 + y * 0.13 + band)
        r = 70 + 20 * (band % 3) + texture
        g = 110 + 15 * (band % 4) + texture
        b = 50 + 10 * (band % 2) + texture * 0.5
      }
      // buildings: flat colour blocks with hard edges
      const block = Math.floor(u * 9)
      const blockTop = 0.5 + 0.17 * Math.abs(Math.sin(block * 2.3))
      if (v > blockTop && v < horizon + 0.03 && u * 9 - block < 0.8) {
        r = 40 + 25 * (block % 4)
        g = 45 + 20 * (block % 3)
        b = 60 + 30 * (block % 2)
      }
      const grain = (random() - 0.5) * 16
      data[offset++] = clamp(r + grain)
      data[offset++] = clamp(g + grain)
      data[offset++] = clamp(b + grain)
    }
  }
  return data
}

async function ensureGeneratedSources(dir: string): Promise<string[]> {
  fs.mkdirSync(dir, { recursive: true })
  const jpeg = path.join(dir, 'synthetic-photo-4000x3000.jpg')
  const png = path.join(dir, 'synthetic-photo-4000x3000.png')
  if (!fs.existsSync(jpeg) || !fs.existsSync(png)) {
    console.log('[sources] generating synthetic 4000x3000 photo (once)')
    const width = 4000
    const height = 3000
    const raw = renderSyntheticPhoto(width, height)
    const image = () =>
      workspaceSharp(raw, { raw: { width, height, channels: 3 } })
    await image().jpeg({ quality: 95, mozjpeg: false }).toFile(jpeg)
    await image().png({ compressionLevel: 6 }).toFile(png)
  }
  return [jpeg, png, SCREENSHOT_PNG]
}

async function describeSources(files: string[]): Promise<Source[]> {
  const sources: Source[] = []
  for (const file of files) {
    const contentType = INPUT_TYPES[path.extname(file).toLowerCase()]
    if (!contentType) continue
    const metadata = await workspaceSharp(file).metadata()
    sources.push({
      name: path.basename(file),
      path: file,
      contentType,
      bytes: fs.statSync(file).size,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    })
  }
  return sources
}

async function runVariant(
  variant: Variant,
  sharpDir: string,
  jobs: Job[],
  options: CliOptions
): Promise<WorkerResult> {
  const variantDir = path.join(options.artifactDir, variant)
  fs.mkdirSync(variantDir, { recursive: true })
  const configFile = path.join(variantDir, 'config.json')
  const resultFile = path.join(variantDir, 'result.json')
  fs.writeFileSync(
    configFile,
    JSON.stringify(
      {
        variant,
        sharpDir,
        repoRoot: REPO_ROOT,
        outputDir: variantDir,
        resultFile,
        jobs,
        iterations: options.iterations,
        warmup: options.warmup,
        quality: options.quality,
        concurrency: options.concurrency,
        operationCache: options.operationCache,
        timeoutInSeconds: options.timeoutInSeconds,
        // Defaults of experimental.imgOptMaxInputPixels / imgOptSequentialRead
        // / imgOptMozjpeg.
        limitInputPixels: 268402689,
        sequentialRead: null,
        mozjpeg: true,
      },
      null,
      2
    )
  )

  console.log(`\n[run] ${variant} (${jobs.length} combinations)`)
  const child = spawn(process.execPath, [WORKER, configFile], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...childEnv(), NODE_ENV: 'production' },
  })
  const [code] = (await once(child, 'exit')) as [number | null]
  if (code !== 0) {
    throw new Error(`${variant} worker exited with code ${code}`)
  }
  return JSON.parse(fs.readFileSync(resultFile, 'utf8'))
}

function stats(values: number[]): Stats | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  const p95 =
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
  const variance =
    sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length
  return {
    n: sorted.length,
    min: sorted[0],
    median,
    mean,
    p95,
    max: sorted[sorted.length - 1],
    stddev: Math.sqrt(variance),
  }
}

async function pixelDiff(fileA: string, fileB: string): Promise<PixelDiff> {
  const decode = (file: string) =>
    workspaceSharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  const [a, b] = await Promise.all([decode(fileA), decode(fileB)])
  if (
    a.info.width !== b.info.width ||
    a.info.height !== b.info.height ||
    a.data.length !== b.data.length
  ) {
    return {
      samples: 0,
      differing: 0,
      maxAbsDiff: 0,
      meanAbsDiff: 0,
      psnrDb: null,
      error: `decoded dimensions differ: ${a.info.width}×${a.info.height} vs ${b.info.width}×${b.info.height}`,
    }
  }
  let differing = 0
  let maxAbsDiff = 0
  let sumAbsDiff = 0
  let sumSquares = 0
  for (let i = 0; i < a.data.length; i++) {
    const diff = Math.abs(a.data[i] - b.data[i])
    if (diff !== 0) {
      differing++
      sumAbsDiff += diff
      sumSquares += diff * diff
      if (diff > maxAbsDiff) maxAbsDiff = diff
    }
  }
  const mse = sumSquares / a.data.length
  return {
    samples: a.data.length,
    differing,
    maxAbsDiff,
    meanAbsDiff: sumAbsDiff / a.data.length,
    psnrDb: mse === 0 ? null : 10 * Math.log10((255 * 255) / mse),
  }
}

async function compare(
  jobs: Job[],
  runs: Map<Variant, WorkerResult>
): Promise<Comparison[]> {
  const comparisons: Comparison[] = []
  for (const job of jobs) {
    const perVariant: Comparison['perVariant'] = {}
    for (const [variant, run] of runs) {
      const result = run.results.find((entry) => entry.id === job.id)!
      perVariant[variant] = {
        stats: stats(result.durationsMs),
        errors: result.errors,
        outputBytes: result.outputBytes,
        outputSha256: result.outputSha256,
      }
    }
    const native = runs
      .get('native')
      ?.results.find((entry) => entry.id === job.id)
    const wasm = runs.get('wasm')?.results.find((entry) => entry.id === job.id)
    let wasmOverNative: number | null = null
    let identicalBytes: boolean | null = null
    let diff: PixelDiff | null = null
    if (native && wasm) {
      const nativeStats = perVariant.native.stats
      const wasmStats = perVariant.wasm.stats
      if (
        nativeStats &&
        wasmStats &&
        native.errors.length === 0 &&
        wasm.errors.length === 0
      ) {
        wasmOverNative = wasmStats.median / nativeStats.median
      }
      if (native.outputFile && wasm.outputFile) {
        identicalBytes = native.outputSha256 === wasm.outputSha256
        if (!identicalBytes) {
          diff = await pixelDiff(native.outputFile, wasm.outputFile)
        }
      }
    }
    comparisons.push({
      job,
      perVariant,
      wasmOverNative,
      identicalBytes,
      pixelDiff: diff,
    })
  }
  return comparisons
}

function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value >= 1000
    ? `${(value / 1000).toFixed(2)} s`
    : `${value.toFixed(1)} ms`
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function parityCell(comparison: Comparison): string {
  const wasmErrors = comparison.perVariant.wasm?.errors ?? []
  const nativeErrors = comparison.perVariant.native?.errors ?? []
  if (wasmErrors.length > 0 || nativeErrors.length > 0) {
    const failures = []
    if (nativeErrors.length)
      failures.push(`native: ${nativeErrors[nativeErrors.length - 1]}`)
    if (wasmErrors.length)
      failures.push(`wasm: ${wasmErrors[wasmErrors.length - 1]}`)
    return `❌ ${failures.join('; ')}`
  }
  if (comparison.identicalBytes === null) return '—'
  if (comparison.identicalBytes) return 'identical bytes'
  const diff = comparison.pixelDiff!
  if (diff.error) return `❌ ${diff.error}`
  if (diff.differing === 0) return 'identical pixels (different bytes)'
  const percent = ((diff.differing / diff.samples) * 100).toPrecision(2)
  return `pixels differ: max Δ${diff.maxAbsDiff} on ${diff.differing} of ${diff.samples} samples (${percent}%), PSNR ${diff.psnrDb!.toFixed(1)} dB`
}

function geometricMean(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length
  )
}

function renderMarkdown(
  options: CliOptions,
  sources: Source[],
  runs: Map<Variant, WorkerResult>,
  comparisons: Comparison[]
): string {
  const lines: string[] = []
  const cpu = os.cpus()
  lines.push('# Image optimizer: native sharp vs WebAssembly sharp', '')
  lines.push('## Environment', '')
  lines.push(
    `- Node.js ${process.version}, ${process.platform}-${process.arch} (${os.release()})`
  )
  lines.push(
    `- CPU: ${cpu[0]?.model ?? 'unknown'} × ${cpu.length}, ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GiB RAM`
  )
  lines.push(`- sharp ${options.sharpVersion}`)
  for (const [variant, run] of runs) {
    const v = run.environment.versions
    lines.push(
      `- ${variant}: \`@img/${run.environment.bindingPackage}\` — libvips ${v.vips}, aom ${v.aom}, libheif ${v.heif}, libwebp ${v.webp}, mozjpeg ${v.mozjpeg}, libpng ${v.png}, highway ${v.highway}${v.emscripten ? `, emscripten ${v.emscripten}` : ''}; sharp.concurrency() = ${run.environment.concurrency}`
    )
  }
  lines.push(
    `- optimizeImage() options: quality ${options.quality}, concurrency ${options.concurrency ?? 'Next.js default'}, operation cache ${options.operationCache}, timeout ${options.timeoutInSeconds}s, limitInputPixels 268402689, mozjpeg true`
  )
  lines.push(
    `- ${options.iterations} timed iterations after ${options.warmup} warmup run(s) per combination; each variant runs in its own process, variants run sequentially`
  )
  lines.push('')

  lines.push('## Sources', '')
  lines.push(
    '| Source | Type | Dimensions | Size |',
    '| --- | --- | --- | --- |'
  )
  for (const source of sources) {
    lines.push(
      `| ${source.name} | ${source.contentType} | ${source.width}×${source.height} | ${formatBytes(source.bytes)} |`
    )
  }
  lines.push('')

  lines.push('## Startup', '')
  lines.push(
    "Time to `require('sharp')` and configure it (for wasm32 this includes compiling and instantiating the WebAssembly module), and peak RSS of the worker process over the whole run.",
    ''
  )
  lines.push('| Variant | Load | Peak RSS |', '| --- | --- | --- |')
  for (const [variant, run] of runs) {
    lines.push(
      `| ${variant} | ${formatMs(run.environment.loadMs)} | ${formatBytes(run.maxRssBytes)} |`
    )
  }
  lines.push('')

  lines.push('## Results', '')
  lines.push(
    'Median wall time of `optimizeImage()` per combination. "wasm / native" is the ratio of medians. Parity compares the two outputs: byte-identical, or decoded-pixel-identical, or the pixel difference.',
    ''
  )
  lines.push(
    '| Source → output @ width | native median (min–p95) | wasm median (min–p95) | wasm / native | native bytes | wasm bytes | parity |'
  )
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const comparison of comparisons) {
    const { job } = comparison
    const native = comparison.perVariant.native
    const wasm = comparison.perVariant.wasm
    const cell = (entry?: Comparison['perVariant'][string]) =>
      entry?.stats && entry.errors.length === 0
        ? `${formatMs(entry.stats.median)} (${formatMs(entry.stats.min)}–${formatMs(entry.stats.p95)})`
        : entry?.errors.length
          ? `failed ×${entry.errors.length}`
          : '—'
    lines.push(
      `| ${job.source} → ${job.outputExt} @ ${job.width} | ${cell(native)} | ${cell(wasm)} | ${comparison.wasmOverNative ? `${comparison.wasmOverNative.toFixed(2)}×` : '—'} | ${formatBytes(native?.outputBytes ?? null)} | ${formatBytes(wasm?.outputBytes ?? null)} | ${parityCell(comparison)} |`
    )
  }
  lines.push('')

  if (runs.has('native') && runs.has('wasm')) {
    lines.push('## Summary', '')
    lines.push(
      '| Output | combinations | geometric mean wasm / native | byte-identical | pixel-identical | pixel differences | failures |'
    )
    lines.push('| --- | --- | --- | --- | --- | --- | --- |')
    const byOutput = new Map<string, Comparison[]>()
    for (const comparison of comparisons) {
      const list = byOutput.get(comparison.job.outputExt) ?? []
      list.push(comparison)
      byOutput.set(comparison.job.outputExt, list)
    }
    const summaryRow = (label: string, list: Comparison[]) => {
      const ratios = list
        .map((c) => c.wasmOverNative)
        .filter((r): r is number => r !== null)
      const identical = list.filter((c) => c.identicalBytes === true).length
      const pixelIdentical = list.filter(
        (c) =>
          c.identicalBytes === false &&
          c.pixelDiff?.differing === 0 &&
          !c.pixelDiff.error
      ).length
      const differ = list.filter(
        (c) => c.pixelDiff && (c.pixelDiff.differing > 0 || c.pixelDiff.error)
      ).length
      const failures = list.filter((c) =>
        Object.values(c.perVariant).some((v) => v.errors.length > 0)
      ).length
      const mean = geometricMean(ratios)
      return `| ${label} | ${list.length} | ${mean ? `${mean.toFixed(2)}×` : '—'} | ${identical} | ${pixelIdentical} | ${differ} | ${failures} |`
    }
    for (const [outputExt, list] of byOutput) {
      lines.push(summaryRow(outputExt, list))
    }
    lines.push(summaryRow('**all**', comparisons))
    lines.push('')
  }
  return lines.join('\n')
}

// Everything renderMarkdown() needs, which is also what results.json holds.
type RunData = {
  options: CliOptions
  sources: Source[]
  runs: Map<Variant, WorkerResult>
  comparisons: Comparison[]
}

function renderFromJson(file: string) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const runs = new Map<Variant, WorkerResult>(
    Object.entries(data.runs) as [Variant, WorkerResult][]
  )
  const markdown = renderMarkdown(
    data.options,
    data.sources,
    runs,
    data.comparisons
  )
  const target = path.join(path.dirname(file), 'results.md')
  fs.writeFileSync(target, markdown)
  console.log(markdown)
  console.log(`[bench] re-rendered ${target}`)
}

async function main() {
  const renderOnly = process.argv
    .slice(2)
    .find((arg) => arg.startsWith('--render='))
  if (renderOnly) {
    renderFromJson(
      path.resolve(process.cwd(), renderOnly.slice('--render='.length))
    )
    return
  }

  const options = parseCli()
  fs.mkdirSync(options.artifactDir, { recursive: true })
  console.log(
    `[bench] sharp ${options.sharpVersion}, artifacts in ${options.artifactDir}`
  )

  const installs = new Map<Variant, string>()
  for (const variant of options.variants) {
    installs.set(
      variant,
      ensureInstall(variant, options.sharpVersion, options.installDir)
    )
  }

  const files: string[] = []
  if (options.generated) {
    files.push(
      ...(await ensureGeneratedSources(path.join(BENCH_DIR, '.images')))
    )
  }
  if (options.imagesDir) {
    for (const entry of fs.readdirSync(options.imagesDir).sort()) {
      files.push(path.join(options.imagesDir, entry))
    }
  }
  const sources = await describeSources(files)
  if (sources.length === 0) {
    throw new Error('No source images. Pass --images=<dir> or --generated=true')
  }
  console.log('[sources]')
  for (const source of sources) {
    console.log(
      `  ${source.name}: ${source.contentType} ${source.width}x${source.height} ${formatBytes(source.bytes)}`
    )
  }

  const jobs: Job[] = []
  for (const source of sources) {
    for (const outputType of options.outputs) {
      for (const width of options.widths) {
        const outputExt = OUTPUT_EXTENSIONS[outputType]
        jobs.push({
          id: `${source.name.replace(/[^a-zA-Z0-9_-]/g, '_')}__${outputExt}__w${width}`,
          source: source.name,
          imagePath: source.path,
          outputType,
          outputExt,
          width,
        })
      }
    }
  }

  const runs = new Map<Variant, WorkerResult>()
  for (const variant of options.variants) {
    runs.set(
      variant,
      await runVariant(variant, installs.get(variant)!, jobs, options)
    )
  }

  const comparisons = await compare(jobs, runs)
  const markdown = renderMarkdown(options, sources, runs, comparisons)
  fs.writeFileSync(path.join(options.artifactDir, 'results.md'), markdown)
  const data: RunData & { environment: Record<string, unknown> } = {
    options,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      cpu: os.cpus()[0]?.model,
      cores: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    sources,
    runs,
    comparisons,
  }
  fs.writeFileSync(
    path.join(options.artifactDir, 'results.json'),
    JSON.stringify({ ...data, runs: Object.fromEntries(runs) }, null, 2)
  )
  console.log(`\n${markdown}`)
  console.log(
    `[bench] wrote ${path.join(options.artifactDir, 'results.md')} and results.json`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
