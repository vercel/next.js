// This script must be run with tsx

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Readable } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { teeNodeReadable } from '../../packages/next/src/server/app-render/node-stream-tee'
import {
  createInlinedDataNodeStream,
  createInlinedDataReadableStream,
} from '../../packages/next/src/server/app-render/use-flight-response'
import {
  chainNodeTransforms,
  continueDynamicHTMLResumeNode,
  continueDynamicPrerenderNode,
  continueStaticPrerenderNode,
  createBufferedTransformNode,
} from '../../packages/next/src/server/stream-utils/node-stream-helpers'
import {
  continueDynamicHTMLResume,
  continueDynamicPrerender,
  continueStaticPrerender,
} from '../../packages/next/src/server/stream-utils/node-web-streams-helper'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const NEXT_BIN = resolve(REPO_ROOT, 'packages/next/dist/bin/next')
const MINIMAL_SERVER = resolve(
  REPO_ROOT,
  'bench/next-minimal-server/bin/minimal-server.js'
)

type Scenario = 'full' | 'micro' | 'all'
type StreamMode = 'web' | 'node' | 'both'

type CliOptions = {
  scenario: Scenario
  jsonOut?: string

  appDir: string
  routes: string[]
  streamMode: StreamMode
  buildFull: boolean
  warmupRequests: number
  serialRequests: number
  loadRequests: number
  loadConcurrency: number
  timeoutMs: number
  port: number

  captureCpu: boolean
  captureHeap: boolean
  captureTrace: boolean
  captureNextTrace: boolean
  traceCategories: string
  artifactDir: string

  iterations: number
  warmup: number
  htmlChunks: number
  htmlChunkBytes: number
  flightChunks: number
  flightChunkBytes: number
  binaryFlight: boolean
}

type BenchStats = {
  min: number
  median: number
  mean: number
  p95: number
  max: number
}

type BenchResult = {
  name: string
  group: 'unit' | 'integration'
  stats: BenchStats
}

type BenchCase = {
  name: string
  group: 'unit' | 'integration'
  run: () => Promise<number>
}

type FullRoutePhaseResult = {
  mode: 'web' | 'node'
  route: string
  phase: 'single-client' | 'under-load'
  requests: number
  concurrency: number
  throughputRps: number
  latency: BenchStats
}

type FullRunResult = {
  mode: 'web' | 'node'
  routeResults: FullRoutePhaseResult[]
}

function parseBoolean(value: string): boolean {
  return value === '1' || value === 'true' || value === 'yes'
}

