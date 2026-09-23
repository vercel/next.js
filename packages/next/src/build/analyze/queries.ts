import type { AnalyzeData, ModulesData } from '../../shared/lib/analyze-data'
import type { SnapshotMetadata } from './snapshot'
import type { AnalyzeRepository } from './repository'
import z from 'next/dist/compiled/zod'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const MAX_MODULE_CANDIDATES = 100
const MAX_GRAPH_NODES = 10_000
const MAX_COUNTERFACTUAL_GRAPH_ITEMS = 50_000
const COMPRESSED_CAVEAT =
  'Compressed source sizes are estimates because attributed parts are compressed independently.'
const ENTRY_HEURISTIC_CAVEAT =
  'Route entries are detected heuristically from internal Next.js module identifiers.'

type Environment = 'total' | 'client' | 'server'
type Metric = 'raw' | 'compressed'
type FileType = 'js' | 'css' | 'json' | 'asset'
type OutputKind =
  | 'js'
  | 'css'
  | 'json'
  | 'font'
  | 'image'
  | 'media'
  | 'wasm'
  | 'other'

interface SourceRow {
  key: string
  sourcePath?: string
  packageName?: string
  rawSize: number
  compressedSize: number
  client: boolean
  server: boolean
  traced: boolean
  chunkNames: string[]
  chunkCount: number
}

interface DiffRow {
  key: string
  baselineRawSize: number
  comparisonRawSize: number
  baselineCompressedSize: number
  comparisonCompressedSize: number
  status: 'added' | 'removed' | 'changed' | 'identical'
  delta: number
}

interface DiffInput extends Omit<DiffRow, 'status' | 'delta'> {
  baselinePresent: boolean
  comparisonPresent: boolean
}

interface OverviewArgs {
  snapshot?: string
  environment?: 'total' | 'client'
  metric?: Metric
  routeFilter?: string
  offset?: number
  limit?: number
}

interface SourcesArgs {
  route: string
  snapshot?: string
  search?: string
  environment?: Environment
  fileTypes?: FileType[]
  groupBy?: 'source' | 'package'
  metric?: Metric
  offset?: number
  limit?: number
}

interface SourceChunksArgs {
  route: string
  sourcePath: string
  snapshot?: string
  offset?: number
  limit?: number
}

interface RouteOutputsArgs {
  route: string
  snapshot?: string
  search?: string
  kinds?: OutputKind[]
  environment?: Environment
  groupBy?: 'file' | 'kind' | 'environment'
  metric?: Metric
  offset?: number
  limit?: number
}

interface CssAssetsArgs {
  route: string
  snapshot?: string
  cssSearch?: string
  assetKinds?: Array<'font' | 'image' | 'media'>
  offset?: number
  limit?: number
}

interface ExplainArgs {
  route: string
  sourcePath: string
  snapshot?: string
  moduleIdent?: string
  routeEntryId?: string
  importerModuleIdent?: string
  environment?: Environment
  maxDepth?: number
}

interface InitialGraphArgs {
  route: string
  sourcePath: string
  snapshot?: string
  moduleIdent?: string
  routeEntryId?: string
  environment?: Environment
}

interface ImportEdgeArgs extends InitialGraphArgs {
  edgeId: string
  granularity?: 'module' | 'source' | 'package'
  offset?: number
  limit?: number
}

interface CompareArgs {
  baselineSnapshot: string
  comparisonSnapshot?: string
  granularity?: 'route' | 'source' | 'package'
  route?: string
  environment?: Environment
  metric?: Metric
  search?: string
  offset?: number
  limit?: number
}

class DetailedToolError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown>
  ) {
    super(message)
  }
}

export class AnalyzeQueryError extends Error {
  constructor(readonly output: Record<string, unknown>) {
    super(
      typeof output.error === 'string' ? output.error : 'Analyzer query failed'
    )
  }
}

function publicError(error: unknown): Record<string, unknown> {
  if (error instanceof DetailedToolError) {
    return { error: error.message, ...error.details }
  }
  if (!(error instanceof Error))
    return { error: 'Unable to query analyzer data' }
  if (error.message.startsWith('Unknown snapshot')) {
    return { error: 'Unknown snapshot' }
  }
  if (error.message.startsWith('Unknown route'))
    return { error: 'Unknown route' }
  if (error.message.startsWith('Unknown source'))
    return { error: 'Unknown source' }
  if (/^(?:Invalid |moduleIdent )/.test(error.message)) {
    return { error: error.message }
  }
  return { error: 'Unable to query analyzer data' }
}

function safeQuery<T, R>(fn: (args: T) => Promise<R>) {
  return async (args: T) => {
    try {
      return await fn(args)
    } catch (error) {
      throw new AnalyzeQueryError(publicError(error))
    }
  }
}

export type AnalyzeQueryListing = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  example: Record<string, unknown>
}

type StoredQuery = AnalyzeQueryListing & {
  execute: (input: unknown) => Promise<unknown>
}

export class AnalyzeQueryRegistry {
  constructor(private readonly queries: StoredQuery[]) {}

  list(): AnalyzeQueryListing[] {
    return this.queries.map(({ execute: _execute, ...query }) => query)
  }

  async execute(name: string, input: unknown): Promise<unknown> {
    const query = this.queries.find((item) => item.name === name)
    if (!query) {
      throw new AnalyzeQueryError({ error: `Unknown analyzer query: ${name}` })
    }
    try {
      return await query.execute(input)
    } catch (error) {
      if (error instanceof AnalyzeQueryError) throw error
      if (error instanceof z.ZodError) {
        throw new AnalyzeQueryError({
          error: `Invalid arguments for query ${name}: ${error.message}`,
          example: query.example,
        })
      }
      throw error
    }
  }
}

