import { readFileSync, writeSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const UINT32_LIMIT = 0x1_0000_0000

type EdgeRef = { offset: number; length: number }
type Module = { ident: string; path: string }
type Source = { parent_source_index: number | null; path: string }
type Part = {
  source_index: number
  output_file_index: number
  size: number
  compressed_size: number
}
type ModuleHeader = {
  schema_version: number
  module_index_hash: string
  modules: Module[]
  module_dependencies: EdgeRef
  async_module_dependencies: EdgeRef
  traced_module_dependencies: EdgeRef
}
type RouteHeader = {
  schema_version: number
  module_index_hash: string
  sources: Source[]
  chunk_parts: Part[]
  output_files: Array<{ filename: string }>
  route_entries?: Array<{
    route_entry_id: string
    module_ident: string
    module_path: string
    role: string
    entry_kind?: string
    client_references?: Array<{
      module_ident: string
      module_path: string
      reference_kind: string
    }>
  }>
  output_file_modules: EdgeRef
  output_file_module_coverage: Array<'exact' | 'unsupported' | 'not_a_chunk'>
  unjoined_modules: Array<{
    output_file_index: number
    module_ident: string
    reason: string
  }>
}

type Data<H> = { header: H; binary: Buffer }
function integer(value: number, limit: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value < limit
}
function requireIndex(value: number, limit: number, label: string): void {
  if (!integer(value, limit))
    throw new Error(`Invalid ${label} index: ${value}`)
}

function readData<H extends { schema_version: number }>(file: string): Data<H> {
  const data = readFileSync(file)
  if (data.length < 4) throw new Error(`Truncated analyzer header: ${file}`)
  const length = data.readUInt32BE(0)
  if (length === 0 || length > data.length - 4) {
    throw new Error(`Invalid analyzer header length: ${file}`)
  }
  const header = JSON.parse(data.toString('utf8', 4, 4 + length)) as H
  if (!header || typeof header !== 'object') {
    throw new Error(`Invalid analyzer header: ${file}`)
  }
  if (header.schema_version !== 1) {
    throw new Error(
      `Unsupported analyzer schema ${String(header.schema_version)}: ${file}`
    )
  }
  return { header, binary: data.subarray(4 + length) }
}

/** Read the consumed dependency rows, checking their binary ranges and targets. */
function validateEdges(
  binary: Buffer,
  ref: EdgeRef,
  rows: number,
  targets: number,
  label: string
): { row(index: number): number[] } {
  if (
    !ref ||
    !integer(ref.offset, binary.length + 1) ||
    !integer(ref.length, binary.length + 1) ||
    ref.length < 4 ||
    ref.offset + ref.length > binary.length
  ) {
    throw new Error(`Invalid ${label} section`)
  }
  const count = binary.readUInt32BE(ref.offset)
  if (count !== rows || ref.length < 4 + 4 * count) {
    throw new Error(`Invalid ${label} row count`)
  }
  const offsets: number[] = []
  let previous = 0
  for (let i = 0; i < count; i++) {
    const offset = binary.readUInt32BE(ref.offset + 4 + i * 4)
    if (offset < previous || 4 + 4 * count + 4 * offset > ref.length) {
      throw new Error(`Invalid ${label} offsets`)
    }
    offsets.push(offset)
    previous = offset
  }
  if (4 + 4 * count + 4 * previous !== ref.length) {
    throw new Error(`Invalid ${label} section length`)
  }
  const dataStart = ref.offset + 4 + 4 * count
  for (let i = 0; i < previous; i++) {
    requireIndex(binary.readUInt32BE(dataStart + i * 4), targets, label)
  }
  return {
    row(index) {
      const start = index === 0 ? 0 : offsets[index - 1]
      const result: number[] = []
      for (let i = start; i < offsets[index]; i++) {
        result.push(binary.readUInt32BE(dataStart + i * 4))
      }
      return result
    },
  }
}

function sourcePaths(sources: Source[]): string[] {
  const paths: Array<string | undefined> = Array(sources.length)
  const visiting = new Set<number>()
  function path(index: number): string {
    requireIndex(index, sources.length, 'source')
    if (paths[index] !== undefined) return paths[index]
    if (visiting.has(index)) throw new Error('Cyclic analyzer source tree')
    visiting.add(index)
    const source = sources[index]
    if (typeof source.path !== 'string') throw new Error('Invalid source path')
    const parent = source.parent_source_index
    paths[index] = parent === null ? source.path : path(parent) + source.path
    visiting.delete(index)
    return paths[index]
  }
  return sources.map((_, i) => path(i))
}

function routeFile(directory: string, route: string): string {
  if (
    !route.startsWith('/') ||
    route.includes('\\') ||
    route.includes('\0') ||
    route.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    throw new Error(`Invalid analyzer route: ${route}`)
  }
  const file = resolve(directory, route.slice(1), 'analyze.data')
  if (!file.startsWith(resolve(directory) + sep)) {
    throw new Error(`Analyzer route escapes snapshot: ${route}`)
  }
  return file
}

function parseModules(file: string) {
  const { header, binary } = readData<ModuleHeader>(file)
  if (!Array.isArray(header.modules))
    throw new Error('Missing analyzer modules')
  const modules = header.modules
  const ids = new Set<string>()
  for (const module of modules) {
    if (
      typeof module.ident !== 'string' ||
      typeof module.path !== 'string' ||
      ids.has(module.ident)
    ) {
      throw new Error('Invalid or duplicated analyzer module identity')
    }
    ids.add(module.ident)
  }
  const edges = {} as Record<
    'sync' | 'async' | 'traced',
    ReturnType<typeof validateEdges>
  >
  for (const [kind, field] of [
    ['sync', 'module_dependencies'],
    ['async', 'async_module_dependencies'],
    ['traced', 'traced_module_dependencies'],
  ] as const) {
    edges[kind] = validateEdges(
      binary,
      header[field],
      modules.length,
      modules.length,
      field
    )
  }
  if (typeof header.module_index_hash !== 'string' || !header.module_index_hash)
    throw new Error('Missing analyzer module-index fingerprint')
  return { modules, edges, hash: header.module_index_hash }
}

function parseRoutes(file: string, modules: ReturnType<typeof parseModules>) {
  const { header, binary } = readData<RouteHeader>(file)
  if (
    !Array.isArray(header.sources) ||
    !Array.isArray(header.output_files) ||
    !Array.isArray(header.chunk_parts)
  ) {
    throw new Error('Invalid analyzer route header')
  }
  const paths = sourcePaths(header.sources)
  const outputs = header.output_files
  const parts = header.chunk_parts
  for (const part of parts) {
    requireIndex(part.source_index, paths.length, 'part source')
    requireIndex(part.output_file_index, outputs.length, 'part output')
    if (
      !integer(part.size, UINT32_LIMIT) ||
      !integer(part.compressed_size, UINT32_LIMIT)
    ) {
      throw new Error('Invalid analyzer part size')
    }
  }
  if (header.module_index_hash !== modules.hash) {
    throw new Error('Analyzer module-index fingerprint mismatch')
  }
  const membership = validateEdges(
    binary,
    header.output_file_modules,
    outputs.length,
    modules.modules.length,
    'output modules'
  )
  if (
    !Array.isArray(header.output_file_module_coverage) ||
    header.output_file_module_coverage.length !== outputs.length
  ) {
    throw new Error('Missing analyzer output coverage')
  }
  if (
    header.output_file_module_coverage.some(
      (coverage) =>
        coverage !== 'exact' &&
        coverage !== 'unsupported' &&
        coverage !== 'not_a_chunk'
    )
  ) {
    throw new Error('Invalid analyzer output coverage')
  }
  for (const output of outputs)
    if (typeof output.filename !== 'string')
      throw new Error('Invalid output filename')
  if (!Array.isArray(header.unjoined_modules))
    throw new Error('Missing unjoined analyzer modules')
  const unjoined = header.unjoined_modules.map((item) => {
    requireIndex(item.output_file_index, outputs.length, 'unjoined output')
    if (
      typeof item.module_ident !== 'string' ||
      typeof item.reason !== 'string'
    ) {
      throw new Error('Invalid unjoined analyzer module')
    }
    return {
      filename: outputs[item.output_file_index].filename,
      module_ident: item.module_ident,
      reason: item.reason,
    }
  })
  return {
    paths,
    header,
    entries: routeEntries(header.route_entries),
    membership,
    unjoined,
  }
}

function routeEntries(entries: RouteHeader['route_entries']) {
  if (entries === undefined) return null
  if (!Array.isArray(entries)) throw new Error('Invalid analyzer route entries')
  return entries.map((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.route_entry_id !== 'string' ||
      typeof entry.module_ident !== 'string' ||
      typeof entry.module_path !== 'string' ||
      typeof entry.role !== 'string' ||
      (entry.entry_kind !== undefined &&
        typeof entry.entry_kind !== 'string') ||
      (entry.client_references !== undefined &&
        !Array.isArray(entry.client_references))
    ) {
      throw new Error('Invalid analyzer route entry')
    }
    return {
      route_entry_id: entry.route_entry_id,
      module_ident: entry.module_ident,
      module_path: entry.module_path,
      role: entry.role,
      entry_kind: entry.entry_kind ?? null,
      client_references: (entry.client_references ?? []).map((ref) => {
        if (
          !ref ||
          typeof ref !== 'object' ||
          typeof ref.module_ident !== 'string' ||
          typeof ref.module_path !== 'string' ||
          typeof ref.reference_kind !== 'string'
        ) {
          throw new Error('Invalid analyzer client reference')
        }
        return {
          module_ident: ref.module_ident,
          module_path: ref.module_path,
          reference_kind: ref.reference_kind,
        }
      }),
    }
  })
}