function parseNumberArg(
  args: Map<string, string>,
  key: string,
  fallback: number
): number {
  const value = args.get(key)
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for --${key}: ${value}`)
  }
  return parsed
}

function parseRoutes(rawRoutes: string | undefined): string[] {
  if (!rawRoutes) {
    return [
      '/',
      '/streaming/light',
      '/streaming/medium',
      '/streaming/heavy',
      '/streaming/chunkstorm',
      '/streaming/wide',
      '/streaming/bulk',
    ]
  }

  const routes = rawRoutes
    .split(',')
    .map((route) => route.trim())
    .filter(Boolean)

  if (routes.length === 0) {
    throw new Error('--routes cannot be empty')
  }

  for (const route of routes) {
    if (!route.startsWith('/')) {
      throw new Error(`Each route must start with '/': ${route}`)
    }
  }

  return routes
}

function usage() {
  console.log(`Usage: pnpm bench:render-pipeline [options]

Defaults to FULL end-to-end app-render benchmark.

Options:
  --scenario=full|micro|all                     (default: full)
  --json-out=<path>

Full benchmark options:
  --app-dir=<path>                              (default: bench/basic-app)
  --routes=/,/streaming/light,...               (default: built-in stress suite)
  --stream-mode=web|node|both                   (default: both)
  --build-full=true|false                       (default: true)
                                                 When stream-mode=both, build-full is forced to true.
  --warmup-requests=<number>                    (default: 30)
  --serial-requests=<number>                    (default: 120)
  --load-requests=<number>                      (default: 1200)
  --load-concurrency=<number>                   (default: 80)
  --port=<number>                               (default: 3199)
  --timeout-ms=<number>                         (default: 30000)

Profiling and trace options:
  --capture-cpu=true|false                      (default: true for scenario=full|all, false for scenario=micro)
  --capture-heap=true|false                     (default: false)
  --capture-trace=true|false                    (default: false)
  --capture-next-trace=true|false               (default: true)
  --trace-categories=<csv>                      (default: node,node.async_hooks,v8)
  --artifact-dir=<path>                         (default: bench/render-pipeline/artifacts/<timestamp>)

Micro benchmark options:
  --iterations=<number>                         (default: 10)
  --warmup=<number>                             (default: 2)
  --html-chunks=<number>                        (default: 64)
  --html-chunk-bytes=<number>                   (default: 16384)
  --flight-chunks=<number>                      (default: 64)
  --flight-chunk-bytes=<number>                 (default: 4096)
  --binary-flight=true|false                    (default: true)
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
    const [rawKey, rawValue] = rawArg.slice(2).split('=')
    args.set(rawKey, rawValue ?? 'true')
  }

  const scenarioRaw = args.get('scenario') ?? 'full'
  if (
    scenarioRaw !== 'full' &&
    scenarioRaw !== 'micro' &&
    scenarioRaw !== 'all'
  ) {
    throw new Error(
      `Invalid --scenario value: ${scenarioRaw}. Use full|micro|all`
    )
  }

  const streamModeRaw = args.get('stream-mode') ?? 'both'
  if (
    streamModeRaw !== 'web' &&
    streamModeRaw !== 'node' &&
    streamModeRaw !== 'both'
  ) {
    throw new Error(
      `Invalid --stream-mode value: ${streamModeRaw}. Use web|node|both`
    )
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const artifactDir = resolve(
    REPO_ROOT,
    args.get('artifact-dir') ?? `bench/render-pipeline/artifacts/${timestamp}`
  )

  const htmlChunkBytes = parseNumberArg(args, 'html-chunk-bytes', 16 * 1024)
  const flightChunkBytes = parseNumberArg(args, 'flight-chunk-bytes', 4 * 1024)
  const iterations = parseNumberArg(args, 'iterations', 10)
  const warmup = parseNumberArg(args, 'warmup', 2)

  if (htmlChunkBytes < 64) throw new Error('--html-chunk-bytes must be >= 64')
  if (flightChunkBytes < 64)
    throw new Error('--flight-chunk-bytes must be >= 64')
  if (iterations < 1) throw new Error('--iterations must be >= 1')
  if (warmup < 0) throw new Error('--warmup must be >= 0')

  const routes = parseRoutes(args.get('routes'))
  const buildFull = parseBoolean(args.get('build-full') ?? 'true')
  const defaultCaptureCpu =
    scenarioRaw === 'full' || scenarioRaw === 'all' ? 'true' : 'false'
  const shouldForceBuildFull =
    (scenarioRaw === 'full' || scenarioRaw === 'all') &&
    streamModeRaw === 'both' &&
    !buildFull

  if (shouldForceBuildFull) {
    console.warn(
      '[bench/render-pipeline] forcing --build-full=true for stream-mode=both to avoid comparing stale build output.'
    )
  }

  return {
    scenario: scenarioRaw,
    jsonOut: args.get('json-out'),

    appDir: resolve(REPO_ROOT, args.get('app-dir') ?? 'bench/basic-app'),
    routes,
    streamMode: streamModeRaw,
    buildFull: buildFull || shouldForceBuildFull,
    warmupRequests: parseNumberArg(args, 'warmup-requests', 30),
    serialRequests: parseNumberArg(args, 'serial-requests', 120),
    loadRequests: parseNumberArg(args, 'load-requests', 1200),
    loadConcurrency: parseNumberArg(args, 'load-concurrency', 80),
    timeoutMs: parseNumberArg(args, 'timeout-ms', 30_000),
    port: parseNumberArg(args, 'port', 3199),

    captureCpu: parseBoolean(args.get('capture-cpu') ?? defaultCaptureCpu),
    captureHeap: parseBoolean(args.get('capture-heap') ?? 'false'),
    captureTrace: parseBoolean(args.get('capture-trace') ?? 'false'),
    captureNextTrace: parseBoolean(args.get('capture-next-trace') ?? 'true'),
    traceCategories: args.get('trace-categories') ?? 'node,node.async_hooks,v8',
    artifactDir,

    iterations,
    warmup,
    htmlChunks: parseNumberArg(args, 'html-chunks', 64),
    htmlChunkBytes,
    flightChunks: parseNumberArg(args, 'flight-chunks', 64),
    flightChunkBytes,
    binaryFlight: parseBoolean(args.get('binary-flight') ?? 'true'),
  }
}