function page<T>(values: T[], offset: number, limit: number) {
  const result = values.slice(offset, offset + limit)
  return {
    values: result,
    pagination: {
      offset,
      limit,
      total: values.length,
      returned: result.length,
      truncated: offset + limit < values.length,
    },
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function metricValue(
  value: { rawSize: number; compressedSize: number },
  metric: Metric
): number {
  return metric === 'compressed' ? value.compressedSize : value.rawSize
}

function outputEnvironment(filename: string): 'client' | 'server' {
  return filename.startsWith('[client-fs]/') ? 'client' : 'server'
}

function sourceSizes(
  data: AnalyzeData,
  sourceIndex: number,
  environment: Environment
): { rawSize: number; compressedSize: number } {
  let rawSize = 0
  let compressedSize = 0
  for (const partIndex of data.sourceChunkParts(sourceIndex)) {
    const part = data.chunkPart(partIndex)
    const output = part && data.outputFile(part.output_file_index)
    if (!part || !output) continue
    if (
      environment !== 'total' &&
      outputEnvironment(output.filename) !== environment
    ) {
      continue
    }
    rawSize += part.size
    compressedSize += part.compressed_size
  }
  return { rawSize, compressedSize }
}

function routeSizes(data: AnalyzeData, environment: Environment) {
  let rawSize = 0
  let compressedSize = 0
  for (let index = 0; index < data.sourceCount(); index++) {
    const sizes = sourceSizes(data, index, environment)
    rawSize += sizes.rawSize
    compressedSize += sizes.compressedSize
  }
  return { rawSize, compressedSize }
}

function outputKind(filename: string): OutputKind {
  const pathname = filename.split(/[?#]/, 1)[0].toLocaleLowerCase()
  if (/\.(?:js|mjs|cjs)$/.test(pathname)) return 'js'
  if (pathname.endsWith('.css')) return 'css'
  if (pathname.endsWith('.json')) return 'json'
  if (/\.(?:woff2?|ttf|otf|eot)$/.test(pathname)) return 'font'
  if (/\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/.test(pathname)) return 'image'
  if (/\.(?:mp4|webm|ogg|mp3|wav|flac|aac|mov)$/.test(pathname)) return 'media'
  if (pathname.endsWith('.wasm')) return 'wasm'
  return 'other'
}

function outputSizes(data: AnalyzeData, outputIndex: number) {
  let rawSize = 0
  let compressedSize = 0
  for (const partIndex of data.outputFileChunkParts(outputIndex)) {
    const part = data.chunkPart(partIndex)
    if (!part) continue
    rawSize += part.size
    compressedSize += part.compressed_size
  }
  return { rawSize, compressedSize }
}

function packageNameFromPath(sourcePath: string): string | undefined {
  const marker = 'node_modules/'
  const start = sourcePath.lastIndexOf(marker)
  if (start === -1) return undefined
  const parts = sourcePath.slice(start + marker.length).split('/')
  if (!parts[0] || parts[0] === '.pnpm') return undefined
  return parts[0].startsWith('@') && parts[1]
    ? `${parts[0]}/${parts[1]}`
    : parts[0]
}

function hasFileType(
  flags: ReturnType<AnalyzeData['getSourceFlags']>,
  types: FileType[] | undefined
): boolean {
  return !types?.length || types.some((type) => flags[type])
}

function collectSources(
  data: AnalyzeData,
  options: {
    search?: string
    environment: Environment
    fileTypes?: FileType[]
    groupBy: 'source' | 'package'
  }
): SourceRow[] {
  const search = options.search?.toLocaleLowerCase()
  const rows = new Map<string, SourceRow>()
  for (let index = 0; index < data.sourceCount(); index++) {
    if (data.sourceChunkParts(index).length === 0) continue
    const sourcePath = data.getFullSourcePath(index)
    if (
      !sourcePath ||
      (search && !sourcePath.toLocaleLowerCase().includes(search))
    ) {
      continue
    }
    const flags = data.getSourceFlags(index)
    if (
      (options.environment === 'client' && !flags.client) ||
      (options.environment === 'server' && !flags.server) ||
      !hasFileType(flags, options.fileTypes)
    ) {
      continue
    }
    const sizes = sourceSizes(data, index, options.environment)
    if (sizes.rawSize === 0 && sizes.compressedSize === 0) continue
    const packageName = packageNameFromPath(sourcePath)
    const key =
      options.groupBy === 'package' && packageName ? packageName : sourcePath
    const existing = rows.get(key)
    if (existing) {
      existing.rawSize += sizes.rawSize
      existing.compressedSize += sizes.compressedSize
      existing.client ||= flags.client
      existing.server ||= flags.server
      existing.traced ||= flags.traced
      existing.chunkNames.push(...data.sourceChunks(index))
    } else {
      rows.set(key, {
        key,
        ...(options.groupBy === 'package' && packageName
          ? { packageName }
          : { sourcePath }),
        ...sizes,
        client: flags.client,
        server: flags.server,
        traced: flags.traced,
        chunkNames: data.sourceChunks(index),
        chunkCount: 0,
      })
    }
  }
  return [...rows.values()].map((row) => {
    const chunkCount = new Set(row.chunkNames).size
    return { ...row, chunkCount }
  })
}

function sortBySize(rows: SourceRow[], metric: Metric): SourceRow[] {
  return rows.sort(
    (a, b) =>
      metricValue(b, metric) - metricValue(a, metric) ||
      compareText(a.key, b.key)
  )
}

const POTENTIAL_ENTRY_DEPENDENTS = [
  'next-app-loader',
  'next-edge-app-route-loader',
  'next-edge-ssr-loader',
  'next-route-loader',
  'app-page',
  'pages-page',
]
const CLIENT_ENTRIES = ['app-pages-internals', 'pages-dir-browser']

function activeEntries(modules: ModulesData, data: AnalyzeData): Set<number> {
  const result = new Set<number>()
  for (let index = 0; index < modules.moduleCount(); index++) {
    const module = modules.module(index)
    if (!module) continue
    if (
      POTENTIAL_ENTRY_DEPENDENTS.some((entry) => module.ident.includes(entry))
    ) {
      let matchedRouteSource = false
      for (const dependency of modules.moduleDependencies(index)) {
        const dependencyModule = modules.module(dependency)
        if (
          dependencyModule &&
          !dependencyModule.path.includes('next/dist/') &&
          data.getSourceIndexFromPath(dependencyModule.path) !== undefined
        ) {
          matchedRouteSource = true
          result.add(dependency)
        }
      }
      if (matchedRouteSource) result.add(index)
    }
    if (
      CLIENT_ENTRIES.some((entry) => module.ident.includes(entry)) &&
      data.getSourceIndexFromPath(module.path) !== undefined
    ) {
      result.add(index)
    }
  }
  return result
}

type ResolvedRouteEntry = {
  routeEntryId: string
  moduleIdent: string
  modulePath: string
  role: 'route' | 'shared'
  runtime?: string
  index: number
}

function resolveRouteEntries(
  modules: ModulesData,
  data: AnalyzeData,
  routeEntryId?: string
): {
  entries: Set<number>
  candidates: ResolvedRouteEntry[]
  heuristic: boolean
} {
  if (data.hasExactRouteEntries()) {
    const candidates = data
      .routeEntries()
      .map((entry) => {
        const index = modules.getModuleIndexFromIdent(entry.module_ident)
        if (index === undefined) {
          throw new Error(
            `Invalid analyzer data: unknown route entry module ${entry.module_ident}`
          )
        }
        return {
          routeEntryId: entry.route_entry_id,
          moduleIdent: entry.module_ident,
          modulePath: entry.module_path,
          role: entry.role,
          ...(entry.runtime ? { runtime: entry.runtime } : {}),
          index,
        }
      })
      .sort((a, b) => compareText(a.routeEntryId, b.routeEntryId))
    const selected = routeEntryId
      ? candidates.filter((entry) => entry.routeEntryId === routeEntryId)
      : candidates
    if (routeEntryId && selected.length === 0) {
      throw new DetailedToolError('Unknown routeEntryId', {
        routeEntries: candidates.map(({ index: _index, ...entry }) => entry),
      })
    }
    return {
      entries: new Set(selected.map((entry) => entry.index)),
      candidates,
      heuristic: false,
    }
  }
  if (routeEntryId) {
    throw new Error(
      'routeEntryId requires analyzer data with exact route entries'
    )
  }
  return {
    entries: activeEntries(modules, data),
    candidates: [],
    heuristic: true,
  }
}

function routeModules(
  modules: ModulesData,
  entries: Set<number>
): { modules: Set<number>; truncated: boolean } {
  const reachable = new Set(entries)
  const queue = [...entries]
  while (queue.length) {
    const current = queue.shift()!
    const dependencies = [
      ...modules.moduleDependencies(current),
      ...modules.asyncModuleDependencies(current),
      ...modules.tracedModuleDependencies(current),
    ]
    for (const dependency of dependencies) {
      if (reachable.has(dependency)) continue
      if (reachable.size >= MAX_GRAPH_NODES) {
        return { modules: reachable, truncated: true }
      }
      reachable.add(dependency)
      queue.push(dependency)
    }
  }
  return { modules: reachable, truncated: false }
}

function moduleMatchesEnvironment(
  ident: string,
  environment: Environment
): boolean {
  if (environment === 'total') return true
  if (environment === 'client') {
    return !['ssr', 'rsc', 'route', 'api'].some((layer) =>
      ident.includes(layer)
    )
  }
  return !ident.includes('client')
}

function moduleIdentity(modules: ModulesData, index: number) {
  const module = modules.module(index)
  return module ? { ident: module.ident, path: module.path } : undefined
}

function findImporterChain(
  modules: ModulesData,
  start: number,
  entries: Set<number>,
  reachable: Set<number>,
  maxDepth: number,
  graphTruncated: boolean,
  firstImporter?: number
): {
  chain: Array<{
    module: { ident: string; path: string }
    edgeKind?: 'sync' | 'async' | 'traced'
  }>
  truncated: boolean
} {
  type Node = {
    index: number
    chain: Array<{ index: number; edgeKind?: 'sync' | 'async' | 'traced' }>
  }
  let initial: Node = { index: start, chain: [{ index: start }] }
  const visited = new Set([start])
  if (firstImporter !== undefined) {
    let edgeKind: 'sync' | 'async' | 'traced' | undefined
    if (modules.moduleDependents(start).includes(firstImporter))
      edgeKind = 'sync'
    else if (modules.asyncModuleDependents(start).includes(firstImporter))
      edgeKind = 'async'
    else if (modules.tracedModuleDependents(start).includes(firstImporter))
      edgeKind = 'traced'
    if (!edgeKind || !reachable.has(firstImporter)) {
      return { chain: [], truncated: graphTruncated }
    }
    initial = {
      index: firstImporter,
      chain: [{ index: start }, { index: firstImporter, edgeKind }],
    }
    visited.add(firstImporter)
  }
  const queue: Node[] = [initial]
  let truncated = graphTruncated
  while (queue.length) {
    const current = queue.shift()!
    if (entries.has(current.index)) {
      return {
        chain: current.chain.map((item, index) => ({
          module: moduleIdentity(modules, item.index)!,
          ...(index > 0 ? { edgeKind: item.edgeKind } : {}),
        })),
        truncated: false,
      }
    }
    if (current.chain.length - 1 >= maxDepth) {
      truncated = true
      continue
    }
    const edges: Array<[number, 'sync' | 'async' | 'traced']> = [
      ...modules
        .moduleDependents(current.index)
        .map((index) => [index, 'sync'] as [number, 'sync']),
      ...modules
        .asyncModuleDependents(current.index)
        .map((index) => [index, 'async'] as [number, 'async']),
      ...modules
        .tracedModuleDependents(current.index)
        .map((index) => [index, 'traced'] as [number, 'traced']),
    ]
    edges.sort((a, b) => {
      const moduleA = modules.module(a[0])
      const moduleB = modules.module(b[0])
      return (
        compareText(moduleA?.ident ?? '', moduleB?.ident ?? '') ||
        compareText(moduleA?.path ?? '', moduleB?.path ?? '') ||
        compareText(a[1], b[1]) ||
        a[0] - b[0]
      )
    })
    for (const [index, edgeKind] of edges) {
      if (
        visited.has(index) ||
        !reachable.has(index) ||
        !modules.module(index)
      ) {
        continue
      }
      if (visited.size >= MAX_GRAPH_NODES) {
        truncated = true
        continue
      }
      visited.add(index)
      queue.push({
        index,
        chain: [...current.chain, { index, edgeKind }],
      })
    }
  }
  return { chain: [], truncated }
}

type ImporterChain = ReturnType<typeof findImporterChain>

function isProjectModule(module: { ident: string; path: string }): boolean {
  return (
    module.path.startsWith('[project]/') &&
    !module.path.includes('/node_modules/')
  )
}

function loadPathEvidence(importerChain: ImporterChain) {
  const chain = [...importerChain.chain]
    .reverse()
    .map((item, index, reversed) => ({
      module: item.module,
      ...(index < reversed.length - 1 && item.edgeKind
        ? { edgeKindToNext: item.edgeKind }
        : {}),
    }))
  const asyncIndex = chain.findIndex((item) => item.edgeKindToNext === 'async')
  return {
    entryToSourceChain: {
      chain,
      truncated: importerChain.truncated,
    },
    firstAsyncBoundary:
      asyncIndex === -1
        ? undefined
        : {
            importer: chain[asyncIndex].module,
            dependency: chain[asyncIndex + 1].module,
          },
    nearestProjectImporter: importerChain.chain
      .slice(1)
      .find((item) => isProjectModule(item.module))?.module,
    nearestClientBoundary: importerChain.chain.find(
      (item) =>
        isProjectModule(item.module) &&
        item.module.ident.includes('client reference proxy')
    )?.module,
  }
}

type InitialGraphSource = {
  key: string
  sourcePath: string
  packageName?: string
  rawSize: number
  compressedSize: number
}

type InitialGraphEdge = {
  edgeId: string
  from: number
  to: number
  leavingModules: number[]
  leavingSources: InitialGraphSource[]
}

type InitialGraphAnalysis = {
  nodes: number[]
  predecessorNodes: Set<number>
  sccs: Array<{ id: number; members: number[] }>
  sccEvidence: 'producer-petgraph' | 'query-fallback'
  edges: InitialGraphEdge[]
  targetIndex: number
}

function reachableSync(
  modules: ModulesData,
  entries: Set<number>
): Set<number> {
  const seen = new Set<number>()
  const queue = [...entries].sort((a, b) => a - b)
  while (queue.length) {
    const index = queue.shift()!
    if (seen.has(index)) continue
    if (seen.size >= MAX_GRAPH_NODES) {
      throw new DetailedToolError(
        'Initial module graph exceeds analysis bound',
        {
          maxGraphNodes: MAX_GRAPH_NODES,
        }
      )
    }
    seen.add(index)
    for (const dependency of modules.moduleDependencies(index)) {
      if (!seen.has(dependency)) queue.push(dependency)
    }
  }
  return seen
}

function reverseSyncToTarget(
  modules: ModulesData,
  target: number,
  allowed: Set<number>
): Set<number> {
  const seen = new Set<number>()
  const queue = [target]
  while (queue.length) {
    const index = queue.shift()!
    if (seen.has(index) || !allowed.has(index)) continue
    seen.add(index)
    for (const importer of modules.moduleDependents(index)) {
      if (!seen.has(importer) && allowed.has(importer)) queue.push(importer)
    }
  }
  return seen
}

function stronglyConnectedComponents(
  nodes: number[],
  edges: Array<{ from: number; to: number }>
): number[][] {
  const adjacency = new Map<number, number[]>()
  for (const node of nodes) adjacency.set(node, [])
  for (const edge of edges) adjacency.get(edge.from)?.push(edge.to)
  for (const values of adjacency.values()) values.sort((a, b) => a - b)

  let nextIndex = 0
  const indexes = new Map<number, number>()
  const lowLinks = new Map<number, number>()
  const stack: number[] = []
  const onStack = new Set<number>()
  const result: number[][] = []

  function visit(node: number): void {
    indexes.set(node, nextIndex)
    lowLinks.set(node, nextIndex++)
    stack.push(node)
    onStack.add(node)
    for (const dependency of adjacency.get(node) ?? []) {
      if (!indexes.has(dependency)) {
        visit(dependency)
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node)!, lowLinks.get(dependency)!)
        )
      } else if (onStack.has(dependency)) {
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node)!, indexes.get(dependency)!)
        )
      }
    }
    if (lowLinks.get(node) !== indexes.get(node)) return
    const component: number[] = []
    while (stack.length) {
      const member = stack.pop()!
      onStack.delete(member)
      component.push(member)
      if (member === node) break
    }
    component.sort((a, b) => a - b)
    result.push(component)
  }

  for (const node of nodes) if (!indexes.has(node)) visit(node)
  return result.sort((a, b) => a[0] - b[0])
}

