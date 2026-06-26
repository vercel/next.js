// This script must be run with tsx

import { constants } from 'node:fs'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { SourceMap } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DEFAULT_ARTIFACTS_ROOT = resolve(
  REPO_ROOT,
  'bench/render-pipeline/artifacts'
)

type FullRoutePhaseResult = {
  mode: 'web' | 'node'
  route: string
  phase: 'single-client' | 'under-load'
  requests: number
  concurrency: number
  throughputRps: number
  latency: {
    min: number
    median: number
    mean: number
    p95: number
    max: number
  }
}

type BenchmarkJson = {
  fullResults?: Array<{
    mode: 'web' | 'node'
    routeResults: FullRoutePhaseResult[]
  }>
}

type ProfileAnalysis = {
  totalUs: number
  runtimeUs: number
  runtimeFile: string | null
  topModules: Array<{ name: string; us: number }>
  topRuntimeSources: Array<{ name: string; us: number }>
  topRuntimeSymbols: Array<{ name: string; us: number }>
}

function usage() {
  console.log(`Usage: pnpm bench:render-pipeline:analyze [options]

Options:
  --artifact-dir=<path>  Artifact run directory, or parent artifacts directory.
                         Default: latest run under bench/render-pipeline/artifacts
  --top=<number>         Number of top hotspots to show per section (default: 15)
`)
}

function parseArgs() {
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

  const topRaw = args.get('top')
  const top = topRaw ? Number(topRaw) : 15
  if (!Number.isFinite(top) || top < 1) {
    throw new Error(`Invalid --top value: ${topRaw}`)
  }

  return {
    artifactDirArg: args.get('artifact-dir'),
    top: Math.floor(top),
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function resolveArtifactRunDir(artifactDirArg?: string): Promise<string> {
  const requested = resolve(REPO_ROOT, artifactDirArg ?? DEFAULT_ARTIFACTS_ROOT)
  const requestedResults = resolve(requested, 'results.json')
  if (await exists(requestedResults)) {
    return requested
  }

  const entries = await readdir(requested, { withFileTypes: true })
  const dirs = entries.filter((entry) => entry.isDirectory())
  const runs: Array<{ dir: string; mtimeMs: number }> = []

  for (const dirent of dirs) {
    const dir = resolve(requested, dirent.name)
    const resultsPath = resolve(dir, 'results.json')
    if (!(await exists(resultsPath))) continue
    const stats = await stat(resultsPath)
    runs.push({ dir, mtimeMs: stats.mtimeMs })
  }

  if (runs.length === 0) {
    throw new Error(
      `No artifact run found in ${requested}. Expected a results.json file.`
    )
  }

  runs.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return runs[0].dir
}

function toPercent(part: number, total: number): string {
  if (total <= 0) return '0.00%'
  return `${((part / total) * 100).toFixed(2)}%`
}

function toMs(us: number): string {
  return `${(us / 1000).toFixed(1)}ms`
}

function sortTop(
  entries: Iterable<[string, number]>,
  limit: number
): Array<{ name: string; us: number }> {
  return [...entries]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, us]) => ({ name, us }))
}

function mapModuleFromUrl(url: string): string {
  if (!url || url === '(no-url)') return '(no-url)'
  if (url.startsWith('node:')) return url
  const appPageMatch = url.match(/app-page-turbo[\w-]*\.runtime\.prod\.js/)
  if (appPageMatch) return appPageMatch[0]
  if (url.includes('/.next/server/chunks/')) return '.next/server/chunks/*'
  if (url.includes('/next/dist/')) return 'next/dist/*'
  if (url.includes('/node_modules/')) return 'node_modules/*'
  return url
}

function detectRuntimeFile(
  urlsByUs: Array<{ url: string; us: number }>
): string | null {
  for (const entry of urlsByUs) {
    const match = entry.url.match(/app-page-turbo[\w-]*\.runtime\.prod\.js/)
    if (match) return match[0]
  }
  return null
}