function fixedSizeChunkWithPrefix(prefix: Buffer, size: number, fill: number) {
  if (prefix.byteLength >= size) {
    return prefix.subarray(0, size)
  }
  return Buffer.concat([prefix, Buffer.alloc(size - prefix.byteLength, fill)])
}

function fixedSizeChunkWithSuffix(suffix: Buffer, size: number, fill: number) {
  if (suffix.byteLength >= size) {
    return suffix.subarray(suffix.byteLength - size)
  }
  return Buffer.concat([Buffer.alloc(size - suffix.byteLength, fill), suffix])
}

function makeHtmlChunks(chunkCount: number, chunkBytes: number): Buffer[] {
  const chunks: Buffer[] = []
  const prefix = Buffer.from('<!DOCTYPE html><html><head></head><body>')
  const suffix = Buffer.from('</body></html>')

  if (chunkCount < 2) {
    throw new Error('--html-chunks must be >= 2')
  }

  chunks.push(fixedSizeChunkWithPrefix(prefix, chunkBytes, 97))

  for (let i = 1; i < chunkCount - 1; i++) {
    chunks.push(Buffer.alloc(chunkBytes, 97 + (i % 26)))
  }

  chunks.push(fixedSizeChunkWithSuffix(suffix, chunkBytes, 122))
  return chunks
}

function makeFlightChunks(
  chunkCount: number,
  chunkBytes: number,
  binary: boolean
): Buffer[] {
  const chunks: Buffer[] = []
  for (let i = 0; i < chunkCount; i++) {
    const chunk = Buffer.alloc(chunkBytes)
    if (binary) {
      for (let j = 0; j < chunkBytes; j++) {
        chunk[j] = (i * 17 + j * 31) % 256
      }
    } else {
      chunk.fill(97 + (i % 26))
    }
    chunks.push(chunk)
  }
  return chunks
}

function createWebStream(
  chunks: readonly Uint8Array[]
): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(chunks[index++])
    },
  })
}

async function consumeNodeReadable(stream: Readable): Promise<number> {
  let totalBytes = 0
  for await (const chunk of stream) {
    if (typeof chunk === 'string') {
      totalBytes += Buffer.byteLength(chunk)
    } else {
      totalBytes += (chunk as Uint8Array).byteLength
    }
  }
  return totalBytes
}

async function consumeWebReadable(
  stream: ReadableStream<Uint8Array>
): Promise<number> {
  let totalBytes = 0
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
  }
  return totalBytes
}

function computeStats(samples: number[]): BenchStats {
  const sorted = [...samples].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const median = sorted[Math.floor(sorted.length / 2)]
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]
  return { min, median, mean, p95, max }
}

async function runBenchCase(
  bench: BenchCase,
  iterations: number,
  warmup: number
): Promise<BenchResult> {
  for (let i = 0; i < warmup; i++) {
    await bench.run()
  }

  const samples: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await bench.run()
    samples.push(performance.now() - start)
  }

  return {
    name: bench.name,
    group: bench.group,
    stats: computeStats(samples),
  }
}