function synchronousComponents(
  modules: ModulesData,
  nodes: number[],
  edges: Array<{ from: number; to: number }>
): {
  sccs: Array<{ id: number; members: number[] }>
  evidence: 'producer-petgraph' | 'query-fallback'
} {
  if (modules.hasExactSyncSccs()) {
    const byId = new Map<number, number[]>()
    for (const node of nodes) {
      const id = modules.syncSccId(node)!
      const members = byId.get(id)
      if (members) members.push(node)
      else byId.set(id, [node])
    }
    return {
      sccs: [...byId]
        .map(([id, members]) => ({
          id,
          members: members.sort((a, b) => a - b),
        }))
        .sort((a, b) => a.id - b.id),
      evidence: 'producer-petgraph',
    }
  }
  return {
    sccs: stronglyConnectedComponents(nodes, edges).map((members, id) => ({
      id,
      members,
    })),
    evidence: 'query-fallback',
  }
}

/**
 * Compute edge dominators by splitting every edge into a synthetic graph node,
 * then finding immediate dominators with the Cooper-Harvey-Kennedy algorithm.
 * A synthetic node dominates an original module iff every synchronous path to
 * that module crosses the represented import edge.
 */
function edgeDominatedModules(
  nodes: number[],
  edges: Array<{ from: number; to: number }>,
  entries: Set<number>,
  includedEdgeIndexes?: Set<number>
): Map<number, number[]> {
  const local = new Map(nodes.map((node, index) => [node, index]))
  const originalCount = nodes.length
  const edgeOffset = originalCount
  const root = originalCount + edges.length
  const total = root + 1
  if (total > MAX_COUNTERFACTUAL_GRAPH_ITEMS) {
    throw new DetailedToolError(
      'Initial graph is complete but too large for edge counterfactual analysis',
      {
        moduleCount: nodes.length,
        edgeCount: edges.length,
        maxCounterfactualGraphItems: MAX_COUNTERFACTUAL_GRAPH_ITEMS,
      }
    )
  }

  const predecessors = Array.from({ length: total }, () => [] as number[])
  const successors = Array.from({ length: total }, () => [] as number[])
  const addEdge = (from: number, to: number) => {
    successors[from].push(to)
    predecessors[to].push(from)
  }
  for (const entry of entries) {
    const index = local.get(entry)
    if (index !== undefined) addEdge(root, index)
  }
  edges.forEach((edge, edgeIndex) => {
    const edgeNode = edgeOffset + edgeIndex
    addEdge(local.get(edge.from)!, edgeNode)
    addEdge(edgeNode, local.get(edge.to)!)
  })

  // Reverse postorder without recursive DFS, so very deep import chains cannot
  // overflow the JavaScript stack.
  const visited = new Uint8Array(total)
  const postorder: number[] = []
  const stack: Array<{ node: number; next: number }> = [{ node: root, next: 0 }]
  visited[root] = 1
  while (stack.length) {
    const frame = stack[stack.length - 1]
    const next = successors[frame.node][frame.next++]
    if (next !== undefined) {
      if (!visited[next]) {
        visited[next] = 1
        stack.push({ node: next, next: 0 })
      }
      continue
    }
    postorder.push(frame.node)
    stack.pop()
  }
  if (postorder.length !== total) {
    throw new Error(
      'Initial graph contains nodes unreachable from route entries'
    )
  }
  const reversePostorder = postorder.reverse()
  const position = new Int32Array(total)
  reversePostorder.forEach((node, index) => {
    position[node] = index
  })

  const immediateDominator = new Int32Array(total).fill(-1)
  immediateDominator[root] = root
  const intersect = (left: number, right: number): number => {
    while (left !== right) {
      while (position[left] > position[right]) {
        left = immediateDominator[left]
      }
      while (position[right] > position[left]) {
        right = immediateDominator[right]
      }
    }
    return left
  }

  let changed = true
  while (changed) {
    changed = false
    for (const node of reversePostorder.slice(1)) {
      const knownPredecessors = predecessors[node].filter(
        (predecessor) => immediateDominator[predecessor] !== -1
      )
      if (knownPredecessors.length === 0) continue
      let dominator = knownPredecessors[0]
      for (const predecessor of knownPredecessors.slice(1)) {
        dominator = intersect(predecessor, dominator)
      }
      if (immediateDominator[node] !== dominator) {
        immediateDominator[node] = dominator
        changed = true
      }
    }
  }
  if (immediateDominator.some((dominator) => dominator === -1)) {
    throw new Error('Unable to compute initial graph dominators')
  }

  const selected =
    includedEdgeIndexes ?? new Set(edges.map((_edge, index) => index))
  const result = new Map<number, number[]>()
  for (const edgeIndex of selected) result.set(edgeIndex, [])
  for (let nodeIndex = 0; nodeIndex < originalCount; nodeIndex++) {
    let dominator = immediateDominator[nodeIndex]
    while (dominator !== root) {
      if (dominator >= edgeOffset) {
        const edgeIndex = dominator - edgeOffset
        result.get(edgeIndex)?.push(nodes[nodeIndex])
      }
      dominator = immediateDominator[dominator]
    }
  }
  return result
}

