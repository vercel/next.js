// Type definitions matching the Rust structures from analyze.rs

export type ModuleIndex = number
export type SourceIndex = number

export interface AnalyzeModule {
  ident: string
  path: string
}

export interface AnalyzeSource {
  parent_source_index: number | null
  path: string
}

export interface AnalyzeChunkPart {
  source_index: number
  output_file_index: number
  size: number
  compressed_size: number
}

export interface AnalyzeOutputFile {
  filename: string
}

export interface AnalyzeRouteEntry {
  route_entry_id: string
  module_ident: string
  module_path: string
  role: 'route' | 'shared'
  runtime: string | null
}

export interface AnalyzeLayer {
  name: string
}

interface EdgesDataReference {
  offset: number
  length: number
}

interface AnalyzeDataHeader {
  sources: AnalyzeSource[]
  chunk_parts: AnalyzeChunkPart[]
  output_files: AnalyzeOutputFile[]
  /** Absent in analyzer artifacts produced before exact route-entry support. */
  route_entries?: AnalyzeRouteEntry[]
  output_file_chunk_parts: EdgesDataReference
  source_chunk_parts: EdgesDataReference
  source_children: EdgesDataReference
  source_roots: number[]
}

interface ModulesDataHeader {
  modules: AnalyzeModule[]
  /** Absent in analyzer artifacts produced before petgraph SCC support. */
  sync_scc_ids?: number[]
  module_dependents: EdgesDataReference
  async_module_dependents: EdgesDataReference
  traced_module_dependents: EdgesDataReference
  module_dependencies: EdgesDataReference
  async_module_dependencies: EdgesDataReference
  traced_module_dependencies: EdgesDataReference
}

function parseHeader<T>(buffer: ArrayBuffer, label: string): [T, DataView] {
  if (buffer.byteLength < 4)
    throw new Error(`Invalid ${label}: truncated header`)
  const view = new DataView(buffer)
  const jsonLength = view.getUint32(0, false)
  if (jsonLength > buffer.byteLength - 4) {
    throw new Error(`Invalid ${label}: truncated JSON`)
  }
  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(buffer, 4, jsonLength)
    )
    const header: unknown = JSON.parse(json)
    if (
      typeof header !== 'object' ||
      header === null ||
      Array.isArray(header)
    ) {
      throw new Error()
    }
    return [header as T, new DataView(buffer, 4 + jsonLength)]
  } catch {
    throw new Error(`Invalid ${label}: malformed JSON`)
  }
}

function validateEdges(
  data: DataView,
  reference: EdgesDataReference,
  rows: number,
  targets: number,
  label: string
): void {
  const { offset, length } = reference ?? {}
  if (!Number.isInteger(offset) || !Number.isInteger(length)) {
    throw new Error(`Invalid ${label}: malformed reference`)
  }
  if (length < 4 || offset < 0 || length > data.byteLength - offset) {
    throw new Error(`Invalid ${label}: section out of bounds`)
  }
  const count = data.getUint32(offset, false)
  if (count !== rows || length < 4 + count * 4) {
    throw new Error(`Invalid ${label}: malformed offsets`)
  }
  let previous = 0
  for (let index = 0; index < count; index++) {
    const current = data.getUint32(offset + 4 + index * 4, false)
    if (current < previous)
      throw new Error(`Invalid ${label}: malformed offsets`)
    previous = current
  }
  if (length !== 4 + count * 4 + previous * 4) {
    throw new Error(`Invalid ${label}: malformed edge count`)
  }
  const edgesStart = offset + 4 + count * 4
  for (let index = 0; index < previous; index++) {
    if (data.getUint32(edgesStart + index * 4, false) >= targets) {
      throw new Error(`Invalid ${label}: edge out of range`)
    }
  }
}