function printMicroResults(results: BenchResult[]) {
  const groups: Array<'unit' | 'integration'> = ['unit', 'integration']
  for (const group of groups) {
    const groupResults = results.filter((result) => result.group === group)
    if (groupResults.length === 0) continue
    console.log(`\n${group.toUpperCase()} BENCHMARKS`)
    console.log(
      'name'.padEnd(42),
      'median'.padStart(10),
      'p95'.padStart(10),
      'mean'.padStart(10),
      'min'.padStart(10),
      'max'.padStart(10)
    )
    for (const result of groupResults) {
      const { stats } = result
      console.log(
        result.name.padEnd(42),
        `${stats.median.toFixed(2)}ms`.padStart(10),
        `${stats.p95.toFixed(2)}ms`.padStart(10),
        `${stats.mean.toFixed(2)}ms`.padStart(10),
        `${stats.min.toFixed(2)}ms`.padStart(10),
        `${stats.max.toFixed(2)}ms`.padStart(10)
      )
    }
  }
}

function buildMicroBenchCases(
  htmlChunks: Buffer[],
  flightChunks: Buffer[],
  secondaryFlightChunks: Buffer[],
  secondaryFlightLabel: string
): BenchCase[] {
  const webHtmlChunks = htmlChunks.map(
    (chunk) => new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  )
  const webFlightChunks = flightChunks.map(
    (chunk) => new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  )
  const webSecondaryFlightChunks = secondaryFlightChunks.map(
    (chunk) => new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  )

  return [
    {
      name: 'teeNodeReadable (drain both branches)',
      group: 'unit',
      run: async () => {
        const source = Readable.from(htmlChunks)
        const [left, right] = teeNodeReadable(source)
        const [leftBytes, rightBytes] = await Promise.all([
          consumeNodeReadable(left as Readable),
          consumeNodeReadable(right as Readable),
        ])
        return leftBytes + rightBytes
      },
    },
    {
      name: 'createBufferedTransformNode only',
      group: 'unit',
      run: async () => {
        const source = Readable.from(htmlChunks)
        const transformed = chainNodeTransforms(source, [
          createBufferedTransformNode(),
        ])
        return consumeNodeReadable(transformed)
      },
    },
    {
      name: 'createInlinedDataNodeStream only',
      group: 'unit',
      run: async () => {
        const source = Readable.from(flightChunks)
        const transformed = chainNodeTransforms(source, [
          createInlinedDataNodeStream(undefined, null),
        ])
        return consumeNodeReadable(transformed)
      },
    },
    {
      name: `createInlinedDataNodeStream only (${secondaryFlightLabel})`,
      group: 'unit',
      run: async () => {
        const source = Readable.from(secondaryFlightChunks)
        const transformed = chainNodeTransforms(source, [
          createInlinedDataNodeStream(undefined, null),
        ])
        return consumeNodeReadable(transformed)
      },
    },
    {
      name: 'Node continueStaticPrerender',
      group: 'integration',
      run: async () => {
        const renderStream = Readable.from(htmlChunks)
        const inlinedDataStream = chainNodeTransforms(
          Readable.from(flightChunks),
          [createInlinedDataNodeStream(undefined, null)]
        )
        const stream = await continueStaticPrerenderNode(renderStream, {
          inlinedDataStream,
          getServerInsertedHTML: async () => '',
          getServerInsertedMetadata: async () => '',
          deploymentId: undefined,
        })
        return consumeNodeReadable(stream)
      },
    },
    {
      name: 'Node continueDynamicPrerender',
      group: 'integration',
      run: async () => {
        const renderStream = Readable.from(htmlChunks)
        const stream = await continueDynamicPrerenderNode(renderStream, {
          getServerInsertedHTML: async () => '',
          getServerInsertedMetadata: async () => '',
          deploymentId: undefined,
        })
        return consumeNodeReadable(stream)
      },
    },
    {
      name: 'Node continueDynamicHTMLResume',
      group: 'integration',
      run: async () => {
        const renderStream = Readable.from(htmlChunks)
        const inlinedDataStream = chainNodeTransforms(
          Readable.from(flightChunks),
          [createInlinedDataNodeStream(undefined, null)]
        )
        const stream = await continueDynamicHTMLResumeNode(renderStream, {
          inlinedDataStream,
          delayDataUntilFirstHtmlChunk: false,
          getServerInsertedHTML: async () => '',
          getServerInsertedMetadata: async () => '',
          deploymentId: undefined,
        })
        return consumeNodeReadable(stream)
      },
    },
    {
      name: `Node continueDynamicHTMLResume (${secondaryFlightLabel})`,
      group: 'integration',
      run: async () => {
        const renderStream = Readable.from(htmlChunks)
        const inlinedDataStream = chainNodeTransforms(
          Readable.from(secondaryFlightChunks),
          [createInlinedDataNodeStream(undefined, null)]
        )
        const stream = await continueDynamicHTMLResumeNode(renderStream, {
          inlinedDataStream,
          delayDataUntilFirstHtmlChunk: false,
          getServerInsertedHTML: async () => '',
          getServerInsertedMetadata: async () => '',
          deploymentId: undefined,
        })
        return consumeNodeReadable(stream)
      },
    },
    {
      name: 'Web continueStaticPrerender',
      group: 'integration',
      run: async () => {
        const renderStream = createWebStream(webHtmlChunks)
        const inlinedDataStream = createInlinedDataReadableStream(
          createWebStream(webFlightChunks),
          undefined,
          null
        )
        const stream = await continueStaticPrerender(renderStream, {
          inlinedDataStream,
          getServerInsertedHTML: async () => '',
          getServerInsertedMetadata: async () => '',
          deploymentId: undefined,
        })
        return consumeWebReadable(stream)
      },
    },
    {
      name: 'Web continueDynamicPrerender',
      group: 'integration',
      run: async () => {
        const renderStream = createWebStream(webHtmlChunks)
        const stream = await continueDynamicPrerender(renderStream, {
          getServerInsertedHTML: async () => '',
          getServerInsertedMetadata: async () => '',
          deploymentId: undefined,
        })
        return consumeWebReadable(stream)
      },
    },
    {
      name: 'Web continueDynamicHTMLResume',
      group: 'integration',
      run: async () => {
        const renderStream = createWebStream(webHtmlChunks)
        const inlinedDataStream = createInlinedDataReadableStream(
          createWebStream(webFlightChunks),
          undefined,
          null
        )
        const stream = await continueDynamicHTMLResume(renderStream, {
          inlinedDataStream,
          delayDataUntilFirstHtmlChunk: false,
          getServerInsertedHTML: async () => '',
          getServerInsertedMetadata: async () => '',
          deploymentId: undefined,
        })
        return consumeWebReadable(stream)
      },
    },
    {
      name: `Web continueDynamicHTMLResume (${secondaryFlightLabel})`,
      group: 'integration',
      run: async () => {
        const renderStream = createWebStream(webHtmlChunks)
        const inlinedDataStream = createInlinedDataReadableStream(
          createWebStream(webSecondaryFlightChunks),
          undefined,
          null
        )
        const stream = await continueDynamicHTMLResume(renderStream, {
          inlinedDataStream,
          delayDataUntilFirstHtmlChunk: false,
          getServerInsertedHTML: async () => '',
          getServerInsertedMetadata: async () => '',
          deploymentId: undefined,
        })
        return consumeWebReadable(stream)
      },
    },
  ]
}