function analyzeInitialGraph(
  data: AnalyzeData,
  modules: ModulesData,
  entries: Set<number>,
  targetIndex: number,
  environment: Environment
): InitialGraphAnalysis {
  const initiallyReachable = reachableSync(modules, entries)
  if (!initiallyReachable.has(targetIndex)) {
    throw new Error(
      'Selected module is not synchronously reachable from route entries'
    )
  }
  const nodes = [...initiallyReachable].sort((a, b) => a - b)
  const edges = nodes.flatMap((from) =>
    modules
      .moduleDependencies(from)
      .filter((to) => initiallyReachable.has(to))
      .map((to) => ({ from, to }))
  )
  edges.sort((a, b) => a.from - b.from || a.to - b.to)
  const predecessorNodes = reverseSyncToTarget(
    modules,
    targetIndex,
    initiallyReachable
  )
  const edgeIndexById = new Map(
    edges.map((edge, index) => [`${edge.from}:${edge.to}`, index])
  )
  const predecessorEdges = edges.filter(
    (edge) => predecessorNodes.has(edge.from) && predecessorNodes.has(edge.to)
  )
  const predecessorEdgeIndexes = new Set(
    predecessorEdges.map(
      (edge) => edgeIndexById.get(`${edge.from}:${edge.to}`)!
    )
  )
  const dominated = edgeDominatedModules(
    nodes,
    edges,
    entries,
    predecessorEdgeIndexes
  )
  const components = synchronousComponents(
    modules,
    [...predecessorNodes].sort((a, b) => a - b),
    predecessorEdges
  )

  const graphEdges = predecessorEdges.map((edge) => {
    const edgeIndex = edgeIndexById.get(`${edge.from}:${edge.to}`)!
    const leavingModules = dominated.get(edgeIndex) ?? []
    const leavingModuleSet = new Set(leavingModules)
    const leavingSources: InitialGraphSource[] = []
    for (let sourceIndex = 0; sourceIndex < data.sourceCount(); sourceIndex++) {
      const sourcePath = data.getFullSourcePath(sourceIndex)
      const candidates = modules
        .getModuleIndiciesFromPath(sourcePath)
        .filter((index) => initiallyReachable.has(index))
      if (
        candidates.length === 0 ||
        candidates.some((index) => !leavingModuleSet.has(index))
      ) {
        continue
      }
      const sizes = sourceSizes(data, sourceIndex, environment)
      if (sizes.rawSize === 0 && sizes.compressedSize === 0) continue
      leavingSources.push({
        key: sourcePath,
        sourcePath,
        packageName: packageNameFromPath(sourcePath),
        ...sizes,
      })
    }
    leavingSources.sort((a, b) => compareText(a.sourcePath, b.sourcePath))
    return {
      edgeId: `${edge.from}:${edge.to}`,
      from: edge.from,
      to: edge.to,
      leavingModules,
      leavingSources,
    }
  })

  return {
    nodes,
    predecessorNodes,
    sccs: components.sccs,
    sccEvidence: components.evidence,
    edges: graphEdges,
    targetIndex,
  }
}

function selectModuleCandidate(
  modules: ModulesData,
  sourcePath: string,
  moduleIdent: string | undefined,
  environment: Environment
): { index: number; module: { ident: string; path: string } } {
  const candidates = modules
    .getModuleIndiciesFromPath(sourcePath)
    .filter((index) => {
      const module = modules.module(index)
      return module && moduleMatchesEnvironment(module.ident, environment)
    })
    .map((index) => ({ index, module: moduleIdentity(modules, index)! }))
    .sort((a, b) => compareText(a.module.ident, b.module.ident))
  const selected = moduleIdent
    ? candidates.find(({ module }) => module.ident === moduleIdent)
    : candidates.length === 1
      ? candidates[0]
      : undefined
  if (!selected) {
    throw new DetailedToolError(
      moduleIdent
        ? 'moduleIdent does not match a module candidate for this source'
        : 'Source has multiple module identities; select moduleIdent',
      { moduleCandidates: candidates.map(({ module }) => module) }
    )
  }
  return selected
}

function diffStatus(
  inBaseline: boolean,
  inComparison: boolean,
  baselineRawSize: number,
  comparisonRawSize: number
): DiffRow['status'] {
  if (!inBaseline) return 'added'
  if (!inComparison) return 'removed'
  return baselineRawSize === comparisonRawSize ? 'identical' : 'changed'
}

function summarizeDiff(
  rows: DiffInput[],
  metric: Metric,
  offset: number,
  limit: number
) {
  const completed: DiffRow[] = rows.map(
    ({ baselinePresent, comparisonPresent, ...row }) => {
      const status = diffStatus(
        baselinePresent,
        comparisonPresent,
        row.baselineRawSize,
        row.comparisonRawSize
      )
      const delta =
        metric === 'compressed'
          ? row.comparisonCompressedSize - row.baselineCompressedSize
          : row.comparisonRawSize - row.baselineRawSize
      return { ...row, status, delta }
    }
  )
  completed.sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta) || compareText(a.key, b.key)
  )
  const counts = { added: 0, removed: 0, changed: 0, identical: 0 }
  let baselineRawSize = 0
  let comparisonRawSize = 0
  let baselineCompressedSize = 0
  let comparisonCompressedSize = 0
  for (const row of completed) {
    counts[row.status]++
    baselineRawSize += row.baselineRawSize
    comparisonRawSize += row.comparisonRawSize
    baselineCompressedSize += row.baselineCompressedSize
    comparisonCompressedSize += row.comparisonCompressedSize
  }
  const paged = page(completed, offset, limit)
  return {
    counts,
    totals: {
      baselineRawSize,
      comparisonRawSize,
      baselineCompressedSize,
      comparisonCompressedSize,
      delta:
        metric === 'compressed'
          ? comparisonCompressedSize - baselineCompressedSize
          : comparisonRawSize - baselineRawSize,
    },
    rows: paged.values,
    pagination: paged.pagination,
  }
}

