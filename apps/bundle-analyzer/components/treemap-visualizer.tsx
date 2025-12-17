'use client'

import { darken, lighten, readableColor } from 'polished'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalyzeData } from '@/lib/analyze-data'
import {
  computeTreemapLayoutFromAnalyze,
  type LayoutNode,
  type LayoutNodeInfo,
  SizeMode,
} from '@/lib/treemap-layout'
import { SpecialModule } from '@/lib/types'
import { formatBytes } from '@/lib/utils'

interface TreemapVisualizerProps {
  analyzeData: AnalyzeData
  sourceIndex: number
  selectedSourceIndex?: number
  onSelectSourceIndex?: (index: number) => void
  focusedSourceIndex?: number
  onFocusSourceIndex?: (index: number) => void
  isMouseInTreemap?: boolean
  onMouseInTreemapChange?: (isInside: boolean) => void
  onHoveredNodeChange?: (nodeInfo: LayoutNodeInfo | null) => void
  onHoveredNodeChangeDelayed?: (nodeInfo: LayoutNodeInfo | null) => void
  searchQuery?: string
  filterSource?: (sourceIndex: number) => boolean
  isModulePolyfillChunk?: (sourceIndex: number) => boolean
  isNoModulePolyfillChunk?: (sourceIndex: number) => boolean
  sizeMode?: SizeMode
}

function getFileColor(node: {
  js?: boolean
  css?: boolean
  json?: boolean
  asset?: boolean
  server?: boolean
  client?: boolean
  traced?: boolean
  specialModuleType: SpecialModule | null
}): string {
  const { js, css, json, asset, client, traced, specialModuleType } = node

  if (isPolyfill(specialModuleType)) {
    return '#5f707f'
  }

  let color = '#9ca3af' // gray-400 default
  if (js) color = '#4682b4'
  if (css) color = '#8b7d9e'
  if (json) color = '#297a3a'
  if (asset) color = '#da2f35'

  if (!client) {
    // Make it darker for server (30% darker)
    color = darken(0.3, color)

    if (traced) {
      // Make it slightly lighter (15% lighter than darkened)
      color = lighten(0.15, color)
    }
  }
  return color
}

function isPolyfill(specialModuleType: SpecialModule | null): boolean {
  return (
    specialModuleType === SpecialModule.POLYFILL_MODULE ||
    specialModuleType === SpecialModule.POLYFILL_NOMODULE
  )
}

function calculateTitleFontSizes(titleBarHeight: number): {
  titleFontSize: number
  sizeFontSize: number
} {
  const titleFontSize = Math.min(10, titleBarHeight * 0.5)
  const sizeFontSize = Math.min(9, titleFontSize - 2)
  return { titleFontSize, sizeFontSize }
}

const textWidthCache = new Map<string, number>()
const TEXT_WIDTH_CACHE_SIZE = 30_000 // Shouldn't be more than a few megabytes of memory
function measureTextCached(
  ctx: CanvasRenderingContext2D,
  text: string
): number {
  const cacheKey = `${ctx.font}|${text}`

  let width = textWidthCache.get(cacheKey)
  if (width !== undefined) {
    // Move to end -- update the insertion order for LRU
    textWidthCache.delete(cacheKey)
    textWidthCache.set(cacheKey, width)
    return width
  }

  width = ctx.measureText(text).width

  // LRU-style cache eviction
  if (textWidthCache.size >= TEXT_WIDTH_CACHE_SIZE) {
    const firstKey = textWidthCache.keys().next().value
    if (firstKey !== undefined) {
      textWidthCache.delete(firstKey)
    }
  }

  textWidthCache.set(cacheKey, width)
  return width
}