async function runMicroBenchmarks(options: CliOptions): Promise<BenchResult[]> {
  const prevRuntime = process.env.NEXT_RUNTIME
  const prevUseNodeStreams = process.env.__NEXT_USE_NODE_STREAMS
  process.env.NEXT_RUNTIME = 'nodejs'
  process.env.__NEXT_USE_NODE_STREAMS = 'true'

  try {
    const htmlChunks = makeHtmlChunks(
      options.htmlChunks,
      options.htmlChunkBytes
    )
    const flightChunks = makeFlightChunks(
      options.flightChunks,
      options.flightChunkBytes,
      options.binaryFlight
    )
    const secondaryFlightChunks = makeFlightChunks(
      options.flightChunks,
      options.flightChunkBytes,
      !options.binaryFlight
    )
    const secondaryFlightLabel = options.binaryFlight
      ? 'utf8 flight'
      : 'binary flight'

    const cases = buildMicroBenchCases(
      htmlChunks,
      flightChunks,
      secondaryFlightChunks,
      secondaryFlightLabel
    )
    const results: BenchResult[] = []
    for (const benchCase of cases) {
      const result = await runBenchCase(
        benchCase,
        options.iterations,
        options.warmup
      )
      results.push(result)
    }
    return results
  } finally {
    if (prevRuntime === undefined) {
      delete process.env.NEXT_RUNTIME
    } else {
      process.env.NEXT_RUNTIME = prevRuntime
    }

    if (prevUseNodeStreams === undefined) {
      delete process.env.__NEXT_USE_NODE_STREAMS
    } else {
      process.env.__NEXT_USE_NODE_STREAMS = prevUseNodeStreams
    }
  }
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  })
  const [code] = (await once(child, 'exit')) as [number | null]
  if (code !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(' ')} (exit ${code})`
    )
  }
}

async function ensureNextBuilt() {
  try {
    await access(NEXT_BIN)
  } catch {
    throw new Error(
      `Missing ${NEXT_BIN}. Build Next.js first (pnpm --filter=next build).`
    )
  }
}

function configForMode(mode: 'web' | 'node'): string {
  if (mode === 'web') {
    return 'module.exports = {}\n'
  }
  return `module.exports = {
  experimental: {
    useNodeStreams: true,
  },
}\n`
}

async function waitForServerReady(
  url: string,
  timeoutMs: number
): Promise<void> {
  const start = performance.now()
  while (performance.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      await response.arrayBuffer()
      if (response.ok) return
    } catch {
      // server not ready yet
    }
    await sleep(200)
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`)
}