function provenance(metadata: SnapshotMetadata) {
  return {
    id: metadata.id,
    createdAt: metadata.createdAt,
    baselineName: metadata.baselineName,
    nextVersion: metadata.nextVersion,
    gitBranch: metadata.gitBranch,
    gitSha: metadata.gitSha,
    gitDirty: metadata.gitDirty,
    worktreeFingerprint: metadata.worktreeFingerprint,
    analysisFingerprint: metadata.analysisFingerprint,
    routeCount: metadata.routeCount,
  }
}

function jsonField(input: z.ZodTypeAny): {
  schema: Record<string, unknown>
  required: boolean
} {
  const description = input.description
  let field = input
  let required = true
  if (field instanceof z.ZodOptional) {
    required = false
    field = field.unwrap()
  }

  const schema: Record<string, unknown> = {}
  if (field instanceof z.ZodString) {
    schema.type = 'string'
    for (const check of field._def.checks) {
      if (check.kind === 'min') schema.minLength = check.value
      if (check.kind === 'max') schema.maxLength = check.value
    }
  } else if (field instanceof z.ZodNumber) {
    schema.type = field._def.checks.some((check) => check.kind === 'int')
      ? 'integer'
      : 'number'
    for (const check of field._def.checks) {
      if (check.kind === 'min') schema.minimum = check.value
      if (check.kind === 'max') schema.maximum = check.value
    }
  } else if (field instanceof z.ZodEnum) {
    schema.type = 'string'
    schema.enum = field.options
  } else if (field instanceof z.ZodArray) {
    schema.type = 'array'
    schema.items = jsonField(field.element).schema
    if (field._def.maxLength) schema.maxItems = field._def.maxLength.value
  } else {
    throw new Error(`Unsupported analyzer query schema: ${field._def.typeName}`)
  }
  if (description) schema.description = description
  return { schema, required }
}

function jsonSchema(shape: z.ZodRawShape): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [name, field] of Object.entries(shape)) {
    const result = jsonField(field)
    properties[name] = result.schema
    if (result.required) required.push(name)
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  }
}

