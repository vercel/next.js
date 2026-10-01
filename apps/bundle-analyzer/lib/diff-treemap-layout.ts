import type { SourceDiffRow } from './diff'
import { delta } from './diff'
import { layoutTreemap } from './layout-treemap'
import type { LayoutNode, LayoutRect } from './treemap-layout'

interface DiffTreeNode {
  index: number
  name: string
  parentIndex: number | null
  size: number
  row?: SourceDiffRow
  children: DiffTreeNode[]
}

export interface DiffTreemapLayout {
  rootIndex: number
  rowBySourceIndex: Map<number, SourceDiffRow>
  sourceIndexByKey: Map<string, number>
  getParentSourceIndex(sourceIndex: number): number | null
  getSourceName(sourceIndex: number): string
  computeLayout(sourceIndex: number, rect: LayoutRect): LayoutNode
}

export function createDiffTreemapLayout(
  rows: SourceDiffRow[],
  useCompressed: boolean
): DiffTreemapLayout {
  let nextIndex = 0
  const root: DiffTreeNode = {
    index: nextIndex++,
    name: 'All Changed Modules',
    parentIndex: null,
    size: 0,
    children: [],
  }
  const nodeByIndex = new Map<number, DiffTreeNode>([[root.index, root]])
  const directoryByPath = new Map<string, DiffTreeNode>([['', root]])
  const rowBySourceIndex = new Map<number, SourceDiffRow>()
  const sourceIndexByKey = new Map<string, number>()

  for (const row of rows) {
    const change = delta(row, useCompressed)
    if (change === 0) continue

    const parts = isNextBuildOutput(row.key)
      ? ['Unattributed output', getBasename(row.key)]
      : row.key.split('/').filter(Boolean)
    let parent = root
    let directoryPath = ''

    for (const part of parts.slice(0, -1)) {
      directoryPath += `/${part}`
      let directory = directoryByPath.get(directoryPath)
      if (!directory) {
        directory = {
          index: nextIndex++,
          name: `${part}/`,
          parentIndex: parent.index,
          size: 0,
          children: [],
        }
        parent.children.push(directory)
        directoryByPath.set(directoryPath, directory)
        nodeByIndex.set(directory.index, directory)
      }
      parent = directory
    }

    const leaf: DiffTreeNode = {
      index: nextIndex++,
      name: parts.at(-1) ?? row.name,
      parentIndex: parent.index,
      size: Math.abs(change),
      row,
      children: [],
    }
    parent.children.push(leaf)
    nodeByIndex.set(leaf.index, leaf)
    rowBySourceIndex.set(leaf.index, row)
    sourceIndexByKey.set(row.key, leaf.index)
  }

  function aggregateSize(node: DiffTreeNode): number {
    if (node.row) return node.size
    node.size = node.children.reduce(
      (total, child) => total + aggregateSize(child),
      0
    )
    return node.size
  }
  aggregateSize(root)

  function computeLayout(node: DiffTreeNode, rect: LayoutRect): LayoutNode {
    if (node.row) {
      return {
        name: node.name,
        size: node.size,
        type: 'file',
        rect,
        sourceIndex: node.index,
        specialModuleType: null,
        client: node.row.client,
        server: node.row.server,
      }
    }

    const titleBarHeight = Math.round(
      Math.max(12, Math.min(24, rect.height * 0.1))
    )
    const isCollapsed = rect.height < 30
    if (isCollapsed) {
      return {
        name: node.name,
        size: node.size,
        type: 'collapsed-directory',
        rect,
        titleBarHeight,
        children: [],
        itemCount: countLeaves(node),
        sourceIndex: node.index,
        specialModuleType: null,
      }
    }

    const contentRect: LayoutRect = {
      x: Math.round(rect.x),
      y: Math.round(rect.y + titleBarHeight),
      width: Math.max(0, Math.round(rect.width - 2)),
      height: Math.max(0, Math.round(rect.height - titleBarHeight - 2)),
    }
    const children = [...node.children].sort((a, b) => b.size - a.size)
    const childRects = layoutTreemap(
      children.map((child) => child.size),
      contentRect
    )

    return {
      name: node.name,
      size: node.size,
      type: 'directory',
      rect,
      titleBarHeight,
      children: children.map((child, index) =>
        computeLayout(child, childRects[index])
      ),
      sourceIndex: node.index,
      specialModuleType: null,
    }
  }

  return {
    rootIndex: root.index,
    rowBySourceIndex,
    sourceIndexByKey,
    getParentSourceIndex(sourceIndex) {
      return nodeByIndex.get(sourceIndex)?.parentIndex ?? null
    },
    getSourceName(sourceIndex) {
      return nodeByIndex.get(sourceIndex)?.name ?? ''
    },
    computeLayout(sourceIndex, rect) {
      return computeLayout(nodeByIndex.get(sourceIndex) ?? root, rect)
    },
  }
}

function countLeaves(node: DiffTreeNode): number {
  if (node.row) return 1
  return node.children.reduce((total, child) => total + countLeaves(child), 0)
}

function isNextBuildOutput(sourcePath: string): boolean {
  return sourcePath.startsWith('[project]/.next/')
}

function getBasename(sourcePath: string): string {
  return sourcePath.slice(sourcePath.lastIndexOf('/') + 1)
}
