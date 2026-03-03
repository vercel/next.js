// Type definitions matching the Rust structures from analyze.rs

// Type aliases for better readability
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
  output_file_chunk_parts: EdgesDataReference
  source_chunk_parts: EdgesDataReference
  source_children: EdgesDataReference
  source_roots: number[]
}

interface ModulesDataHeader {
  modules: AnalyzeModule[]
  module_dependents: EdgesDataReference
  async_module_dependents: EdgesDataReference
  module_dependencies: EdgesDataReference
  async_module_dependencies: EdgesDataReference
}

/**
 * Represents the global modules data that is shared across all routes
 */
export class ModulesData {
  private modulesHeader: ModulesDataHeader
  private modulesBinaryData: DataView
  private pathToModuleIndex: Map<string, ModuleIndex[]>

  constructor(modulesArrayBuffer: ArrayBuffer) {
    // Parse modules.data
    const modulesDataView = new DataView(modulesArrayBuffer)
    const modulesJsonLength = modulesDataView.getUint32(0, false)
    const modulesJsonBytes = new Uint8Array(
      modulesArrayBuffer,
      4,
      modulesJsonLength
    )
    const modulesJsonString = new TextDecoder('utf-8').decode(modulesJsonBytes)
    this.modulesHeader = JSON.parse(modulesJsonString) as ModulesDataHeader
    const modulesBinaryOffset = 4 + modulesJsonLength
    this.modulesBinaryData = new DataView(
      modulesArrayBuffer,
      modulesBinaryOffset
    )

    // Build pathToModuleIndex map
    this.pathToModuleIndex = new Map()
    for (let i = 0; i < this.modulesHeader.modules.length; i++) {
      const module = this.modulesHeader.modules[i]
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

  // Read edges data for a specific index only
  private readEdgesDataAtIndex(
    reference: EdgesDataReference,
    index: ModuleIndex
  ): ModuleIndex[] {
    const { offset, length } = reference

    if (length === 0) {
      return []
    }

    // Read the number of offset entries (first u32)
    const numOffsets = this.modulesBinaryData.getUint32(offset, false)

    if (index < 0 || index >= numOffsets) {
      return []
    }

    // Read only the two offsets we need
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

    // Read only the data for this index
    const dataStart = offset + 4 + numOffsets * 4
    const edges: number[] = []
    for (let j = 0; j < edgeCount; j++) {
      const edgeValue = this.modulesBinaryData.getUint32(
        dataStart + (prevOffset + j) * 4,
        false
      )
      edges.push(edgeValue)
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

  getRawModulesHeader(): ModulesDataHeader {
    return this.modulesHeader
  }
}

/**
 * Represents route-specific analyze data
 */
export class AnalyzeData {
  private analyzeHeader: AnalyzeDataHeader
  private analyzeBinaryData: DataView
  private pathToSourceIndex: Map<string, SourceIndex>

  constructor(analyzeArrayBuffer: ArrayBuffer) {
    // Parse analyze.data
    const analyzeDataView = new DataView(analyzeArrayBuffer)
    const analyzeJsonLength = analyzeDataView.getUint32(0, false)
    const analyzeJsonBytes = new Uint8Array(
      analyzeArrayBuffer,
      4,
      analyzeJsonLength
    )
    const analyzeJsonString = new TextDecoder('utf-8').decode(analyzeJsonBytes)
    this.analyzeHeader = JSON.parse(analyzeJsonString) as AnalyzeDataHeader
    const analyzeBinaryOffset = 4 + analyzeJsonLength
    this.analyzeBinaryData = new DataView(
      analyzeArrayBuffer,
      analyzeBinaryOffset
    )

    // Build pathToSourceIndex map
    this.pathToSourceIndex = new Map()
    for (let i = 0; i < this.analyzeHeader.sources.length; i++) {
      const fullPath = this.getFullSourcePath(i)
      this.pathToSourceIndex.set(fullPath, i)
    }
  }

  // Accessor methods for header data

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

  // Methods to read edges data from the binary section

  // Read edges data for a specific index only
  private readEdgesDataAtIndex(
    reference: EdgesDataReference,
    index: SourceIndex
  ): SourceIndex[] {
    const { offset, length } = reference

    if (length === 0) {
      return []
    }

    // Read the number of offset entries (first u32)
    const numOffsets = this.analyzeBinaryData.getUint32(offset, false)

    if (index < 0 || index >= numOffsets) {
      return []
    }

    // Read only the two offsets we need
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

    // Read only the data for this index
    const dataStart = offset + 4 + numOffsets * 4
    const edges: number[] = []
    for (let j = 0; j < edgeCount; j++) {
      const edgeValue = this.analyzeBinaryData.getUint32(
        dataStart + (prevOffset + j) * 4,
        false
      )
      edges.push(edgeValue)
    }

    return edges
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

  // Utility method to get the full path of a source by walking up the parent chain
  getFullSourcePath(index: SourceIndex): string {
    const source = this.source(index)
    if (!source) return ''

    if (source.parent_source_index === null) {
      return source.path
    }

    const parentPath = this.getFullSourcePath(source.parent_source_index)
    return parentPath + source.path
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

    return {
      size,
      compressedSize,
    }
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
      } else {
        server = true
      }
      if (outputFile.filename.endsWith('.js')) {
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

  // Get the raw header for debugging
  getRawAnalyzeHeader(): AnalyzeDataHeader {
    return this.analyzeHeader
  }
}

/**
 * Merges `appData` analyze data into `routeData`. All source/chunk-part/output-file
 * indices are remapped so the returned AnalyzeData is self-consistent and can be
 * used directly for visualization.
 *
 * Everything is repacked into the same binary format expected by AnalyzeData
 */
export function mergeAnalyzeData(
  routeData: AnalyzeData,
  appData: AnalyzeData
): AnalyzeData {
  const baseHeader = routeData.getRawAnalyzeHeader()
  const extraHeader = appData.getRawAnalyzeHeader()

  const sourceOffset = routeData.sourceCount()
  const chunkPartOffset = routeData.chunkPartCount()
  const outputFileOffset = routeData.outputFileCount()
  const appSourceCount = appData.sourceCount()

  const baseRoots = routeData.sourceRoots()
  const extraRoots = appData.sourceRoots().map((r) => r + sourceOffset)

  const mergedSources: AnalyzeSource[] = [
    ...baseHeader.sources,
    ...extraHeader.sources.map((s) => ({
      path: s.path,
      parent_source_index:
        s.parent_source_index === null
          ? null
          : s.parent_source_index + sourceOffset,
    })),
  ]

  const mergedChunkParts: AnalyzeChunkPart[] = [
    ...baseHeader.chunk_parts,
    ...extraHeader.chunk_parts.map((cp) => ({
      source_index: cp.source_index + sourceOffset,
      output_file_index: cp.output_file_index + outputFileOffset,
      size: cp.size,
      compressed_size: cp.compressed_size,
    })),
  ]

  const mergedOutputFiles: AnalyzeOutputFile[] = [
    ...baseHeader.output_files,
    ...extraHeader.output_files,
  ]

  const routeRoot = baseRoots[0] ?? 0
  const mergedSourceChildren: number[][] = new Array(
    sourceOffset + appSourceCount
  )

  // Graft _app roots onto the route root so the treemap (which starts at a
  // single root and traverses source_children) can reach them. Their
  // parent_source_index stays null, so getFullSourcePath() returns the
  // original path, keeping import-chain lookups working.
  for (let i = 0; i < sourceOffset; i++) {
    mergedSourceChildren[i] =
      i === routeRoot
        ? [...routeData.sourceChildren(i), ...extraRoots]
        : routeData.sourceChildren(i)
  }

  for (let i = 0; i < appSourceCount; i++) {
    mergedSourceChildren[sourceOffset + i] = appData
      .sourceChildren(i)
      .map((j) => j + sourceOffset)
  }

  const mergedSourceChunkParts: number[][] = new Array(
    sourceOffset + appSourceCount
  )
  for (let i = 0; i < sourceOffset; i++) {
    mergedSourceChunkParts[i] = routeData.sourceChunkParts(i)
  }
  for (let i = 0; i < appSourceCount; i++) {
    mergedSourceChunkParts[sourceOffset + i] = appData
      .sourceChunkParts(i)
      .map((j) => j + chunkPartOffset)
  }

  const mergedOutputFileChunkParts: number[][] = []
  for (let i = 0; i < routeData.outputFileCount(); i++) {
    mergedOutputFileChunkParts.push(routeData.outputFileChunkParts(i))
  }
  for (let i = 0; i < appData.outputFileCount(); i++) {
    mergedOutputFileChunkParts.push(
      appData.outputFileChunkParts(i).map((j) => j + chunkPartOffset)
    )
  }

  const sourceChildrenBytes = encodeEdges(mergedSourceChildren)
  const sourceChunkPartsBytes = encodeEdges(mergedSourceChunkParts)
  const outputFileChunkPartsBytes = encodeEdges(mergedOutputFileChunkParts)

  // ---- Compute binary section layout (offsets are within binary section) ----
  let binaryOffset = 0

  const sourceChildrenRef: EdgesDataReference = {
    offset: binaryOffset,
    length: sourceChildrenBytes.byteLength,
  }
  binaryOffset += sourceChildrenBytes.byteLength

  const sourceChunkPartsRef: EdgesDataReference = {
    offset: binaryOffset,
    length: sourceChunkPartsBytes.byteLength,
  }
  binaryOffset += sourceChunkPartsBytes.byteLength

  const outputFileChunkPartsRef: EdgesDataReference = {
    offset: binaryOffset,
    length: outputFileChunkPartsBytes.byteLength,
  }
  binaryOffset += outputFileChunkPartsBytes.byteLength

  const mergedHeader: AnalyzeDataHeader = {
    sources: mergedSources,
    chunk_parts: mergedChunkParts,
    output_files: mergedOutputFiles,
    output_file_chunk_parts: outputFileChunkPartsRef,
    source_chunk_parts: sourceChunkPartsRef,
    source_children: sourceChildrenRef,
    source_roots: [...baseRoots],
  }

  const headerBytes = new TextEncoder().encode(JSON.stringify(mergedHeader))
  const totalSize = 4 + headerBytes.byteLength + binaryOffset
  const finalBuffer = new ArrayBuffer(totalSize)
  const finalView = new DataView(finalBuffer)
  const finalBytes = new Uint8Array(finalBuffer)

  finalView.setUint32(0, headerBytes.byteLength, false)
  finalBytes.set(headerBytes, 4)

  const binaryStart = 4 + headerBytes.byteLength
  finalBytes.set(sourceChildrenBytes, binaryStart + sourceChildrenRef.offset)
  finalBytes.set(
    sourceChunkPartsBytes,
    binaryStart + sourceChunkPartsRef.offset
  )
  finalBytes.set(
    outputFileChunkPartsBytes,
    binaryStart + outputFileChunkPartsRef.offset
  )

  return new AnalyzeData(finalBuffer)
}

// Re-encode edges data back into the binary format expected by AnalyzeData
function encodeEdges(allEdges: number[][]): Uint8Array {
  const n = allEdges.length
  if (n === 0) return new Uint8Array(0)

  const totalEdges = allEdges.reduce((sum, e) => sum + e.length, 0)
  const byteLength = 4 + n * 4 + totalEdges * 4
  const buf = new ArrayBuffer(byteLength)
  const view = new DataView(buf)
  let pos = 0

  view.setUint32(pos, n, false)
  pos += 4

  let cumulative = 0
  for (const edgeList of allEdges) {
    cumulative += edgeList.length
    view.setUint32(pos, cumulative, false)
    pos += 4
  }

  for (const edgeList of allEdges) {
    for (const edge of edgeList) {
      view.setUint32(pos, edge, false)
      pos += 4
    }
  }

  return new Uint8Array(buf)
}