function writeRecord(record: object): void {
  const data = Buffer.from(JSON.stringify(record) + '\n')
  let offset = 0
  while (offset < data.length) {
    const written = writeSync(1, data, offset, data.length - offset)
    if (written === 0)
      throw new Error('Could not write analyzer export to stdout')
    offset += written
  }
}

/** Read/validate the private UI format, and expose only versioned semantic records. */
export function dumpAnalyzeGraph(
  directory: string,
  snapshotName: string,
  routeFilter: string | undefined
): void {
  // Pipe stdout must block so writeSync supplies backpressure rather than EAGAIN.
  if (process.stdout._handle != null) {
    // @ts-ignore Node's internal handle, also used by the native bindings loader.
    process.stdout._handle.setBlocking?.(true)
  }
  const routes = JSON.parse(
    readFileSync(join(directory, 'routes.json'), 'utf8')
  ) as string[]
  if (
    !Array.isArray(routes) ||
    routes.some((route) => typeof route !== 'string')
  ) {
    throw new Error('Invalid analyzer routes')
  }
  const selected = routes.filter(
    (route) => routeFilter === undefined || route === routeFilter
  )
  if (routeFilter !== undefined && selected.length === 0)
    throw new Error(`Unknown analyzer route: ${routeFilter}`)
  const moduleData = parseModules(join(directory, 'modules.data'))
  const { modules, edges, hash } = moduleData
  writeRecord({
    type: 'meta',
    schema_version: 1,
    snapshot_name: snapshotName,
    module_index_hash: hash,
    route_count: routes.length,
    selected_routes: selected.length,
  })
  for (const [index, module] of modules.entries()) {
    writeRecord({
      type: 'module',
      ident: module.ident,
      path: module.path,
      dependencies: Object.fromEntries(
        (['sync', 'async', 'traced'] as const).map((kind) => [
          kind,
          edges[kind].row(index).map((i) => modules[i].ident),
        ])
      ),
    })
  }
  // Retain only the current route's data. A later validation error may leave
  // partial output; callers must check the exit status before using it.
  for (const route of selected) {
    const { paths, header, entries, membership, unjoined } = parseRoutes(
      routeFile(directory, route),
      moduleData
    )
    const prefix = { route }
    writeRecord({
      type: 'route',
      ...prefix,
      entries,
      coverage: { entries: entries ? 'exact' : 'unknown' },
    })
    for (let i = 0; i < header.output_files.length; i++) {
      writeRecord({
        type: 'output',
        ...prefix,
        filename: header.output_files[i].filename,
        modules: membership.row(i).map((id) => modules[id].ident),
        coverage: header.output_file_module_coverage[i],
      })
    }
    for (const part of header.chunk_parts) {
      writeRecord({
        type: 'part',
        ...prefix,
        filename: header.output_files[part.output_file_index].filename,
        source_path: paths[part.source_index],
        size: part.size,
        compressed_size: part.compressed_size,
      })
    }
    for (const module of unjoined)
      writeRecord({ type: 'unjoined', ...prefix, ...module })
  }
}