function requireArray(
  value: unknown,
  label: string
): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`)
}

/** Represents the global modules data that is shared across all routes. */
export class ModulesData {
  private modulesHeader: ModulesDataHeader
  private modulesBinaryData: DataView
  private pathToModuleIndex: Map<string, ModuleIndex[]>
  private identToModuleIndex: Map<string, ModuleIndex>

  constructor(modulesArrayBuffer: ArrayBuffer) {
    ;[this.modulesHeader, this.modulesBinaryData] =
      parseHeader<ModulesDataHeader>(modulesArrayBuffer, 'modules.data')
    requireArray(this.modulesHeader.modules, 'modules.data modules')
    if (this.modulesHeader.sync_scc_ids !== undefined) {
      requireArray(this.modulesHeader.sync_scc_ids, 'modules.data sync SCC IDs')
      if (
        this.modulesHeader.sync_scc_ids.length !==
          this.modulesHeader.modules.length ||
        this.modulesHeader.sync_scc_ids.some(
          (id) => !Number.isInteger(id) || id < 0
        )
      ) {
        throw new Error('Invalid modules.data sync SCC IDs')
      }
      const distinct = [...new Set(this.modulesHeader.sync_scc_ids)].sort(
        (a, b) => a - b
      )
      if (distinct.some((id, index) => id !== index)) {
        throw new Error('Invalid modules.data sync SCC IDs')
      }
    }
    for (const [name, reference] of Object.entries(this.modulesHeader)) {
      if (name === 'modules' || name === 'sync_scc_ids') continue
      validateEdges(
        this.modulesBinaryData,
        reference as EdgesDataReference,
        this.modulesHeader.modules.length,
        this.modulesHeader.modules.length,
        `modules.data ${name}`
      )
    }

    this.pathToModuleIndex = new Map()
    this.identToModuleIndex = new Map()
    for (let i = 0; i < this.modulesHeader.modules.length; i++) {
      const module = this.modulesHeader.modules[i]
      if (
        typeof module?.ident !== 'string' ||
        typeof module.path !== 'string'
      ) {
        throw new Error('Invalid modules.data module')
      }
      if (this.identToModuleIndex.has(module.ident)) {
        throw new Error('Invalid modules.data duplicate module identity')
      }
      this.identToModuleIndex.set(module.ident, i)
      const existing = this.pathToModuleIndex.get(module.path)
      if (existing) {
        existing.push(i)
      } else {
        this.pathToModuleIndex.set(module.path, [i])
      }
    }
  }

  module(index: ModuleIndex): AnalyzeModule | undefined {
    return this.modulesHeader.modules[index]
  }

  moduleCount(): number {
    return this.modulesHeader.modules.length
  }

  getModuleIndiciesFromPath(path: string): ModuleIndex[] {
    return this.pathToModuleIndex.get(path) ?? []
  }

  getModuleIndexFromIdent(ident: string): ModuleIndex | undefined {
    return this.identToModuleIndex.get(ident)
  }

  hasExactSyncSccs(): boolean {
    return this.modulesHeader.sync_scc_ids !== undefined
  }

  syncSccId(index: ModuleIndex): number | undefined {
    return this.modulesHeader.sync_scc_ids?.[index]
  }

  private readEdgesDataAtIndex(
    reference: EdgesDataReference,
    index: ModuleIndex
  ): ModuleIndex[] {
    const { offset } = reference
    const numOffsets = this.modulesBinaryData.getUint32(offset, false)

    if (index < 0 || index >= numOffsets) {
      return []
    }

    const offsetsStart = offset + 4
    const prevOffset =
      index === 0
        ? 0
        : this.modulesBinaryData.getUint32(
            offsetsStart + (index - 1) * 4,
            false
          )
    const currentOffset = this.modulesBinaryData.getUint32(
      offsetsStart + index * 4,
      false
    )

    const edgeCount = currentOffset - prevOffset
    if (edgeCount === 0) {
      return []
    }

    const dataStart = offset + 4 + numOffsets * 4
    const edges: number[] = []
    for (let j = 0; j < edgeCount; j++) {
      edges.push(
        this.modulesBinaryData.getUint32(
          dataStart + (prevOffset + j) * 4,
          false
        )
      )
    }

    return edges
  }

  moduleDependents(index: ModuleIndex): ModuleIndex[] {
    return this.readEdgesDataAtIndex(
      this.modulesHeader.module_dependents,
      index
    )
  }

  asyncModuleDependents(index: ModuleIndex): ModuleIndex[] {
    return this.readEdgesDataAtIndex(
      this.modulesHeader.async_module_dependents,
      index
    )
  }

  tracedModuleDependents(index: ModuleIndex): ModuleIndex[] {
    return this.readEdgesDataAtIndex(
      this.modulesHeader.traced_module_dependents,
      index
    )
  }

  moduleDependencies(index: ModuleIndex): ModuleIndex[] {
    return this.readEdgesDataAtIndex(
      this.modulesHeader.module_dependencies,
      index
    )
  }

  asyncModuleDependencies(index: ModuleIndex): ModuleIndex[] {
    return this.readEdgesDataAtIndex(
      this.modulesHeader.async_module_dependencies,
      index
    )
  }

  tracedModuleDependencies(index: ModuleIndex): ModuleIndex[] {
    return this.readEdgesDataAtIndex(
      this.modulesHeader.traced_module_dependencies,
      index
    )
  }

  getRawModulesHeader(): ModulesDataHeader {
    return this.modulesHeader
  }
}

/** Represents route-specific analyze data. */
export class AnalyzeData {
  private analyzeHeader: AnalyzeDataHeader
  private analyzeBinaryData: DataView
  private pathToSourceIndex: Map<string, SourceIndex>

  constructor(analyzeArrayBuffer: ArrayBuffer) {
    ;[this.analyzeHeader, this.analyzeBinaryData] =
      parseHeader<AnalyzeDataHeader>(analyzeArrayBuffer, 'analyze.data')
    const {
      sources,
      chunk_parts: parts,
      output_files: outputs,
    } = this.analyzeHeader
    requireArray(sources, 'analyze.data sources')
    requireArray(parts, 'analyze.data chunk parts')
    requireArray(outputs, 'analyze.data output files')
    requireArray(this.analyzeHeader.source_roots, 'analyze.data source roots')
    if (this.analyzeHeader.route_entries !== undefined) {
      requireArray(
        this.analyzeHeader.route_entries,
        'analyze.data route entries'
      )
      const ids = new Set<string>()
      for (const entry of this.analyzeHeader.route_entries) {
        if (
          typeof entry?.route_entry_id !== 'string' ||
          !entry.route_entry_id ||
          typeof entry.module_ident !== 'string' ||
          !entry.module_ident ||
          typeof entry.module_path !== 'string' ||
          (entry.role !== 'route' && entry.role !== 'shared') ||
          (entry.runtime !== null && typeof entry.runtime !== 'string') ||
          ids.has(entry.route_entry_id)
        ) {
          throw new Error('Invalid analyze.data route entry')
        }
        ids.add(entry.route_entry_id)
      }
    }
    validateEdges(
      this.analyzeBinaryData,
      this.analyzeHeader.output_file_chunk_parts,
      outputs.length,
      parts.length,
      'analyze.data output chunks'
    )
    validateEdges(
      this.analyzeBinaryData,
      this.analyzeHeader.source_chunk_parts,
      sources.length,
      parts.length,
      'analyze.data source chunks'
    )
    validateEdges(
      this.analyzeBinaryData,
      this.analyzeHeader.source_children,
      sources.length,
      sources.length,
      'analyze.data source children'
    )
    for (const source of sources) {
      if (
        typeof source?.path !== 'string' ||
        (source.parent_source_index !== null &&
          (!Number.isInteger(source.parent_source_index) ||
            source.parent_source_index < 0 ||
            source.parent_source_index >= sources.length))
      ) {
        throw new Error('Invalid analyze.data source')
      }
    }
    const childParents = new Array(sources.length).fill(-1)
    for (let parent = 0; parent < sources.length; parent++) {
      for (const child of this.sourceChildren(parent)) {
        if (
          childParents[child] !== -1 ||
          sources[child].parent_source_index !== parent
        ) {
          throw new Error('Invalid analyze.data source children')
        }
        childParents[child] = parent
      }
    }
    for (let index = 0; index < sources.length; index++) {
      const parent = sources[index].parent_source_index
      if (parent !== null && childParents[index] !== parent) {
        throw new Error('Invalid analyze.data source children')
      }
    }
    for (const part of parts) {
      if (
        !Number.isInteger(part?.source_index) ||
        part.source_index < 0 ||
        part.source_index >= sources.length ||
        !Number.isInteger(part.output_file_index) ||
        part.output_file_index < 0 ||
        part.output_file_index >= outputs.length ||
        !Number.isInteger(part.size) ||
        !Number.isInteger(part.compressed_size)
      ) {
        throw new Error('Invalid analyze.data chunk part')
      }
    }
    if (outputs.some((output) => typeof output?.filename !== 'string')) {
      throw new Error('Invalid analyze.data output file')
    }

    this.pathToSourceIndex = new Map()
    for (let i = 0; i < sources.length; i++) {
      const fullPath = this.getFullSourcePath(i)
      this.pathToSourceIndex.set(fullPath, i)
    }
  }

  source(index: SourceIndex): AnalyzeSource | undefined {
    return this.analyzeHeader.sources[index]
  }

  sourceCount(): number {
    return this.analyzeHeader.sources.length
  }

  getSourceIndexFromPath(path: string): SourceIndex | undefined {
    return this.pathToSourceIndex.get(path)
  }

  chunkPart(index: number): AnalyzeChunkPart | undefined {
    return this.analyzeHeader.chunk_parts[index]
  }

  chunkPartCount(): number {
    return this.analyzeHeader.chunk_parts.length
  }

  outputFile(index: number): AnalyzeOutputFile | undefined {
    return this.analyzeHeader.output_files[index]
  }

  outputFileCount(): number {
    return this.analyzeHeader.output_files.length
  }

  sourceRoots(): SourceIndex[] {
    return this.analyzeHeader.source_roots
  }

  private readEdgesDataAtIndex(
    reference: EdgesDataReference,
    index: SourceIndex
  ): SourceIndex[] {
    const { offset } = reference
    const numOffsets = this.analyzeBinaryData.getUint32(offset, false)

    if (index < 0 || index >= numOffsets) {
      return []
    }

    const offsetsStart = offset + 4
    const prevOffset =
      index === 0
        ? 0
        : this.analyzeBinaryData.getUint32(
            offsetsStart + (index - 1) * 4,
            false
          )
    const currentOffset = this.analyzeBinaryData.getUint32(
      offsetsStart + index * 4,
      false
    )

    const edgeCount = currentOffset - prevOffset
    if (edgeCount === 0) {
      return []
    }

    const dataStart = offset + 4 + numOffsets * 4
    const edges: number[] = []
    for (let j = 0; j < edgeCount; j++) {
      edges.push(
        this.analyzeBinaryData.getUint32(
          dataStart + (prevOffset + j) * 4,
          false
        )
      )
    }

    return edges
  }

  routeEntries(): AnalyzeRouteEntry[] {
    return this.analyzeHeader.route_entries ?? []
  }

  hasExactRouteEntries(): boolean {
    return this.analyzeHeader.route_entries !== undefined
  }

  outputFileChunkParts(index: number): number[] {
    return this.readEdgesDataAtIndex(
      this.analyzeHeader.output_file_chunk_parts,
      index
    )
  }

  sourceChunkParts(index: SourceIndex): number[] {
    return this.readEdgesDataAtIndex(
      this.analyzeHeader.source_chunk_parts,
      index
    )
  }

  sourceChildren(index: SourceIndex): SourceIndex[] {
    return this.readEdgesDataAtIndex(this.analyzeHeader.source_children, index)
  }

  getFullSourcePath(index: SourceIndex): string {
    let source = this.source(index)
    if (!source) return ''
    const parts = [source.path]
    const seen = new Set([index])
    while (source.parent_source_index !== null) {
      if (seen.has(source.parent_source_index)) {
        throw new Error('Invalid analyze.data: source parent cycle')
      }
      seen.add(source.parent_source_index)
      source = this.source(source.parent_source_index)!
      parts.push(source.path)
    }
    return parts.reverse().join('')
  }

  getOwnSizes(index: SourceIndex): {
    size: number
    compressedSize: number
  } {
    const chunkParts = this.sourceChunkParts(index)
    let size = 0
    let compressedSize = 0
    for (const chunkPartIndex of chunkParts) {
      const chunkPart = this.chunkPart(chunkPartIndex)
      if (chunkPart) {
        size += chunkPart.size
        compressedSize += chunkPart.compressed_size
      }
    }
    return { size, compressedSize }
  }

  getRecursiveModuleCount(
    index: SourceIndex,
    filterSource: (sourceIndex: SourceIndex) => boolean
  ): number {
    const selfVisible = filterSource(index)
    const selfCount =
      selfVisible && this.sourceChunkParts(index).length > 0 ? 1 : 0

    const children = this.sourceChildren(index)
    if (children.length === 0) {
      return selfCount
    }

    let totalCount = selfCount
    for (const childIndex of children) {
      totalCount += this.getRecursiveModuleCount(childIndex, filterSource)
    }
    return totalCount
  }

  sourceChunks(index: SourceIndex): string[] {
    const chunkParts = this.sourceChunkParts(index)
    const uniqueChunks = new Set<string>()

    for (const chunkPartIndex of chunkParts) {
      const chunkPart = this.chunkPart(chunkPartIndex)
      if (chunkPart) {
        const outputFile = this.outputFile(chunkPart.output_file_index)
        if (outputFile) {
          uniqueChunks.add(outputFile.filename)
        }
      }
    }

    return Array.from(uniqueChunks).sort()
  }

  getRecursiveSizes(
    index: SourceIndex,
    filterSource: (sourceIndex: SourceIndex) => boolean
  ): { size: number; compressedSize: number } {
    let size = 0
    let compressedSize = 0

    if (filterSource(index)) {
      const { size: ownUncompressedSize, compressedSize: ownCompressedSize } =
        this.getOwnSizes(index)
      size += ownUncompressedSize
      compressedSize += ownCompressedSize
    }

    for (const childIndex of this.sourceChildren(index)) {
      const {
        size: childUncompressedSize,
        compressedSize: childCompressedSize,
      } = this.getRecursiveSizes(childIndex, filterSource)
      size += childUncompressedSize
      compressedSize += childCompressedSize
    }

    return { size, compressedSize }
  }

  getSourceFlags(index: SourceIndex): {
    client: boolean
    server: boolean
    traced: boolean
    js: boolean
    css: boolean
    json: boolean
    asset: boolean
  } {
    let client = false
    let server = false
    let traced = false
    let js = false
    let css = false
    let json = false
    let asset = false

    const chunkParts = this.sourceChunkParts(index)
    for (const chunkPartIndex of chunkParts) {
      const chunkPart = this.chunkPart(chunkPartIndex)
      if (!chunkPart) continue
      const outputFile = this.outputFile(chunkPart.output_file_index)
      if (!outputFile) continue
      if (outputFile.filename.startsWith('[client-fs]/')) {
        client = true
      } else if (outputFile.filename.startsWith('[project]/')) {
        traced = true
        server = true
      } else {
        server = true
      }
      if (
        outputFile.filename.endsWith('.js') ||
        outputFile.filename.endsWith('.mjs') ||
        outputFile.filename.endsWith('.cjs')
      ) {
        js = true
      } else if (outputFile.filename.endsWith('.css')) {
        css = true
      } else if (outputFile.filename.endsWith('.json')) {
        json = true
      } else {
        asset = true
      }
    }

    return { client, server, traced, js, css, json, asset }
  }

  isPolyfillModule(index: SourceIndex): boolean {
    const fullSourcePath = this.getFullSourcePath(index)
    return fullSourcePath.endsWith(
      'node_modules/next/dist/build/polyfills/polyfill-module.js'
    )
  }

  isPolyfillNoModule(index: SourceIndex): boolean {
    const fullSourcePath = this.getFullSourcePath(index)
    return fullSourcePath.endsWith(
      'node_modules/next/dist/build/polyfills/polyfill-nomodule.js'
    )
  }
}