async function analyzeProfile(
  profilePath: string,
  top: number
): Promise<ProfileAnalysis | null> {
  if (!(await exists(profilePath))) return null

  const rawProfile = await readFile(profilePath, 'utf8')
  const profile = JSON.parse(rawProfile) as {
    nodes: Array<{
      id: number
      callFrame: {
        functionName: string
        url: string
        lineNumber: number
        columnNumber: number
      }
    }>
    samples: number[]
    timeDeltas: number[]
  }

  const idToNode = new Map(profile.nodes.map((node) => [node.id, node]))
  const urlTotals = new Map<string, number>()
  const moduleTotals = new Map<string, number>()
  let totalUs = 0

  for (let i = 0; i < profile.samples.length; i++) {
    const sampleId = profile.samples[i]
    const deltaUs = profile.timeDeltas[i] ?? 0
    totalUs += deltaUs

    const node = idToNode.get(sampleId)
    if (!node) continue
    const url = node.callFrame.url || '(no-url)'
    urlTotals.set(url, (urlTotals.get(url) ?? 0) + deltaUs)

    const moduleName = mapModuleFromUrl(url)
    moduleTotals.set(moduleName, (moduleTotals.get(moduleName) ?? 0) + deltaUs)
  }

  const topUrls = sortTop(urlTotals.entries(), 30).map((entry) => ({
    url: entry.name,
    us: entry.us,
  }))
  const runtimeFile = detectRuntimeFile(topUrls)

  let runtimeUs = 0
  const runtimeSources = new Map<string, number>()
  const runtimeSymbols = new Map<string, number>()
  let sourceMap: SourceMap | null = null

  if (runtimeFile) {
    const mapPath = resolve(
      REPO_ROOT,
      `packages/next/dist/compiled/next-server/${runtimeFile}.map`
    )
    if (await exists(mapPath)) {
      sourceMap = new SourceMap(JSON.parse(await readFile(mapPath, 'utf8')))
    }
  }

  if (runtimeFile) {
    for (let i = 0; i < profile.samples.length; i++) {
      const sampleId = profile.samples[i]
      const deltaUs = profile.timeDeltas[i] ?? 0
      const node = idToNode.get(sampleId)
      if (!node) continue

      const { callFrame } = node
      if (!callFrame.url.includes(runtimeFile)) continue
      runtimeUs += deltaUs

      const generatedLine = callFrame.lineNumber ?? 0
      const generatedColumn = callFrame.columnNumber ?? 0

      let sourceName = callFrame.url
      let symbolName = callFrame.functionName || '(anonymous)'
      let sourceLine = generatedLine
      let sourceColumn = generatedColumn

      if (sourceMap) {
        const entry = sourceMap.findEntry(generatedLine, generatedColumn) as {
          originalSource?: string
          originalLine?: number
          originalColumn?: number
          name?: string
        }
        if (entry.originalSource) sourceName = entry.originalSource
        if (entry.name) symbolName = entry.name
        if (entry.originalLine !== undefined) sourceLine = entry.originalLine
        if (entry.originalColumn !== undefined)
          sourceColumn = entry.originalColumn
      }

      runtimeSources.set(
        sourceName,
        (runtimeSources.get(sourceName) ?? 0) + deltaUs
      )
      const symbolKey = `${symbolName} @ ${sourceName}:${sourceLine}:${sourceColumn}`
      runtimeSymbols.set(
        symbolKey,
        (runtimeSymbols.get(symbolKey) ?? 0) + deltaUs
      )
    }
  }

  return {
    totalUs,
    runtimeUs,
    runtimeFile,
    topModules: sortTop(moduleTotals.entries(), top),
    topRuntimeSources: sortTop(runtimeSources.entries(), top),
    topRuntimeSymbols: sortTop(runtimeSymbols.entries(), top),
  }
}