function truncateTextWithEllipsisIfNeeded(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const ellipsisWidth = measureTextCached(ctx, '...')

  if (measureTextCached(ctx, text) <= maxWidth) {
    return text
  }

  let left = 0
  let right = text.length
  let bestLength = 0

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const truncated = text.slice(0, mid)
    // Don't use the cached version since we don't want repeated failures filling it up
    const width = ctx.measureText(truncated).width

    if (width + ellipsisWidth <= maxWidth) {
      bestLength = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  return bestLength > 0 ? `${text.slice(0, bestLength)}...` : '...'
}

function findNodeAtPosition(
  node: LayoutNode,
  x: number,
  y: number
): LayoutNode | null {
  const { rect } = node

  // Check if point is within this node's bounds
  if (
    x < rect.x ||
    x > rect.x + rect.width ||
    y < rect.y ||
    y > rect.y + rect.height
  ) {
    return null
  }

  if (node.type === 'collapsed-directory') {
    return node
  }

  // For regular directories, check if we're in the title bar first
  if (node.type === 'directory') {
    const titleBarHeight = node.titleBarHeight || 0
    if (y >= rect.y && y <= rect.y + titleBarHeight) {
      return node // Clicked on title bar
    }
  }

  // Check children (if any)
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeAtPosition(child, x, y)
      if (found) return found
    }
  }

  return node
}

// Helper function to check if node or descendants match search
function searchOriginalTreeForMatch(
  node: LayoutNode,
  currentPath: string[],
  searchQuery: string
): boolean {
  const path = [...currentPath, node.name]
  const fullPath = path.join('/').toLowerCase()
  const query = searchQuery.toLowerCase()

  // Check if current node matches
  if (fullPath.includes(query)) {
    return true
  }

  // Recursively check children
  if (node.children) {
    for (const child of node.children) {
      if (searchOriginalTreeForMatch(child, path, searchQuery)) {
        return true
      }
    }
  }

  return false
}

function nodeOrDescendantsMatchSearch(
  node: LayoutNode,
  currentPath: string[],
  searchQuery: string,
  originalData: LayoutNode
): boolean {
  const path = [...currentPath, node.name]
  const fullPath = path.join('/').toLowerCase()
  const query = searchQuery.toLowerCase()

  // Check if current node matches
  if (fullPath.includes(query)) {
    return true
  }

  // For collapsed directories, search the original tree data
  if (node.type === 'collapsed-directory') {
    // Find the original node in the tree data
    let originalNode = originalData
    for (let i = 1; i < path.length; i++) {
      if (!originalNode.children) return false
      const found = originalNode.children.find(
        (child) => child.name === path[i]
      )
      if (!found) return false
      originalNode = found
    }

    // Search through the original node's children
    if (originalNode.children) {
      for (const child of originalNode.children) {
        if (searchOriginalTreeForMatch(child, path, searchQuery)) {
          return true
        }
      }
    }
    return false
  }

  // Check if any descendants match (for regular directories)
  if (node.children) {
    for (const child of node.children) {
      if (
        nodeOrDescendantsMatchSearch(child, path, searchQuery, originalData)
      ) {
        return true
      }
    }
  }

  return false
}

