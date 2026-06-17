// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
}

export interface SpanData {
  spanId: string
  parentSpanId?: string
  name: string
  startTime: number // ms from epoch
  duration: number // ms
  attributes?: Record<string, unknown>
}

interface SpanTreeNode extends SpanData {
  children: SpanTreeNode[]
}

// Convert HrTime [seconds, nanoseconds] to milliseconds
export function hrTimeToMs(hrTime: [number, number]): number {
  return hrTime[0] * 1000 + hrTime[1] / 1_000_000
}

// Build tree structure from flat span list
function buildSpanTree(spans: SpanData[]): SpanTreeNode | null {
  if (spans.length === 0) return null

  const spanMap = new Map<string, SpanTreeNode>()

  // Create nodes for all spans
  for (const span of spans) {
    spanMap.set(span.spanId, { ...span, children: [] })
  }

  let root: SpanTreeNode | null = null

  // Link children to parents
  for (const span of spans) {
    const node = spanMap.get(span.spanId)!
    if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
      const parent = spanMap.get(span.parentSpanId)!
      parent.children.push(node)
    } else if (!span.parentSpanId) {
      root = node
    }
  }

  // Sort children by start time
  function sortChildren(node: SpanTreeNode) {
    node.children.sort((a, b) => a.startTime - b.startTime)
    node.children.forEach(sortChildren)
  }

  if (root) {
    sortChildren(root)
  } else if (spans.length > 0) {
    // If no root found, use the span with the earliest start time
    const sortedSpans = [...spans].sort((a, b) => a.startTime - b.startTime)
    root = spanMap.get(sortedSpans[0].spanId)!
  }

  return root
}

// Get color based on duration relative to total
function getDurationColor(duration: number, totalDuration: number): string {
  const ratio = duration / totalDuration
  if (ratio < 0.1) return colors.green
  if (ratio < 0.4) return colors.yellow
  return colors.red
}

// Render a timeline bar showing start offset and duration
function renderTimelineBar(
  startTime: number,
  duration: number,
  traceStartTime: number,
  totalDuration: number,
  barWidth: number = 40
): string {
  if (totalDuration === 0) return '█'.repeat(barWidth)

  const startOffset = Math.max(0, startTime - traceStartTime)
  const startRatio = Math.min(startOffset / totalDuration, 1)
  const durationRatio = Math.min(duration / totalDuration, 1 - startRatio)

  const startPos = Math.max(0, Math.round(startRatio * barWidth))
  const barLength = Math.max(1, Math.round(durationRatio * barWidth))
  // Ensure bar fits and has at least 1 char
  const adjustedStartPos = Math.min(startPos, barWidth - 1)
  const endPos = Math.min(barWidth, adjustedStartPos + barLength)

  const before = '·'.repeat(adjustedStartPos)
  const bar = '█'.repeat(Math.max(1, endPos - adjustedStartPos))
  const after = '·'.repeat(Math.max(0, barWidth - endPos))

  return before + bar + after
}

// Render the span tree as ASCII with timeline
function renderSpanTree(
  root: SpanTreeNode,
  totalDuration: number,
  traceStartTime: number
): string {
  const lines: string[] = []
  const timelineWidth = 100
  const nameColWidth = 65

  // Add timeline header with time markers
  const pad = ' '.repeat(nameColWidth)
  const timeMarkers = `${pad}${colors.dim}0ms${' '.repeat(timelineWidth - 7)}${totalDuration.toFixed(0)}ms${colors.reset}`
  lines.push(timeMarkers)

  function renderNode(
    node: SpanTreeNode,
    prefix: string,
    isLast: boolean,
    isRoot: boolean
  ) {
    const connector = isRoot ? '' : isLast ? '└─ ' : '├─ '
    const durationMs = node.duration.toFixed(1)
    const color = getDurationColor(node.duration, totalDuration)
    const timelineBar = renderTimelineBar(
      node.startTime,
      node.duration,
      traceStartTime,
      totalDuration,
      timelineWidth
    )

    // Format attributes as key=value pairs
    let attrStr = ''
    if (node.attributes && Object.keys(node.attributes).length > 0) {
      const pairs = Object.entries(node.attributes)
        .slice(0, 2) // Limit to first 2 attributes
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
      attrStr = ` [${pairs}]`
    }

    // Build name with duration
    const nameWithDuration = `${prefix}${connector}${node.name}${attrStr} (${durationMs}ms)`
    // Pad or truncate to fixed width
    const displayName =
      nameWithDuration.length > nameColWidth
        ? nameWithDuration.slice(0, nameColWidth - 1) + '…'
        : nameWithDuration.padEnd(nameColWidth)

    const line = `${color}${displayName}${colors.reset}${colors.dim}│${colors.reset}${color}${timelineBar}${colors.reset}${colors.dim}│${colors.reset}`
    lines.push(line)

    const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ')
    node.children.forEach((child, index) => {
      renderNode(child, childPrefix, index === node.children.length - 1, false)
    })
  }

  renderNode(root, '', true, true)
  return lines.join('\n')
}

// Render complete trace to console
export function renderTrace(traceId: string, spans: SpanData[]): void {
  const tree = buildSpanTree(spans)
  if (!tree) return

  const totalDuration = tree.duration
  const traceStartTime = tree.startTime
  const shortTraceId = traceId.slice(0, 8)

  console.log('')
  console.log(
    `${colors.bold}${colors.cyan}Trace ${shortTraceId}${colors.reset} ${colors.dim}(${totalDuration.toFixed(1)}ms total, ${spans.length} spans)${colors.reset}`
  )
  console.log(renderSpanTree(tree, totalDuration, traceStartTime))
  console.log('')
}