const pagingSchema = {
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Zero-based result offset. Default: 0.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Maximum results. Default: ${DEFAULT_LIMIT}; max: ${MAX_LIMIT}.`),
}
const snapshotSchema = z
  .string()
  .max(100)
  .optional()
  .describe('Snapshot ID. Default: `current`.')
const metricSchema = z
  .enum(['raw', 'compressed'])
  .optional()
  .describe('Size metric. Default: `raw`.')
const environmentSchema = z
  .enum(['total', 'client', 'server'])
  .optional()
  .describe('Attribution environment. Default: `total`.')

export function createAnalyzeQueryRegistry(repository: AnalyzeRepository) {
  const queries: StoredQuery[] = []
  function registerQuery<T extends z.ZodRawShape>(
    name: string,
    config: {
      description: string
      inputSchema: T
      example: Record<string, unknown>
    },
    callback: (args: z.infer<z.ZodObject<T>>) => Promise<unknown>
  ) {
    const schema = z.object(config.inputSchema).strict()
    queries.push({
      name,
      description: config.description,
      inputSchema: jsonSchema(config.inputSchema),
      example: config.example,
      execute: (input) => callback(schema.parse(input)),
    })
  }

  registerQuery(
    'get_app_overview',
    {
      description:
        'List analyzer snapshots and rank routes by raw or estimated compressed bundle contribution.',
      inputSchema: {
        snapshot: snapshotSchema,
        environment: z
          .enum(['total', 'client'])
          .optional()
          .describe('Attribution environment. Default: `total`.'),
        metric: metricSchema,
        routeFilter: z.string().max(1000).optional(),
        ...pagingSchema,
      },
      example: { environment: 'client', limit: 10 },
    },
    safeQuery(async (args: OverviewArgs) => {
      const snapshot = await repository.getSnapshot(args.snapshot)
      const snapshots = await repository.listSnapshots()
      const environment = args.environment ?? 'total'
      const metric = args.metric ?? 'raw'
      const filter = args.routeFilter?.toLocaleLowerCase()
      const rows = []
      for (const route of snapshot.routes) {
        if (filter && !route.toLocaleLowerCase().includes(filter)) continue
        const sizes = routeSizes(
          await repository.loadRoute(args.snapshot, route),
          environment
        )
        rows.push({ route, ...sizes })
      }
      rows.sort(
        (a, b) =>
          metricValue(b, metric) - metricValue(a, metric) ||
          compareText(a.route, b.route)
      )
      const paged = page(rows, args.offset ?? 0, args.limit ?? DEFAULT_LIMIT)
      return {
        snapshot: provenance(snapshot.metadata),
        snapshots: {
          current: provenance(snapshots.current),
          history: snapshots.history.map(provenance),
        },
        environment,
        metric,
        resultCounts: {
          routesInSnapshot: snapshot.routes.length,
          matched: rows.length,
        },
        routes: paged.values,
        pagination: paged.pagination,
        caveats: [COMPRESSED_CAVEAT],
      }
    })
  )

  registerQuery(
    'get_route_modules',
    {
      description:
        'Query and rank source or npm-package contributions for one analyzed route.',
      inputSchema: {
        route: z.string().max(4096),
        snapshot: snapshotSchema,
        search: z.string().max(1000).optional(),
        environment: environmentSchema,
        fileTypes: z
          .array(z.enum(['js', 'css', 'json', 'asset']))
          .max(4)
          .optional(),
        groupBy: z
          .enum(['source', 'package'])
          .optional()
          .describe('Result grouping. Default: `source`.'),
        metric: metricSchema,
        ...pagingSchema,
      },
      example: {
        route: '/',
        environment: 'client',
        groupBy: 'package',
        limit: 20,
      },
    },
    safeQuery(async (args: SourcesArgs) => {
      const environment = args.environment ?? 'total'
      const metric = args.metric ?? 'raw'
      const rows = sortBySize(
        collectSources(await repository.loadRoute(args.snapshot, args.route), {
          search: args.search,
          environment,
          fileTypes: args.fileTypes,
          groupBy: args.groupBy ?? 'source',
        }),
        metric
      )
      const paged = page(rows, args.offset ?? 0, args.limit ?? DEFAULT_LIMIT)
      return {
        route: args.route,
        snapshot: provenance(
          (await repository.getSnapshot(args.snapshot)).metadata
        ),
        environment,
        metric,
        groupBy: args.groupBy ?? 'source',
        sources: paged.values.map(({ chunkNames: _chunkNames, ...row }) => row),
        pagination: paged.pagination,
        caveats: [COMPRESSED_CAVEAT],
      }
    })
  )

  registerQuery(
    'get_source_chunks',
    {
      route: z.string().max(4096),
      sourcePath: z.string().max(4096),
      snapshot: snapshotSchema,
      ...pagingSchema,
    },
    safeQuery(async (args: SourceChunksArgs) => {
      const data = await repository.loadRoute(args.snapshot, args.route)
      const sourceIndex = data.getSourceIndexFromPath(args.sourcePath)
      if (sourceIndex === undefined) {
        throw new Error(`Unknown source: ${args.sourcePath}`)
      }
      const byOutput = new Map<
        number,
        { rawSize: number; compressedSize: number }
      >()
      for (const partIndex of data.sourceChunkParts(sourceIndex)) {
        const part = data.chunkPart(partIndex)
        if (!part) continue
        const sizes = byOutput.get(part.output_file_index) ?? {
          rawSize: 0,
          compressedSize: 0,
        }
        sizes.rawSize += part.size
        sizes.compressedSize += part.compressed_size
        byOutput.set(part.output_file_index, sizes)
      }
      const rows = [...byOutput]
        .map(([index, sizes]) => {
          const output = data.outputFile(index)!
          return {
            key: output.filename,
            filename: output.filename,
            kind: outputKind(output.filename),
            environment: outputEnvironment(output.filename),
            ...sizes,
            emissionEvidence: 'emitted' as const,
            requestEvidence: 'unknown' as const,
          }
        })
        .sort((a, b) => compareText(a.filename, b.filename))
      const paged = page(rows, args.offset ?? 0, args.limit ?? DEFAULT_LIMIT)
      return {
        route: args.route,
        sourcePath: args.sourcePath,
        snapshot: provenance(
          (await repository.getSnapshot(args.snapshot)).metadata
        ),
        chunks: paged.values,
        totals: rows.reduce(
          (total, row) => ({
            rawSize: total.rawSize + row.rawSize,
            compressedSize: total.compressedSize + row.compressedSize,
            outputCount: total.outputCount + 1,
          }),
          { rawSize: 0, compressedSize: 0, outputCount: 0 }
        ),
        pagination: paged.pagination,
        caveats: [COMPRESSED_CAVEAT],
      }
    })
  )

  registerQuery(
    'get_route_outputs',
    {
      route: z.string().max(4096),
      snapshot: snapshotSchema,
      search: z.string().max(1000).optional(),
      kinds: z
        .array(
          z.enum([
            'js',
            'css',
            'json',
            'font',
            'image',
            'media',
            'wasm',
            'other',
          ])
        )
        .max(8)
        .optional(),
      environment: environmentSchema,
      groupBy: z.enum(['file', 'kind', 'environment']).optional(),
      metric: metricSchema,
      ...pagingSchema,
    },
    safeQuery(async (args: RouteOutputsArgs) => {
      const data = await repository.loadRoute(args.snapshot, args.route)
      const environment = args.environment ?? 'total'
      const groupBy = args.groupBy ?? 'file'
      const metric = args.metric ?? 'raw'
      const search = args.search?.toLocaleLowerCase()
      const files = Array.from(
        { length: data.outputFileCount() },
        (_, index) => {
          const filename = data.outputFile(index)!.filename
          return {
            key: filename,
            filename,
            kind: outputKind(filename),
            environment: outputEnvironment(filename),
            ...outputSizes(data, index),
            outputCount: 1,
            emissionEvidence: 'emitted' as const,
            requestEvidence: 'unknown' as const,
          }
        }
      ).filter(
        (row) =>
          (!search || row.filename.toLocaleLowerCase().includes(search)) &&
          (!args.kinds?.length || args.kinds.includes(row.kind)) &&
          (environment === 'total' || row.environment === environment)
      )
      const grouped = new Map<string, (typeof files)[number]>()
      for (const row of files) {
        const key =
          groupBy === 'kind'
            ? row.kind
            : groupBy === 'environment'
              ? row.environment
              : row.filename
        const existing = grouped.get(key)
        if (existing) {
          existing.rawSize += row.rawSize
          existing.compressedSize += row.compressedSize
          existing.outputCount += 1
        } else {
          grouped.set(key, { ...row, key })
        }
      }
      const rows = [...grouped.values()].sort(
        (a, b) =>
          metricValue(b, metric) - metricValue(a, metric) ||
          compareText(a.key, b.key)
      )
      const paged = page(rows, args.offset ?? 0, args.limit ?? DEFAULT_LIMIT)
      return {
        route: args.route,
        snapshot: provenance(
          (await repository.getSnapshot(args.snapshot)).metadata
        ),
        environment,
        groupBy,
        metric,
        outputs: paged.values,
        totals: files.reduce(
          (total, row) => ({
            rawSize: total.rawSize + row.rawSize,
            compressedSize: total.compressedSize + row.compressedSize,
            outputCount: total.outputCount + 1,
          }),
          { rawSize: 0, compressedSize: 0, outputCount: 0 }
        ),
        pagination: paged.pagination,
        caveats: [
          COMPRESSED_CAVEAT,
          'Emitted outputs are not observed browser requests.',
        ],
      }
    })
  )

  registerQuery(
    'get_css_assets',
    {
      route: z.string().max(4096),
      snapshot: snapshotSchema,
      cssSearch: z.string().max(1000).optional(),
      assetKinds: z
        .array(z.enum(['font', 'image', 'media']))
        .max(3)
        .optional(),
      ...pagingSchema,
    },
    safeQuery(async (args: CssAssetsArgs) => {
      const data = await repository.loadRoute(args.snapshot, args.route)
      const available = data.hasOutputFileReferences()
      const search = args.cssSearch?.toLocaleLowerCase()
      const kinds = args.assetKinds ?? ['font', 'image', 'media']
      const rows: Array<{
        key: string
        cssFilename: string
        assetFilename: string
        assetKind: 'font' | 'image' | 'media'
        rawSize: number
        compressedSize: number
        relationshipEvidence: 'output-reference'
        emissionEvidence: 'emitted'
        requestEvidence: 'unknown'
      }> = []
      if (available) {
        for (let cssIndex = 0; cssIndex < data.outputFileCount(); cssIndex++) {
          const css = data.outputFile(cssIndex)!
          if (
            outputKind(css.filename) !== 'css' ||
            (search && !css.filename.toLocaleLowerCase().includes(search))
          ) {
            continue
          }
          for (const assetIndex of data.outputFileReferences(cssIndex)) {
            const asset = data.outputFile(assetIndex)
            if (!asset) continue
            const kind = outputKind(asset.filename)
            if (kind !== 'font' && kind !== 'image' && kind !== 'media')
              continue
            if (!kinds.includes(kind)) continue
            rows.push({
              key: `${css.filename}\0${asset.filename}`,
              cssFilename: css.filename,
              assetFilename: asset.filename,
              assetKind: kind,
              ...outputSizes(data, assetIndex),
              relationshipEvidence: 'output-reference',
              emissionEvidence: 'emitted',
              requestEvidence: 'unknown',
            })
          }
        }
      }
      rows.sort((a, b) => compareText(a.key, b.key))
      const paged = page(rows, args.offset ?? 0, args.limit ?? DEFAULT_LIMIT)
      return {
        route: args.route,
        snapshot: provenance(
          (await repository.getSnapshot(args.snapshot)).metadata
        ),
        relationshipEvidence: available ? 'output-reference' : 'unavailable',
        assets: paged.values,
        totals: rows.reduce(
          (totals, row) => {
            totals.rawSize += row.rawSize
            totals.compressedSize += row.compressedSize
            totals.assetCount++
            totals.byKind[row.assetKind]++
            return totals
          },
          {
            rawSize: 0,
            compressedSize: 0,
            assetCount: 0,
            byKind: { font: 0, image: 0, media: 0 },
          }
        ),
        pagination: paged.pagination,
        caveats: [
          COMPRESSED_CAVEAT,
          'Output references prove emitted relationships, not browser requests or timing.',
        ],
      }
    })
  )

  registerQuery(
    'explain_route_module',
    {
      description:
        'Explain one source contribution and return a bounded importer chain toward an exact route entry.',
      inputSchema: {
        route: z.string().max(4096),
        sourcePath: z.string().max(4096),
        snapshot: snapshotSchema,
        moduleIdent: z.string().max(4096).optional(),
        routeEntryId: z.string().max(8192).optional(),
        importerModuleIdent: z.string().max(4096).optional(),
        environment: environmentSchema,
        maxDepth: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum importer-chain depth. Default: 25.'),
      },
      example: { route: '/', sourcePath: '[project]/src/app/page.tsx' },
      caveats: [COMPRESSED_CAVEAT, ENTRY_HEURISTIC_CAVEAT],
    },
    safeQuery(async (args: ExplainArgs) => {
      const environment = args.environment ?? 'total'
      const data = await repository.loadRoute(args.snapshot, args.route)
      const sourceIndex = data.getSourceIndexFromPath(args.sourcePath)
      if (sourceIndex === undefined)
        throw new Error(`Unknown source: ${args.sourcePath}`)
      const modules = await repository.loadModules(args.snapshot)
      const candidates = modules
        .getModuleIndiciesFromPath(args.sourcePath)
        .filter((index) => {
          const module = modules.module(index)
          return module && moduleMatchesEnvironment(module.ident, environment)
        })
        .map((index) => ({ index, module: moduleIdentity(modules, index)! }))
        .sort(
          (a, b) =>
            compareText(a.module.ident, b.module.ident) ||
            compareText(a.module.path, b.module.path)
        )
      const publicCandidates = candidates
        .slice(0, MAX_MODULE_CANDIDATES)
        .map(({ module }) => module)
      const selected = args.moduleIdent
        ? candidates.find(({ module }) => module.ident === args.moduleIdent)
        : candidates.length === 1
          ? candidates[0]
          : undefined
      if (args.moduleIdent && !selected) {
        throw new Error(
          'moduleIdent does not match a module candidate for this source'
        )
      }
      const sizes = sourceSizes(data, sourceIndex, environment)
      const flags = data.getSourceFlags(sourceIndex)
      const chunks = data.sourceChunks(sourceIndex)
      const entryResolution = resolveRouteEntries(
        modules,
        data,
        args.routeEntryId
      )
      const entries = entryResolution.entries
      const routeGraph = routeModules(modules, entries)
      const reachable = routeGraph.modules
      const importerCandidates = selected
        ? [
            ...modules.moduleDependents(selected.index),
            ...modules.asyncModuleDependents(selected.index),
            ...modules.tracedModuleDependents(selected.index),
          ]
            .filter(
              (index, position, values) =>
                reachable.has(index) && values.indexOf(index) === position
            )
            .map((index) => ({
              index,
              module: moduleIdentity(modules, index)!,
            }))
            .sort((a, b) => compareText(a.module.ident, b.module.ident))
        : []
      const selectedImporter = args.importerModuleIdent
        ? importerCandidates.find(
            ({ module }) => module.ident === args.importerModuleIdent
          )
        : undefined
      if (args.importerModuleIdent && !selectedImporter) {
        throw new DetailedToolError(
          'importerModuleIdent is not an immediate importer candidate',
          { importerCandidates: importerCandidates.map(({ module }) => module) }
        )
      }
      const routeEntryAmbiguous =
        !entryResolution.heuristic &&
        entryResolution.candidates.length > 1 &&
        !args.routeEntryId
      const importerChain = selected
        ? findImporterChain(
            modules,
            selected.index,
            entries,
            reachable,
            args.maxDepth ?? 25,
            routeGraph.truncated,
            selectedImporter?.index
          )
        : undefined
      const pathEvidence = importerChain
        ? loadPathEvidence(importerChain)
        : undefined
      const response = {
        route: args.route,
        snapshot: provenance(
          (await repository.getSnapshot(args.snapshot)).metadata
        ),
        sourcePath: args.sourcePath,
        ...sizes,
        flags: {
          client: flags.client,
          server: flags.server,
          traced: flags.traced,
        },
        chunkCount: chunks.length,
        moduleCandidates: publicCandidates,
        moduleCandidateCount: candidates.length,
        moduleCandidatesTruncated: candidates.length > MAX_MODULE_CANDIDATES,
        ambiguous: candidates.length > 1 && !args.moduleIdent,
        routeEntryAmbiguous,
        selectedModule: selected?.module,
        importerCandidates: importerCandidates.map(({ module }) => module),
        selectedImporter: selectedImporter?.module,
        importerChain,
        ...pathEvidence,
        routeEntries: entryResolution.candidates.map(
          ({ index: _index, ...entry }) => entry
        ),
        selectedRouteEntryId: args.routeEntryId,
        routeEntryDetection: { heuristic: entryResolution.heuristic },
        caveats: [COMPRESSED_CAVEAT, ENTRY_HEURISTIC_CAVEAT],
      }
      return response
    })
  )

  registerQuery(
    'get_initial_import_graph',
    {
      route: z.string().max(4096),
      sourcePath: z.string().max(4096),
      snapshot: snapshotSchema,
      moduleIdent: z.string().max(4096).optional(),
      routeEntryId: z.string().max(8192).optional(),
      environment: environmentSchema,
    },
    safeQuery(async (args: InitialGraphArgs) => {
      const environment = args.environment ?? 'client'
      const data = await repository.loadRoute(args.snapshot, args.route)
      if (data.getSourceIndexFromPath(args.sourcePath) === undefined) {
        throw new Error(`Unknown source: ${args.sourcePath}`)
      }
      const modules = await repository.loadModules(args.snapshot)
      const selected = selectModuleCandidate(
        modules,
        args.sourcePath,
        args.moduleIdent,
        environment
      )
      const entryResolution = resolveRouteEntries(
        modules,
        data,
        args.routeEntryId
      )
      const analysis = analyzeInitialGraph(
        data,
        modules,
        entryResolution.entries,
        selected.index,
        environment
      )
      const graphNodes = [...analysis.predecessorNodes]
        .sort((a, b) => a - b)
        .map((index) => ({ id: index, ...moduleIdentity(modules, index)! }))
      const sccByNode = new Map<number, number>()
      for (const component of analysis.sccs) {
        for (const member of component.members) {
          sccByNode.set(member, component.id)
        }
      }
      const edges = analysis.edges.map((edge) => {
        const rawSize = edge.leavingSources.reduce(
          (total, source) => total + source.rawSize,
          0
        )
        const compressedSize = edge.leavingSources.reduce(
          (total, source) => total + source.compressedSize,
          0
        )
        return {
          edgeId: edge.edgeId,
          from: { id: edge.from, ...moduleIdentity(modules, edge.from)! },
          to: { id: edge.to, ...moduleIdentity(modules, edge.to)! },
          fromSccId: sccByNode.get(edge.from),
          toSccId: sccByNode.get(edge.to),
          targetRemainsInitial: !edge.leavingModules.includes(
            analysis.targetIndex
          ),
          leavingInitialModuleCount: edge.leavingModules.length,
          leavingInitialSourceCount: edge.leavingSources.length,
          leavingInitialPackageCount: new Set(
            edge.leavingSources
              .map((source) => source.packageName)
              .filter(Boolean)
          ).size,
          leavingInitialRawSize: rawSize,
          leavingInitialCompressedSize: compressedSize,
        }
      })
      return {
        route: args.route,
        sourcePath: args.sourcePath,
        selectedModule: selected.module,
        selectedRouteEntryId: args.routeEntryId,
        routeEntries: entryResolution.candidates.map(
          ({ index: _index, ...entry }) => entry
        ),
        routeEntryDetection: { heuristic: entryResolution.heuristic },
        environment,
        snapshot: provenance(
          (await repository.getSnapshot(args.snapshot)).metadata
        ),
        graph: {
          complete: true,
          nodes: graphNodes,
          edges,
          sccs: analysis.sccs,
          sccEvidence: analysis.sccEvidence,
        },
        caveats: [COMPRESSED_CAVEAT],
      }
    })
  )

  registerQuery(
    'analyze_import_edge',
    {
      route: z.string().max(4096),
      sourcePath: z.string().max(4096),
      edgeId: z
        .string()
        .max(100)
        .regex(/^\d+:\d+$/),
      snapshot: snapshotSchema,
      moduleIdent: z.string().max(4096).optional(),
      routeEntryId: z.string().max(8192).optional(),
      environment: environmentSchema,
      granularity: z.enum(['module', 'source', 'package']).optional(),
      ...pagingSchema,
    },
    safeQuery(async (args: ImportEdgeArgs) => {
      const environment = args.environment ?? 'client'
      const granularity = args.granularity ?? 'source'
      const data = await repository.loadRoute(args.snapshot, args.route)
      const modules = await repository.loadModules(args.snapshot)
      const selected = selectModuleCandidate(
        modules,
        args.sourcePath,
        args.moduleIdent,
        environment
      )
      const entryResolution = resolveRouteEntries(
        modules,
        data,
        args.routeEntryId
      )
      const analysis = analyzeInitialGraph(
        data,
        modules,
        entryResolution.entries,
        selected.index,
        environment
      )
      const edge = analysis.edges.find(
        (candidate) => candidate.edgeId === args.edgeId
      )
      if (!edge) {
        throw new DetailedToolError(
          'Unknown synchronous edge for selected graph',
          {
            availableEdgeIds: analysis.edges.map(
              (candidate) => candidate.edgeId
            ),
          }
        )
      }
      let rows: Array<Record<string, unknown> & { key: string }>
      if (granularity === 'module') {
        rows = edge.leavingModules
          .map((index) => ({
            key: modules.module(index)!.ident,
            moduleId: index,
            ...moduleIdentity(modules, index)!,
          }))
          .sort((a, b) => compareText(a.key, b.key))
      } else if (granularity === 'package') {
        const packages = new Map<
          string,
          {
            key: string
            packageName: string
            rawSize: number
            compressedSize: number
            sourceCount: number
          }
        >()
        for (const source of edge.leavingSources) {
          const key = source.packageName ?? '(project)'
          const existing = packages.get(key) ?? {
            key,
            packageName: key,
            rawSize: 0,
            compressedSize: 0,
            sourceCount: 0,
          }
          existing.rawSize += source.rawSize
          existing.compressedSize += source.compressedSize
          existing.sourceCount++
          packages.set(key, existing)
        }
        rows = [...packages.values()].sort((a, b) => compareText(a.key, b.key))
      } else {
        rows = edge.leavingSources
      }
      const paged = page(rows, args.offset ?? 0, args.limit ?? DEFAULT_LIMIT)
      return {
        route: args.route,
        sourcePath: args.sourcePath,
        edgeId: edge.edgeId,
        edge: {
          from: { id: edge.from, ...moduleIdentity(modules, edge.from)! },
          to: { id: edge.to, ...moduleIdentity(modules, edge.to)! },
        },
        granularity,
        environment,
        targetRemainsInitial: !edge.leavingModules.includes(
          analysis.targetIndex
        ),
        totals: {
          moduleCount: edge.leavingModules.length,
          sourceCount: edge.leavingSources.length,
          packageCount: new Set(
            edge.leavingSources
              .map((source) => source.packageName)
              .filter(Boolean)
          ).size,
          rawSize: edge.leavingSources.reduce(
            (total, source) => total + source.rawSize,
            0
          ),
          compressedSize: edge.leavingSources.reduce(
            (total, source) => total + source.compressedSize,
            0
          ),
        },
        rows: paged.values,
        pagination: paged.pagination,
        snapshot: provenance(
          (await repository.getSnapshot(args.snapshot)).metadata
        ),
        caveats: [COMPRESSED_CAVEAT],
      }
    })
  )

  registerQuery(
    'compare_bundles',
    {
      description:
        'Compare two analyzer snapshots at route, source, or npm-package granularity.',
      inputSchema: {
        baselineSnapshot: z
          .string()
          .max(100)
          .describe('Required historical snapshot ID from get_app_overview.'),
        comparisonSnapshot: snapshotSchema,
        granularity: z
          .enum(['route', 'source', 'package'])
          .optional()
          .describe('Comparison granularity. Default: `route`.'),
        route: z.string().max(4096).optional(),
        environment: environmentSchema,
        metric: metricSchema,
        search: z.string().max(1000).optional(),
        ...pagingSchema,
      },
      example: {
        baselineSnapshot: '20260917-201045-abcdef0',
        comparisonSnapshot: 'current',
        limit: 20,
      },
    },
    safeQuery(async (args: CompareArgs) => {
      const granularity = args.granularity ?? 'route'
      const environment = args.environment ?? 'total'
      const metric = args.metric ?? 'raw'
      const baseline = await repository.getSnapshot(args.baselineSnapshot)
      const comparison = await repository.getSnapshot(args.comparisonSnapshot)
      const search = args.search?.toLocaleLowerCase()
      let rows: DiffInput[]
      if (granularity === 'route') {
        if (environment === 'server') {
          throw new Error(
            'Route comparisons support total or client environments'
          )
        }
        const keys = [...new Set([...baseline.routes, ...comparison.routes])]
          .filter(
            (route) => !search || route.toLocaleLowerCase().includes(search)
          )
          .sort()
        rows = []
        for (const route of keys) {
          const baselineSizes = baseline.routes.includes(route)
            ? routeSizes(
                await repository.loadRoute(args.baselineSnapshot, route),
                environment
              )
            : { rawSize: 0, compressedSize: 0 }
          const comparisonSizes = comparison.routes.includes(route)
            ? routeSizes(
                await repository.loadRoute(args.comparisonSnapshot, route),
                environment
              )
            : { rawSize: 0, compressedSize: 0 }
          rows.push({
            key: route,
            baselinePresent: baseline.routes.includes(route),
            comparisonPresent: comparison.routes.includes(route),
            baselineRawSize: baselineSizes.rawSize,
            comparisonRawSize: comparisonSizes.rawSize,
            baselineCompressedSize: baselineSizes.compressedSize,
            comparisonCompressedSize: comparisonSizes.compressedSize,
          })
        }
      } else {
        if (!args.route)
          throw new Error('route is required for source/package comparisons')
        const groupBy = granularity === 'package' ? 'package' : 'source'
        const inBaseline = baseline.routes.includes(args.route)
        const inComparison = comparison.routes.includes(args.route)
        if (!inBaseline && !inComparison) {
          throw new Error(`Unknown route: ${args.route}`)
        }
        const baselineRows = new Map(
          (inBaseline
            ? collectSources(
                await repository.loadRoute(args.baselineSnapshot, args.route),
                { search: args.search, environment, groupBy }
              )
            : []
          ).map((row) => [row.key, row])
        )
        const comparisonRows = new Map(
          (inComparison
            ? collectSources(
                await repository.loadRoute(args.comparisonSnapshot, args.route),
                { search: args.search, environment, groupBy }
              )
            : []
          ).map((row) => [row.key, row])
        )
        rows = [...new Set([...baselineRows.keys(), ...comparisonRows.keys()])]
          .sort()
          .map((key) => {
            const a = baselineRows.get(key)
            const b = comparisonRows.get(key)
            return {
              key,
              baselinePresent: a !== undefined,
              comparisonPresent: b !== undefined,
              baselineRawSize: a?.rawSize ?? 0,
              comparisonRawSize: b?.rawSize ?? 0,
              baselineCompressedSize: a?.compressedSize ?? 0,
              comparisonCompressedSize: b?.compressedSize ?? 0,
            }
          })
      }
      const worktreeEvidenceAvailable =
        baseline.metadata.worktreeFingerprint !== undefined &&
        comparison.metadata.worktreeFingerprint !== undefined
      const analysisEvidenceAvailable =
        baseline.metadata.analysisFingerprint !== undefined &&
        comparison.metadata.analysisFingerprint !== undefined
      const compatibility = {
        sameSourceState: worktreeEvidenceAvailable
          ? baseline.metadata.gitSha === comparison.metadata.gitSha &&
            baseline.metadata.worktreeFingerprint!.digest ===
              comparison.metadata.worktreeFingerprint!.digest
          : undefined,
        sameAnalyzerOptions:
          baseline.metadata.appDirOnly === comparison.metadata.appDirOnly &&
          baseline.metadata.noMangling === comparison.metadata.noMangling,
        sameNextVersion:
          baseline.metadata.nextVersion !== undefined &&
          comparison.metadata.nextVersion !== undefined
            ? baseline.metadata.nextVersion === comparison.metadata.nextVersion
            : undefined,
        sameAnalysisData: analysisEvidenceAvailable
          ? baseline.metadata.analysisFingerprint!.digest ===
            comparison.metadata.analysisFingerprint!.digest
          : undefined,
        evidenceAvailable: {
          worktree: worktreeEvidenceAvailable,
          analysis: analysisEvidenceAvailable,
        },
      }
      const compatibilityWarnings = Object.entries(compatibility)
        .filter(
          ([name, value]) => name !== 'evidenceAvailable' && value === false
        )
        .map(([name]) => `${name} differs between snapshots`)
      return {
        granularity,
        route: args.route,
        environment,
        metric,
        baseline: provenance(baseline.metadata),
        comparison: provenance(comparison.metadata),
        compatibility,
        compatibilityWarnings,
        ...summarizeDiff(
          rows,
          metric,
          args.offset ?? 0,
          args.limit ?? DEFAULT_LIMIT
        ),
        caveats: [COMPRESSED_CAVEAT],
      }
    })
  )

  return new AnalyzeQueryRegistry(queries)
}

export const analyzeQueryTestHelpers = {
  edgeDominatedModules,
  stronglyConnectedComponents,
  synchronousComponents,
}