function drawTreemap(
  ctx: CanvasRenderingContext2D,
  node: LayoutNode,
  hoveredAncestorChain: number[] | null,
  selectedAncestorChain: number[],
  useSelectionFade: boolean,
  focusedAncestorChain: number[],
  searchQuery: string,
  originalData: LayoutNode,
  immediateHoveredSourceIndex: number | undefined,
  currentPath: string[] = [],
  parentFadedOut = false,
  insideActiveSubtree = false
) {
  const { rect, name, type, titleBarHeight, children, sourceIndex } = node
  const path = [...currentPath, name]

  // Check if this node is on the focused path
  // When we wrap the layout with ancestors, nodes on the focus path should be drawn
  // as title bars, and only the focused node's children should be drawn in full.
  const focusedSourceIndex =
    focusedAncestorChain[focusedAncestorChain.length - 1]

  if (focusedAncestorChain.length > 1 && sourceIndex !== undefined) {
    const isOnFocusPath = focusedAncestorChain.includes(sourceIndex)
    const isFocusedNode = sourceIndex === focusedSourceIndex

    // Draw ancestor title bars (nodes on path but before the focused node)
    if (isOnFocusPath && !isFocusedNode && type === 'directory') {
      const colors = getThemeColors()

      if (titleBarHeight && rect.height > 20) {
        ctx.fillStyle = colors.dirTitleBg
        ctx.globalAlpha = 1.0
        ctx.fillRect(rect.x, rect.y, rect.width, titleBarHeight)

        ctx.strokeStyle = colors.dirTitleBorder
        ctx.beginPath()
        ctx.moveTo(rect.x, rect.y + titleBarHeight)
        ctx.lineTo(rect.x + rect.width, rect.y + titleBarHeight)
        ctx.stroke()

        const { titleFontSize } = calculateTitleFontSizes(titleBarHeight)
        ctx.fillStyle = colors.text
        ctx.font = `600 ${titleFontSize}px sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(
          name,
          rect.x + 8,
          rect.y + titleBarHeight / 2,
          rect.width - 16
        )
      }

      if (children) {
        for (const child of children) {
          drawTreemap(
            ctx,
            child,
            hoveredAncestorChain,
            selectedAncestorChain,
            useSelectionFade,
            focusedAncestorChain,
            searchQuery,
            originalData,
            immediateHoveredSourceIndex,
            path,
            parentFadedOut,
            insideActiveSubtree
          )
        }
      }
      return
    }
  }

  // Determine if this node should be faded out
  let fadeOut = false

  if (searchQuery && searchQuery.trim() !== '') {
    // Search mode: fade out nodes that don't match
    if (type === 'directory' || type === 'collapsed-directory') {
      if (
        !nodeOrDescendantsMatchSearch(
          node,
          currentPath,
          searchQuery,
          originalData
        )
      ) {
        fadeOut = true
      }
    } else {
      const fullPath = path.join('/').toLowerCase()
      const query = searchQuery.toLowerCase()
      if (!fullPath.includes(query)) {
        fadeOut = true
      }
    }
  } else if (sourceIndex !== undefined) {
    // Selection/hover mode: show active node + ancestors + descendants
    const activeAncestorChain =
      hoveredAncestorChain ?? (useSelectionFade ? selectedAncestorChain : [])

    if (activeAncestorChain.length > 0) {
      const activeSourceIndex =
        activeAncestorChain[activeAncestorChain.length - 1]
      const isActiveNode = sourceIndex === activeSourceIndex
      const isAncestorOfActive = activeAncestorChain.includes(sourceIndex)

      // Check if this node is a descendant of the active node
      // This is tracked via the insideActiveSubtree parameter
      const isDescendantOfActive = insideActiveSubtree

      // Fade out if NOT related to active node
      if (!isAncestorOfActive && !isActiveNode && !isDescendantOfActive) {
        fadeOut = true
      }
    }
  }

  const opacity = fadeOut ? 0.3 : 1.0
  const colors = getThemeColors()

  // Check if this is the immediately hovered node for brightness boost
  const isImmediateHovered =
    sourceIndex !== undefined && sourceIndex === immediateHoveredSourceIndex

  if (type === 'file') {
    let color = getFileColor(node)

    // Apply brightness boost to immediately hovered node
    if (isImmediateHovered) {
      color = lighten(0.15, color)
    }

    ctx.fillStyle = color
    ctx.globalAlpha = opacity
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)

    ctx.strokeStyle = colors.border
    ctx.lineWidth = 1
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)

    if (rect.width > 60 && rect.height > 30) {
      const textColor = readableColor(color)
      ctx.fillStyle = textColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const maxWidth = rect.width - 8

      const sizeText = formatBytes(node.size)
      const fontSize = 12
      const sizeFontSize = 10
      const lineHeight = fontSize + 2

      // Check if we have space for both name and size
      const hasSpaceForSize = rect.height > 50

      ctx.font = `${fontSize}px sans-serif`
      const displayName = truncateTextWithEllipsisIfNeeded(ctx, name, maxWidth)

      if (hasSpaceForSize) {
        ctx.font = `${fontSize}px sans-serif`
        ctx.fillText(
          displayName,
          rect.x + rect.width / 2,
          rect.y + rect.height / 2 - lineHeight / 2
        )

        ctx.globalAlpha = opacity * 0.75
        ctx.font = `${sizeFontSize}px sans-serif`
        ctx.fillText(
          sizeText,
          rect.x + rect.width / 2,
          rect.y + rect.height / 2 + lineHeight / 2
        )
        ctx.globalAlpha = opacity
      } else {
        // Only name fits, draw it centered
        ctx.font = `${fontSize}px sans-serif`
        ctx.fillText(
          displayName,
          rect.x + rect.width / 2,
          rect.y + rect.height / 2
        )
      }
    }

    ctx.globalAlpha = 1.0
  } else if (type === 'collapsed-directory') {
    let bgColor = colors.collapsedBg

    // Apply brightness boost to immediately hovered node
    if (isImmediateHovered) {
      bgColor = lighten(0.15, bgColor)
    }

    ctx.fillStyle = bgColor
    ctx.globalAlpha = opacity
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)

    ctx.strokeStyle = colors.dirBorder
    ctx.lineWidth = 1
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)

    if (titleBarHeight) {
      let titleBgColor = colors.dirTitleBg

      // Apply brightness boost to title bar too
      if (isImmediateHovered) {
        titleBgColor = lighten(0.15, titleBgColor)
      }

      ctx.fillStyle = titleBgColor
      ctx.fillRect(rect.x, rect.y, rect.width, titleBarHeight)

      ctx.strokeStyle = colors.dirTitleBorder
      ctx.beginPath()
      ctx.moveTo(rect.x, rect.y + titleBarHeight)
      ctx.lineTo(rect.x + rect.width, rect.y + titleBarHeight)
      ctx.stroke()

      const { titleFontSize, sizeFontSize } =
        calculateTitleFontSizes(titleBarHeight)
      const sizeText = formatBytes(node.size)
      const centerY = rect.y + titleBarHeight / 2
      const gap = 6

      ctx.textBaseline = 'middle'

      // Measure size text first to reserve space
      ctx.font = `${sizeFontSize}px sans-serif`
      const sizeWidth = measureTextCached(ctx, sizeText)

      const nameX = rect.x + 8
      const availableNameWidth = Math.max(0, rect.width - 16 - sizeWidth - gap)
      ctx.font = `600 ${titleFontSize}px sans-serif`
      const displayName = truncateTextWithEllipsisIfNeeded(
        ctx,
        name,
        availableNameWidth
      )

      ctx.fillStyle = colors.text
      ctx.textAlign = 'left'
      ctx.fillText(displayName, nameX, centerY, availableNameWidth)

      const nameWidth = measureTextCached(ctx, displayName)
      const sizeX = nameX + nameWidth + gap

      // Only draw size text if it fits within bounds
      if (sizeX + sizeWidth <= rect.x + rect.width - 8) {
        ctx.font = `${sizeFontSize}px sans-serif`
        ctx.fillStyle = colors.textMuted
        ctx.fillText(sizeText, sizeX, centerY)
      }
    }

    ctx.globalAlpha = 1.0
  } else {
    let dirBgColor = colors.dirBg

    // Apply brightness boost to immediately hovered node
    if (isImmediateHovered) {
      dirBgColor = lighten(0.15, dirBgColor)
    }

    ctx.fillStyle = dirBgColor
    ctx.globalAlpha = opacity
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)

    ctx.strokeStyle = colors.dirBorder
    ctx.lineWidth = 1
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)

    if (titleBarHeight && rect.height > 20) {
      let dirTitleBgColor = colors.dirTitleBg

      // Apply brightness boost to title bar too
      if (isImmediateHovered) {
        dirTitleBgColor = lighten(0.15, dirTitleBgColor)
      }

      ctx.fillStyle = dirTitleBgColor
      ctx.fillRect(rect.x, rect.y, rect.width, titleBarHeight)

      ctx.strokeStyle = colors.dirTitleBorder
      ctx.beginPath()
      ctx.moveTo(rect.x, rect.y + titleBarHeight)
      ctx.lineTo(rect.x + rect.width, rect.y + titleBarHeight)
      ctx.stroke()

      const { titleFontSize, sizeFontSize } =
        calculateTitleFontSizes(titleBarHeight)
      const sizeText = formatBytes(node.size)
      const centerY = rect.y + titleBarHeight / 2
      const gap = 6

      ctx.textBaseline = 'middle'

      ctx.font = `${sizeFontSize}px sans-serif`
      const sizeWidth = measureTextCached(ctx, sizeText)

      const nameX = rect.x + 8
      const availableNameWidth = Math.max(0, rect.width - 16 - sizeWidth - gap)
      ctx.font = `600 ${titleFontSize}px sans-serif`
      const displayName = truncateTextWithEllipsisIfNeeded(
        ctx,
        name,
        availableNameWidth
      )

      ctx.fillStyle = colors.text
      ctx.textAlign = 'left'
      ctx.fillText(displayName, nameX, centerY, availableNameWidth)

      const nameWidth = measureTextCached(ctx, displayName)
      const sizeX = nameX + nameWidth + gap

      // Only draw size text if it fits within bounds
      if (sizeX + sizeWidth <= rect.x + rect.width - 8) {
        ctx.font = `${sizeFontSize}px sans-serif`
        ctx.fillStyle = colors.textMuted
        ctx.fillText(sizeText, sizeX, centerY)
      }
    }

    ctx.globalAlpha = 1.0

    if (children) {
      for (const child of children) {
        const childFadeOut =
          searchQuery && searchQuery.trim() !== '' ? false : fadeOut

        // Determine if children are inside active subtree
        // Children are inside if: this node is active OR we're already inside
        const activeAncestorChain =
          hoveredAncestorChain ??
          (useSelectionFade ? selectedAncestorChain : [])
        const activeSourceIndex =
          activeAncestorChain[activeAncestorChain.length - 1]
        const childInsideActiveSubtree =
          insideActiveSubtree || sourceIndex === activeSourceIndex

        drawTreemap(
          ctx,
          child,
          hoveredAncestorChain,
          selectedAncestorChain,
          useSelectionFade,
          focusedAncestorChain,
          searchQuery,
          originalData,
          immediateHoveredSourceIndex,
          path,
          childFadeOut,
          childInsideActiveSubtree
        )
      }
    }
  }
}

function wrapLayoutWithAncestorsUsingIndices(
  focusedLayout: LayoutNode,
  focusedAncestorChain: number[],
  analyzeData: AnalyzeData,
  fullWidth: number,
  fullHeight: number,
  minTitleBarHeight = 12
): LayoutNode {
  // If focusing on root, return as-is
  if (focusedAncestorChain.length <= 1) {
    return focusedLayout
  }

  let currentNode = focusedLayout
  let cumulativeY = focusedLayout.rect.y // Start from where the focused node begins

  // Work backwards from the parent of focused node to the child of root
  for (let i = focusedAncestorChain.length - 2; i >= 1; i--) {
    const ancestorIndex = focusedAncestorChain[i]
    const ancestorSource = analyzeData.source(ancestorIndex)
    if (!ancestorSource) continue

    const titleBarHeight = minTitleBarHeight

    // This ancestor starts at cumulativeY - titleBarHeight
    cumulativeY -= titleBarHeight

    const ancestorNode: LayoutNode = {
      name: ancestorSource.path,
      type: 'directory',
      size: currentNode.size,
      rect: {
        x: 0,
        y: cumulativeY,
        width: fullWidth,
        height: fullHeight - cumulativeY,
      },
      titleBarHeight: titleBarHeight,
      children: [currentNode],
      sourceIndex: ancestorIndex,
      specialModuleType: null,
    }

    currentNode = ancestorNode
  }

  cumulativeY -= minTitleBarHeight

  const rootIndex = focusedAncestorChain[0]
  const rootSource = analyzeData.source(rootIndex)

  const rootNode: LayoutNode = {
    name: rootSource?.path || '',
    type: 'directory',
    size: currentNode.size,
    rect: {
      x: 0,
      y: cumulativeY,
      width: fullWidth,
      height: fullHeight - cumulativeY,
    },
    titleBarHeight: minTitleBarHeight,
    children: [currentNode],
    sourceIndex: rootIndex,
    specialModuleType: null,
  }

  return rootNode
}

export function TreemapVisualizer({
  analyzeData,
  sourceIndex,
  selectedSourceIndex = sourceIndex,
  onSelectSourceIndex = () => {},
  focusedSourceIndex = sourceIndex,
  onFocusSourceIndex = () => {},
  isMouseInTreemap = false,
  onHoveredNodeChange,
  onHoveredNodeChangeDelayed,
  searchQuery = '',
  filterSource,
  sizeMode = SizeMode.Compressed,
}: TreemapVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredNode, setHoveredNode] = useState<LayoutNode | null>(null)
  const [shouldDimOthers, setShouldDimOthers] = useState(false)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [cssDimensions, setCssDimensions] = useState({
    width: 1200,
    height: 800,
  })
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: 1200,
    height: 800,
  })
  const [, _setTheme] = useState<'light' | 'dark'>('light')

  // Build ancestor chain for focused source (list of source indices from root to focused)
  const focusedAncestorChain = useMemo(() => {
    const chain: number[] = []
    let currentIndex = focusedSourceIndex

    while (currentIndex !== undefined && currentIndex !== null) {
      chain.unshift(currentIndex)
      const source = analyzeData.source(currentIndex)
      if (!source || source.parent_source_index === null) break
      currentIndex = source.parent_source_index
    }

    return chain
  }, [analyzeData, focusedSourceIndex])

  // Build ancestor chain for selected source
  const selectedAncestorChain = useMemo(() => {
    const chain: number[] = []
    let currentIndex = selectedSourceIndex

    while (currentIndex !== undefined && currentIndex !== null) {
      chain.unshift(currentIndex)
      const source = analyzeData.source(currentIndex)
      if (!source || source.parent_source_index === null) break
      currentIndex = source.parent_source_index
    }

    return chain
  }, [analyzeData, selectedSourceIndex])

  // Build ancestor chain for hovered node (only used for dimming)
  const hoveredAncestorChain = useMemo(() => {
    if (
      !shouldDimOthers ||
      !hoveredNode ||
      hoveredNode.sourceIndex === undefined
    )
      return null

    const chain: number[] = []
    let currentIndex = hoveredNode.sourceIndex

    while (currentIndex !== undefined && currentIndex !== null) {
      chain.unshift(currentIndex)
      const source = analyzeData.source(currentIndex)
      if (!source || source.parent_source_index === null) break
      currentIndex = source.parent_source_index
    }

    return chain
  }, [analyzeData, hoveredNode, shouldDimOthers])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      setCssDimensions({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      })
      setCanvasDimensions({
        width: Math.floor(rect.width * dpr),
        height: Math.floor(rect.height * dpr),
      })
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  const layout = useMemo(() => {
    // Compute layout using the focused source index
    const focusedLayout = computeTreemapLayoutFromAnalyze(
      analyzeData,
      focusedSourceIndex,
      {
        x: 0,
        y: 12 * focusedAncestorChain.length,
        width: cssDimensions.width,
        height: cssDimensions.height,
      },
      filterSource,
      sizeMode
    )

    // If we're not at the root, wrap with ancestor title bars
    if (focusedAncestorChain.length > 1) {
      return wrapLayoutWithAncestorsUsingIndices(
        focusedLayout,
        focusedAncestorChain,
        analyzeData,
        cssDimensions.width,
        cssDimensions.height,
        12
      )
    }

    return focusedLayout
  }, [
    analyzeData,
    focusedSourceIndex,
    focusedAncestorChain,
    cssDimensions.width,
    cssDimensions.height,
    filterSource,
    sizeMode,
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, cssDimensions.width, cssDimensions.height)

    drawTreemap(
      ctx,
      layout,
      hoveredAncestorChain,
      selectedAncestorChain,
      !isMouseInTreemap,
      focusedAncestorChain,
      searchQuery,
      layout,
      hoveredNode?.sourceIndex
    )
  }, [
    layout,
    hoveredAncestorChain,
    selectedAncestorChain,
    cssDimensions.width,
    cssDimensions.height,
    isMouseInTreemap,
    focusedAncestorChain,
    searchQuery,
    hoveredNode,
  ])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const node = findNodeAtPosition(layout, x, y)

    if (node && node.sourceIndex !== undefined) {
      // If this node is already, refocus the root node to undim others
      if (node.sourceIndex === selectedSourceIndex) {
        onSelectSourceIndex(sourceIndex)
      } else {
        onSelectSourceIndex(node.sourceIndex)
      }
    }
  }

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const node = findNodeAtPosition(layout, x, y)

    if (node && node.sourceIndex !== undefined) {
      // Navigate into directories on double-click
      if (node.type === 'directory' || node.type === 'collapsed-directory') {
        onFocusSourceIndex(node.sourceIndex)
        onSelectSourceIndex(node.sourceIndex)
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const node = findNodeAtPosition(layout, x, y)

    // Clear existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }

    if (node) {
      const nodeInfo = {
        name: node.name,
        size: node.size,
        server: node.server,
        client: node.client,
      }

      if (node.type === 'directory') {
        const titleBarHeight = node.titleBarHeight || 0
        if (y >= node.rect.y && y <= node.rect.y + titleBarHeight) {
          canvas.style.cursor = 'pointer'
          // Immediately set for brightness increase and footer/tooltip updates
          setHoveredNode(node)
          setShouldDimOthers(false)
          onHoveredNodeChange?.(nodeInfo)
          // Delay dimming other nodes by 800ms
          hoverTimeoutRef.current = setTimeout(() => {
            setShouldDimOthers(true)
            onHoveredNodeChangeDelayed?.(nodeInfo)
          }, 1000)
          return
        }
      } else {
        canvas.style.cursor = 'pointer'
        // Immediately set for brightness increase and footer/tooltip updates
        setHoveredNode(node)
        setShouldDimOthers(false)
        onHoveredNodeChange?.(nodeInfo)
        // Delay dimming other nodes by 800ms
        hoverTimeoutRef.current = setTimeout(() => {
          setShouldDimOthers(true)
          onHoveredNodeChangeDelayed?.(nodeInfo)
        }, 1000)
        return
      }
    }

    // Immediately clear hover when mouse leaves a node
    setHoveredNode(null)
    setShouldDimOthers(false)
    onHoveredNodeChange?.(null)
    onHoveredNodeChangeDelayed?.(null)
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'default'
    }
  }

  const handleMouseLeave = () => {
    // Clear timeout when mouse leaves canvas
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }

    setHoveredNode(null)
    setShouldDimOthers(false)
    onHoveredNodeChange?.(null)
    onHoveredNodeChangeDelayed?.(null)
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'default'
    }
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-background border border-border rounded-lg overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        width={canvasDimensions.width}
        height={canvasDimensions.height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className="block w-full h-full"
      />
    </div>
  )
}

function isDarkMode(): boolean {
  if (typeof window === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

function getThemeColors() {
  const dark = isDarkMode()
  return {
    text: dark ? '#ffffff' : '#000000',
    textMuted: dark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)',
    border: dark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(180, 180, 180, 0.5)',
    dirBg: dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(230, 230, 230, 0.1)',
    dirBorder: dark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(180, 180, 180, 0.6)',
    dirTitleBg: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(230, 230, 230, 0.1)',
    dirTitleBorder: dark
      ? 'rgba(255, 255, 255, 0.4)'
      : 'rgba(180, 180, 180, 0.5)',
    collapsedBg: dark
      ? 'rgba(128, 128, 128, 0.15)'
      : 'rgba(230, 230, 230, 0.2)',
    collapsedText: dark
      ? 'rgba(255, 255, 255, 0.5)'
      : 'rgba(128, 128, 128, 0.6)',
  }
}
