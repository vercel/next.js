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

  getSourceOutputSize(index: SourceIndex): number {
    const chunkParts = this.sourceChunkParts(index)
    let totalSize = 0
    for (const chunkPartIndex of chunkParts) {
      const chunkPart = this.chunkPart(chunkPartIndex)
      if (chunkPart) {
        totalSize += chunkPart.size
      }
    }
    return totalSize
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
