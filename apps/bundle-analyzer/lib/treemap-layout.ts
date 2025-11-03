import type { AnalyzeData } from './analyze-data'
import { layoutTreemap } from './layout-treemap'

export interface LayoutRect {
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutNodeInfo {
  name: string
  server?: boolean
  client?: boolean
}

export interface LayoutNode extends LayoutNodeInfo {
  size: number
  rect: LayoutRect
  type: 'file' | 'directory' | 'collapsed-directory'
  titleBarHeight?: number
  children?: LayoutNode[]
  itemCount?: number
  traced?: boolean
  js?: boolean
  css?: boolean
  json?: boolean
  asset?: boolean
  sourceIndex?: number // Track which source this node represents
}

interface SourceMetadata {
  filtered: boolean
  totalSize: number
}

function precomputeSourceMetadata(
  analyzeData: AnalyzeData,
  filterSource?: (sourceIndex: number) => boolean
): SourceMetadata[] {
  const sourceCount = analyzeData.sourceCount()
  const metadata: SourceMetadata[] = new Array(sourceCount)

  // Initialize all entries
  for (let i = 0; i < sourceCount; i++) {
    metadata[i] = { filtered: true, totalSize: 0 }
  }

  // Bottom-up pass: compute leaf node data
  for (let i = sourceCount - 1; i >= 0; i--) {
    const children = analyzeData.sourceChildren(i)
    const ownSize = analyzeData.getSourceOutputSize(i)

    if (children.length === 0) {
      // Leaf node (file)
      metadata[i].totalSize = ownSize
      metadata[i].filtered = filterSource ? !filterSource(i) : false
    } else {
      // Directory - initialize with own size
      metadata[i].totalSize = ownSize
    }
  }

  // Top-down pass: aggregate child sizes and filtered status for directories
  function processDirectory(idx: number) {
    const children = analyzeData.sourceChildren(idx)
    if (children.length === 0) return // Already processed as leaf

    let totalSize = metadata[idx].totalSize // Start with own size
    let hasVisibleChild = false

    for (const childIdx of children) {
      processDirectory(childIdx) // Process child first
      if (!metadata[childIdx].filtered) {
        // Only add size of visible (non-filtered) children
        totalSize += metadata[childIdx].totalSize
        hasVisibleChild = true
      }
    }

    metadata[idx].totalSize = totalSize
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
  sourceIndex: number,
  foldedPath: string,
  rect: LayoutRect,
  metadata: SourceMetadata[],
  filterSource?: (sourceIndex: number) => boolean
): LayoutNode {
  const source = analyzeData.source(sourceIndex)
  if (!source) {
    throw new Error(`Source at index ${sourceIndex} not found`)
  }

  const isDirectory = source.path.endsWith('/') || !source.path

  // Get children sources
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
        filterSource
      )
    }
  }

  // Use precomputed size
  const totalSize = metadata[sourceIndex].totalSize

  // If this is a file (no children), create a file node
  if (!isDirectory || childrenIndices.length === 0) {
    return {
      name: source.path,
      size: totalSize,
      type: 'file',
      rect,
      sourceIndex,
      ...analyzeData.getSourceFlags(sourceIndex),
    }
  }

  // This is a directory with children
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
    function countDescendants(idx: number): number {
      const children = analyzeData.sourceChildren(idx)
      if (children.length === 0) return 1
      return children.reduce(
        (sum, childIdx) => sum + countDescendants(childIdx),
        0
      )
    }

    return {
      name: foldedPath + source.path,
      size: totalSize,
      type: 'collapsed-directory',
      rect,
      titleBarHeight,
      itemCount: countDescendants(sourceIndex),
      children: [],
      sourceIndex,
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

    // Use precomputed size
    const childSize = metadata[childIndex].totalSize

    childrenData.push({
      index: childIndex,
      size: childSize || 1, // Fallback to 1 for visibility
    })
  }

  if (childrenData.length === 0) {
    return {
      name: foldedPath + source.path,
      size: totalSize,
      type: 'directory',
      rect,
      titleBarHeight,
      children: [],
      sourceIndex,
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
      filterSource
    )
  )

  return {
    name: foldedPath + source.path,
    size: totalSize,
    type: 'directory',
    rect,
    titleBarHeight,
    children: layoutChildren,
    sourceIndex,
  }
}

// Public function that precomputes metadata and calls internal function
export function computeTreemapLayoutFromAnalyze(
  analyzeData: AnalyzeData,
  sourceIndex: number,
  rect: LayoutRect,
  filterSource?: (sourceIndex: number) => boolean
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
    filterSource
  )
}