function printProfileAnalysis(
  mode: 'web' | 'node',
  analysis: ProfileAnalysis,
  top: number
) {
  console.log(`\n[${mode}]`)
  console.log(`  sampled: ${toMs(analysis.totalUs)}`)
  if (analysis.runtimeFile) {
    console.log(
      `  runtime: ${analysis.runtimeFile} (${toMs(analysis.runtimeUs)}, ${toPercent(analysis.runtimeUs, analysis.totalUs)})`
    )
  } else {
    console.log('  runtime: not detected')
  }

  console.log(`  top ${top} modules:`)
  for (const entry of analysis.topModules) {
    console.log(
      `    ${toPercent(entry.us, analysis.totalUs).padStart(7)} ${toMs(entry.us).padStart(9)} ${entry.name}`
    )
  }

  if (analysis.topRuntimeSources.length > 0) {
    console.log(`  top ${top} runtime sources:`)
    for (const entry of analysis.topRuntimeSources) {
      console.log(
        `    ${toPercent(entry.us, analysis.runtimeUs).padStart(7)} ${toMs(entry.us).padStart(9)} ${entry.name}`
      )
    }
  }

  if (analysis.topRuntimeSymbols.length > 0) {
    console.log(`  top ${top} runtime symbols:`)
    for (const entry of analysis.topRuntimeSymbols) {
      console.log(
        `    ${toPercent(entry.us, analysis.runtimeUs).padStart(7)} ${toMs(entry.us).padStart(9)} ${entry.name}`
      )
    }
  }
}

function printComparison(results: BenchmarkJson) {
  const fullResults = results.fullResults
  if (!fullResults || fullResults.length < 2) return

  const web = fullResults.find((entry) => entry.mode === 'web')
  const node = fullResults.find((entry) => entry.mode === 'node')
  if (!web || !node) return

  const webByKey = new Map(
    web.routeResults.map((item) => [`${item.route}|${item.phase}`, item])
  )

  console.log('\n[comparison node vs web]')
  console.log(
    '  route'.padEnd(20) +
      'phase'.padEnd(16) +
      'RPS delta'.padEnd(14) +
      'P95 delta'
  )

  for (const nodeEntry of node.routeResults) {
    const key = `${nodeEntry.route}|${nodeEntry.phase}`
    const webEntry = webByKey.get(key)
    if (!webEntry) continue
    const rpsDelta =
      ((nodeEntry.throughputRps - webEntry.throughputRps) /
        webEntry.throughputRps) *
      100
    const p95Delta =
      ((webEntry.latency.p95 - nodeEntry.latency.p95) / webEntry.latency.p95) *
      100

    const line =
      `  ${nodeEntry.route}`.padEnd(20) +
      `${nodeEntry.phase}`.padEnd(16) +
      `${rpsDelta >= 0 ? '+' : ''}${rpsDelta.toFixed(2)}%`.padEnd(14) +
      `${p95Delta >= 0 ? '+' : ''}${p95Delta.toFixed(2)}%`
    console.log(line)
  }
}

async function main() {
  const { artifactDirArg, top } = parseArgs()
  const runDir = await resolveArtifactRunDir(artifactDirArg)

  console.log(`Analyzing render pipeline artifacts:`)
  console.log(`  ${runDir}`)

  const resultsPath = resolve(runDir, 'results.json')
  const resultsRaw = await readFile(resultsPath, 'utf8')
  const resultsJson = JSON.parse(resultsRaw) as BenchmarkJson
  printComparison(resultsJson)

  const webProfile = resolve(runDir, 'web/web.cpuprofile')
  const nodeProfile = resolve(runDir, 'node/node.cpuprofile')

  const [webAnalysis, nodeAnalysis] = await Promise.all([
    analyzeProfile(webProfile, top),
    analyzeProfile(nodeProfile, top),
  ])

  if (!webAnalysis && !nodeAnalysis) {
    console.log('\nNo CPU profiles found in this artifact run.')
    console.log(
      'This analyzer reads only <mode>/<mode>.cpuprofile artifacts (not trace-event JSON or next-runtime-trace.log).'
    )
    console.log(
      'Run benchmark with --capture-cpu=true, e.g. pnpm bench:render-pipeline --scenario=full --stream-mode=node --capture-cpu=true'
    )
    return
  }

  if (webAnalysis) printProfileAnalysis('web', webAnalysis, top)
  if (nodeAnalysis) printProfileAnalysis('node', nodeAnalysis, top)

  console.log('\nDone.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