async function requestLatencyMs(
  url: string,
  timeoutMs: number
): Promise<number> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const start = performance.now()
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    })
    await response.arrayBuffer()
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`)
    }
    return performance.now() - start
  } finally {
    clearTimeout(timeout)
  }
}

async function runSerialRequests(
  url: string,
  count: number,
  timeoutMs: number
): Promise<number[]> {
  const latencies: number[] = []
  for (let i = 0; i < count; i++) {
    latencies.push(await requestLatencyMs(url, timeoutMs))
  }
  return latencies
}

async function runConcurrentRequests(
  url: string,
  totalRequests: number,
  concurrency: number,
  timeoutMs: number
): Promise<number[]> {
  const latencies = new Array<number>(totalRequests)
  let index = 0

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const current = index
      index++
      if (current >= totalRequests) return
      latencies[current] = await requestLatencyMs(url, timeoutMs)
    }
  })

  await Promise.all(workers)
  return latencies
}

async function copyIfExists(fromPath: string, toPath: string) {
  try {
    await access(fromPath)
    await copyFile(fromPath, toPath)
  } catch {
    // Ignore missing optional traces.
  }
}

function printFullResults(results: FullRunResult[]) {
  console.log('\nFULL APP-RENDER BENCHMARKS (end-to-end request path)')

  for (const result of results) {
    console.log(`\nMode: ${result.mode}`)

    for (const route of new Set(
      result.routeResults.map((entry) => entry.route)
    )) {
      console.log(`  Route: ${route}`)
      const routeEntries = result.routeResults.filter(
        (entry) => entry.route === route
      )
      for (const entry of routeEntries) {
        console.log(
          `    ${entry.phase} requests=${entry.requests} concurrency=${entry.concurrency}`
        )
        console.log(
          `      throughput=${entry.throughputRps.toFixed(2)} req/s median=${entry.latency.median.toFixed(2)}ms p95=${entry.latency.p95.toFixed(2)}ms`
        )
      }
    }
  }

  if (results.length === 2) {
    const web = results.find((result) => result.mode === 'web')
    const node = results.find((result) => result.mode === 'node')
    if (web && node) {
      console.log('\nComparison (node vs web)')

      const joinKeys = new Set(
        web.routeResults.map((entry) => `${entry.route}|${entry.phase}`)
      )

      for (const key of joinKeys) {
        const [route, phase] = key.split('|') as [
          string,
          'single-client' | 'under-load',
        ]
        const webEntry = web.routeResults.find(
          (entry) => entry.route === route && entry.phase === phase
        )
        const nodeEntry = node.routeResults.find(
          (entry) => entry.route === route && entry.phase === phase
        )

        if (!webEntry || !nodeEntry) continue

        const throughputDelta =
          ((nodeEntry.throughputRps - webEntry.throughputRps) /
            webEntry.throughputRps) *
          100
        const p95Delta =
          ((webEntry.latency.p95 - nodeEntry.latency.p95) /
            webEntry.latency.p95) *
          100

        console.log(`  ${route} (${phase})`)
        console.log(
          `    throughput delta: ${throughputDelta >= 0 ? '+' : ''}${throughputDelta.toFixed(2)}%`
        )
        console.log(
          `    p95 latency delta: ${p95Delta >= 0 ? '+' : ''}${p95Delta.toFixed(2)}% (positive is better)`
        )
      }
    }
  }
}

async function runFullModeBenchmark(
  options: CliOptions,
  mode: 'web' | 'node'
): Promise<FullRunResult> {
  const nextConfigPath = resolve(options.appDir, 'next.config.js')
  const originalConfig = await readFile(nextConfigPath, 'utf8')

  let server: ReturnType<typeof spawn> | null = null
  const routeResults: FullRoutePhaseResult[] = []
  const modeArtifactDir = resolve(options.artifactDir, mode)

  await mkdir(modeArtifactDir, { recursive: true })

  try {
    await writeFile(nextConfigPath, configForMode(mode))

    if (options.buildFull) {
      console.log(`\n[full/${mode}] building app fixture...`)
      await runCommand('node', [NEXT_BIN, 'build'], options.appDir, {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
      })
      if (options.captureNextTrace) {
        await copyIfExists(
          resolve(options.appDir, '.next/trace-build'),
          resolve(modeArtifactDir, 'next-trace-build.log')
        )
      }
    }

    console.log(`[full/${mode}] starting minimal server...`)

    const serverArgs: string[] = []
    if (options.captureCpu) {
      serverArgs.push(
        '--cpu-prof',
        `--cpu-prof-dir=${modeArtifactDir}`,
        `--cpu-prof-name=${mode}.cpuprofile`
      )
    }
    if (options.captureHeap) {
      serverArgs.push(
        '--heap-prof',
        `--heap-prof-dir=${modeArtifactDir}`,
        `--heap-prof-name=${mode}.heapprofile`
      )
    }
    if (options.captureTrace) {
      serverArgs.push(
        '--trace-events-enabled',
        `--trace-event-categories=${options.traceCategories}`,
        `--trace-event-file-pattern=${resolve(modeArtifactDir, `${mode}-trace-\${pid}.json`)}`
      )
    }
    serverArgs.push(MINIMAL_SERVER)

    server = spawn('node', serverArgs, {
      cwd: options.appDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        PORT: String(options.port),
      },
      stdio: 'ignore',
    })

    await waitForServerReady(
      `http://127.0.0.1:${options.port}${options.routes[0]}`,
      options.timeoutMs
    )

    for (const route of options.routes) {
      const url = `http://127.0.0.1:${options.port}${route}`

      console.log(
        `[full/${mode}] route ${route}: warmup ${options.warmupRequests}`
      )
      await runSerialRequests(url, options.warmupRequests, options.timeoutMs)

      console.log(`[full/${mode}] route ${route}: single-client phase`)
      const serialStart = performance.now()
      const serialLatencies = await runSerialRequests(
        url,
        options.serialRequests,
        options.timeoutMs
      )
      const serialDurationMs = performance.now() - serialStart
      routeResults.push({
        mode,
        route,
        phase: 'single-client',
        requests: options.serialRequests,
        concurrency: 1,
        throughputRps: options.serialRequests / (serialDurationMs / 1000),
        latency: computeStats(serialLatencies),
      })

      console.log(`[full/${mode}] route ${route}: under-load phase`)
      const loadStart = performance.now()
      const loadLatencies = await runConcurrentRequests(
        url,
        options.loadRequests,
        options.loadConcurrency,
        options.timeoutMs
      )
      const loadDurationMs = performance.now() - loadStart
      routeResults.push({
        mode,
        route,
        phase: 'under-load',
        requests: options.loadRequests,
        concurrency: options.loadConcurrency,
        throughputRps: options.loadRequests / (loadDurationMs / 1000),
        latency: computeStats(loadLatencies),
      })
    }

    return { mode, routeResults }
  } finally {
    if (server) {
      const tryKill = async (signal: NodeJS.Signals, timeoutMs: number) => {
        server!.kill(signal)
        const didExit = await Promise.race([
          once(server!, 'exit')
            .then(() => true)
            .catch(() => true),
          sleep(timeoutMs).then(() => false),
        ])
        return didExit
      }

      if (!(await tryKill('SIGINT', 3000))) {
        if (!(await tryKill('SIGTERM', 3000))) {
          server.kill('SIGKILL')
          await once(server, 'exit').catch(() => undefined)
        }
      }
    }

    if (options.captureNextTrace) {
      await copyIfExists(
        resolve(options.appDir, '.next/trace'),
        resolve(modeArtifactDir, 'next-runtime-trace.log')
      )
    }

    await writeFile(nextConfigPath, originalConfig)
  }
}

