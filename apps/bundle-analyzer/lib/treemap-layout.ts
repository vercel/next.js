import type { AnalyzeData, SourceIndex } from './analyze-data'
import { layoutTreemap } from './layout-treemap'
import { SpecialModule } from './types'
import { getSpecialModuleType } from './utils'

export interface LayoutRect {
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutNodeInfo {
  name: string
  size: number
  server?: boolean
  client?: boolean
}

export interface LayoutNode extends LayoutNodeInfo {
  size: number
  rect: LayoutRect
  type: 'file' | 'directory' | 'collapsed-directory'
  specialModuleType: SpecialModule | null
  titleBarHeight?: number
  children?: LayoutNode[]
  itemCount?: number
  traced?: boolean
  js?: boolean
  css?: boolean
  json?: boolean
  asset?: boolean
  sourceIndex?: SourceIndex // Track which source this node represents
}

interface SourceMetadata {
  filtered: boolean
  size: number
  compressedSize: number
}

export enum SizeMode {
  Compressed = 'compressed',
  Uncompressed = 'uncompressed',
}

function precomputeSourceMetadata(
  analyzeData: AnalyzeData,
  filterSource?: (sourceIndex: SourceIndex) => boolean
): SourceMetadata[] {
  const sourceCount = analyzeData.sourceCount()
  const metadata: SourceMetadata[] = new Array(sourceCount)

  for (let i = sourceCount - 1; i >= 0; i--) {
    const children = analyzeData.sourceChildren(i)
    const ownSize = analyzeData.getOwnSizes(i)

    if (children.length === 0) {
      // file
      metadata[i] = {
        size: ownSize.size,
        compressedSize: ownSize.compressedSize,
        filtered: filterSource ? !filterSource(i) : false,
      }
    } else {
      // directory
      metadata[i] = {
        filtered: true,
        size: ownSize.size,
        compressedSize: ownSize.compressedSize,
      }
    }
  }

  // Top-down pass: aggregate child sizes and filtered status for directories
  function processDirectory(idx: SourceIndex) {
    const children = analyzeData.sourceChildren(idx)
    if (children.length === 0) return // Already processed as leaf

    let totalUncompressedSize = metadata[idx].size
    let totalCompressedSize = metadata[idx].compressedSize
    let hasVisibleChild = false

    for (const childIdx of children) {
      processDirectory(childIdx) // Process child first
      if (!metadata[childIdx].filtered) {
        // Only add size of visible (non-filtered) children
        totalUncompressedSize += metadata[childIdx].size
        totalCompressedSize += metadata[childIdx].compressedSize
        hasVisibleChild = true
      }
    }

    metadata[idx].size = totalUncompressedSize
    metadata[idx].compressedSize = totalCompressedSize
    metadata[idx].filtered = !hasVisibleChild // Directory filtered if no visible children
  }

  // Process from root sources
  const roots = analyzeData.sourceRoots()
  for (const rootIdx of roots) {
    processDirectory(rootIdx)
  }

  return metadata
}

// Internal function that uses precomputed metadata
function computeTreemapLayoutFromAnalyzeInternal(
  analyzeData: AnalyzeData,
  sourceIndex: SourceIndex,
  foldedPath: string,
  rect: LayoutRect,
  metadata: SourceMetadata[],
  filterSource: ((sourceIndex: SourceIndex) => boolean) | undefined,
  sizeMode: SizeMode
): LayoutNode {
  const source = analyzeData.source(sourceIndex)
  if (!source) {
    throw new Error(`Source at index ${sourceIndex} not found`)
  }

  const isDirectory = source.path.endsWith('/') || !source.path

  const childrenIndices = analyzeData.sourceChildren(sourceIndex)

  // Fold single-child directories
  if (
    childrenIndices.length === 1 &&
    isDirectory &&
    (foldedPath + source.path).length <= 40
  ) {
    const childIndex = childrenIndices[0]
    const child = analyzeData.source(childIndex)
    if (child?.path.endsWith('/')) {
      return computeTreemapLayoutFromAnalyzeInternal(
        analyzeData,
        childIndex,
        foldedPath + source.path,
        rect,
        metadata,
        filterSource,
        sizeMode
      )
    }
  }

  const totalSize =
    sizeMode === SizeMode.Compressed
      ? metadata[sourceIndex].compressedSize
      : metadata[sourceIndex].size

  // If this is a file (no children), create a file node
  if (!isDirectory || childrenIndices.length === 0) {
    return {
      name: source.path,
      size: totalSize,
      type: 'file',
      rect,
      sourceIndex,
      specialModuleType: getSpecialModuleType(analyzeData, sourceIndex),
      ...analyzeData.getSourceFlags(sourceIndex),
    }
  }

  const directoryName = foldedPath + source.path || 'All Route Modules'

  // Directory with children
  const titleBarHeight = Math.round(
    Math.max(12, Math.min(24, rect.height * 0.1))
  )
  const isCollapsed = rect.height < 30

  const contentRect: LayoutRect = {
    x: Math.round(rect.x),
    y: Math.round(rect.y + titleBarHeight),
    width: Math.max(0, Math.round(rect.width - 2)),
    height: Math.max(0, Math.round(rect.height - titleBarHeight - 2)),
  }

  if (isCollapsed) {
    // Count all descendant files
    function countDescendants(idx: SourceIndex): number {
      const children = analyzeData.sourceChildren(idx)
      if (children.length === 0) return 1
      return children.reduce(
        (sum, childIdx) => sum + countDescendants(childIdx),
        0
      )
    }

    return {
      name: directoryName,
      size: totalSize,
      type: 'collapsed-directory',
      rect,
      titleBarHeight,
      itemCount: countDescendants(sourceIndex),
      children: [],
      sourceIndex,
      specialModuleType: null,
    }
  }

  // Recursively build children with their sizes
  const childrenData: { index: number; size: number }[] = []

  for (const childIndex of childrenIndices) {
    const childSource = analyzeData.source(childIndex)
    if (!childSource) continue

    // Use precomputed filter status
    if (metadata[childIndex].filtered) {
      continue
    }

    // Use precomputed size based on mode
    const childSize =
      sizeMode === SizeMode.Compressed
        ? metadata[childIndex].compressedSize
        : metadata[childIndex].size

    childrenData.push({
      index: childIndex,
      size: childSize || 1, // Fallback to 1 for visibility
    })
  }

  if (childrenData.length === 0) {
    return {
      name: directoryName,
      size: totalSize,
      type: 'directory',
      rect,
      titleBarHeight,
      children: [],
      sourceIndex,
      specialModuleType: null,
    }
  }

  // Sort by size (descending)
  childrenData.sort((a, b) => b.size - a.size)

  // Compute layout
  const sizes = childrenData.map((c) => c.size)
  const childRects = layoutTreemap(sizes, contentRect)

  const layoutChildren: LayoutNode[] = childrenData.map((child, i) =>
    computeTreemapLayoutFromAnalyzeInternal(
      analyzeData,
      child.index,
      '',
      childRects[i],
      metadata,
      filterSource,
      sizeMode
    )
  )

  return {
    name: directoryName,
    size: totalSize,
    type: 'directory',
    rect,
    titleBarHeight,
    children: layoutChildren,
    sourceIndex,
    specialModuleType: null,
  }
}

// Public function that precomputes metadata and calls internal function
export function computeTreemapLayoutFromAnalyze(
  analyzeData: AnalyzeData,
  sourceIndex: SourceIndex,
  rect: LayoutRect,
  filterSource?: (sourceIndex: SourceIndex) => boolean,
  sizeMode: SizeMode = SizeMode.Compressed
): LayoutNode {
  // Precompute metadata once for entire tree
  const metadata = precomputeSourceMetadata(analyzeData, filterSource)

  // Use internal function with precomputed metadata
  return computeTreemapLayoutFromAnalyzeInternal(
    analyzeData,
    sourceIndex,
    '',
    rect,
    metadata,
    filterSource,
    sizeMode
  )
}