async function runFullBenchmarks(
  options: CliOptions
): Promise<FullRunResult[]> {
  await ensureNextBuilt()
  await mkdir(options.artifactDir, { recursive: true })

  const modes: Array<'web' | 'node'> =
    options.streamMode === 'both' ? ['web', 'node'] : [options.streamMode]

  const results: FullRunResult[] = []
  for (const mode of modes) {
    results.push(await runFullModeBenchmark(options, mode))
  }
  return results
}

async function main() {
  const options = parseCli()

  console.log('Render pipeline benchmark')
  console.log(`scenario=${options.scenario}`)

  let microResults: BenchResult[] | undefined
  let fullResults: FullRunResult[] | undefined

  if (options.scenario === 'micro' || options.scenario === 'all') {
    console.log(
      `\nRunning micro benchmarks: iterations=${options.iterations} warmup=${options.warmup}`
    )
    console.log(
      `html=${options.htmlChunks}x${options.htmlChunkBytes} flight=${options.flightChunks}x${options.flightChunkBytes} binaryFlight=${options.binaryFlight}`
    )

    microResults = await runMicroBenchmarks(options)
    printMicroResults(microResults)
  }

  if (options.scenario === 'full' || options.scenario === 'all') {
    console.log(
      `\nRunning full benchmark: appDir=${options.appDir} streamMode=${options.streamMode}`
    )
    console.log(`routes=${options.routes.join(', ')}`)
    console.log(`artifacts=${options.artifactDir}`)

    fullResults = await runFullBenchmarks(options)
    printFullResults(fullResults)
  }

  if (options.jsonOut) {
    const outputPath = resolve(process.cwd(), options.jsonOut)
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          options,
          microResults,
          fullResults,
          generatedAt: new Date().toISOString(),
          node: process.version,
        },
        null,
        2
      )
    )
    console.log(`\nWrote JSON report: ${outputPath}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
