import type {
  RequestInsight,
  RequestInsightFetch,
  RequestInsightOperation,
} from '../../../shared/request-insights'

export type TraceItem = {
  id: string
  operationId?: number
  parentOperationId?: number
  operationType?: string
  category: 'nextjs' | 'application'
  label: string
  startTime: number
  durationMs?: number
  status: 'ok' | 'error'
  kind: 'operation' | 'fetch'
  depth: number
}

export type TraceRange = {
  startTime: number
  durationMs: number
}

type UnnestedTraceItem = Omit<TraceItem, 'depth'>

const FETCH_OPERATION_TYPE = 'AppRender.fetch'
const DEFAULT_VISIBLE_OPERATION_TYPES = new Set([
  'BaseServer.handleRequest',
  'Middleware.execute',
  'NextNodeServer.matchRoute',
  'DevRouteMatcherManager.ensureRoute',
  'BaseServer.render',
  'LoadComponents.loadComponents',
  'AppRender.prepareAppPageResponse',
  'AppRender.initializeRender',
  'AppRender.getBodyResult',
  'NextNodeServer.createComponentTree',
  'AppRender.startRSCStream',
  'AppRender.renderRSCResponse',
  'AppRender.waitForRSC',
  'AppRender.renderToNodeFizzStream',
  'AppRender.waitForHTMLCompletion',
  FETCH_OPERATION_TYPE,
  'NextNodeServer.waitForFirstResponseChunk',
  'NextNodeServer.startResponse',
  'Render.getServerSideProps',
  'Render.getStaticProps',
  'Render.renderDocument',
  'Node.runHandler',
  'AppRouteRouteHandlers.runHandler',
  'ResolveMetadata.generateMetadata',
  'ResolveMetadata.generateViewport',
])
const FIZZ_WORD = /\bFizz\b/gi
const FLIGHT_WORD = /\bFlight\b/gi
const OPERATION_WORD_CASE: Record<string, string> = {
  api: 'API',
  fizz: 'HTML',
  flight: 'RSC',
  html: 'HTML',
  http: 'HTTP',
  https: 'HTTPS',
  id: 'ID',
  node: 'Node',
  rsc: 'RSC',
  url: 'URL',
}

export function getTraceItems(
  request: RequestInsight,
  verbose: boolean
): TraceItem[] {
  const items: UnnestedTraceItem[] = []

  for (const operation of request.operations) {
    items.push(getOperationTraceItem(operation))
  }

  for (const fetch of request.fetches) {
    const item = getFetchTraceItem(fetch)
    if (item) {
      items.push(item)
    }
  }

  const nestedItems = nestTraceItems(items)
  return verbose ? nestedItems : getDefaultTraceItems(nestedItems)
}

export function getTraceRange(request: RequestInsight): TraceRange {
  return {
    startTime: request.startTime,
    durationMs: Math.max(request.durationMs ?? 0, 0.1),
  }
}

export function getTracePosition(
  item: TraceItem,
  range: TraceRange
): { left: number; width: number; offsetMs: number } {
  const rangeEndTime = range.startTime + range.durationMs
  const visibleStartTime = Math.max(item.startTime, range.startTime)
  const visibleEndTime = Math.min(
    item.startTime + (item.durationMs ?? 0),
    rangeEndTime
  )
  const offsetMs = Math.min(
    Math.max(visibleStartTime - range.startTime, 0),
    range.durationMs
  )
  const left = Math.min((offsetMs / range.durationMs) * 100, 100)
  const width = Math.min(
    Math.max(((visibleEndTime - visibleStartTime) / range.durationMs) * 100, 0),
    100 - left
  )

  return { left, width, offsetMs }
}

function getOperationTraceItem(
  operation: RequestInsightOperation
): UnnestedTraceItem {
  return {
    id: `operation:${operation.id}`,
    operationId: operation.id,
    parentOperationId: operation.parentId,
    operationType: operation.type,
    category: operation.category,
    label: getOperationLabel(operation),
    startTime: operation.startTime,
    durationMs: operation.durationMs,
    status: operation.status,
    kind: 'operation',
  }
}

function getFetchTraceItem(
  fetch: RequestInsightFetch
): UnnestedTraceItem | null {
  const startTime = fetch.startTime
  if (startTime === undefined) {
    return null
  }

  return {
    id: `fetch:${fetch.id}`,
    parentOperationId: fetch.parentOperationId,
    operationType: FETCH_OPERATION_TYPE,
    category: 'application',
    label: `${fetch.method ?? 'GET'} ${getUrlPath(fetch.url)}`,
    startTime,
    durationMs: fetch.durationMs,
    status: fetch.statusCode && fetch.statusCode >= 400 ? 'error' : 'ok',
    kind: 'fetch',
  }
}

function nestTraceItems(items: UnnestedTraceItem[]): TraceItem[] {
  const sortedItems = [...items].sort(compareTraceItems)
  const itemByOperationId = new Map<number, UnnestedTraceItem>()
  const childrenByItemId = new Map<string, UnnestedTraceItem[]>()
  const roots: UnnestedTraceItem[] = []

  for (const item of sortedItems) {
    if (
      item.operationId !== undefined &&
      !itemByOperationId.has(item.operationId)
    ) {
      itemByOperationId.set(item.operationId, item)
    }
  }

  for (const item of sortedItems) {
    const parent =
      item.parentOperationId !== undefined
        ? itemByOperationId.get(item.parentOperationId)
        : undefined

    if (!parent || parent.id === item.id) {
      roots.push(item)
      continue
    }

    const children = childrenByItemId.get(parent.id) ?? []
    children.push(item)
    childrenByItemId.set(parent.id, children)
  }

  const nestedItems: TraceItem[] = []
  const visited = new Set<string>()

  function append(item: UnnestedTraceItem, depth: number): void {
    if (visited.has(item.id)) {
      return
    }

    visited.add(item.id)
    nestedItems.push({ ...item, depth })

    for (const child of childrenByItemId.get(item.id) ?? []) {
      append(child, depth + 1)
    }
  }

  for (const root of roots) {
    append(root, 0)
  }

  // Cyclic or otherwise malformed parent references should not hide operations.
  for (const item of sortedItems) {
    append(item, 0)
  }

  return nestedItems
}

function getDefaultTraceItems(items: TraceItem[]): TraceItem[] {
  const itemByOperationId = new Map<number, TraceItem>()
  const visibleDepthByOperationId = new Map<number, number>()
  const visibleItems: TraceItem[] = []

  for (const item of items) {
    if (item.operationId !== undefined) {
      itemByOperationId.set(item.operationId, item)
    }
  }

  for (const item of items) {
    if (!isDefaultVisible(item)) {
      continue
    }

    let depth = 0
    let parent =
      item.parentOperationId !== undefined
        ? itemByOperationId.get(item.parentOperationId)
        : undefined
    const visited = new Set<string>()

    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id)
      const parentDepth =
        parent.operationId !== undefined
          ? visibleDepthByOperationId.get(parent.operationId)
          : undefined

      if (parentDepth !== undefined) {
        depth = parentDepth + 1
        break
      }

      parent =
        parent.parentOperationId !== undefined
          ? itemByOperationId.get(parent.parentOperationId)
          : undefined
    }

    const visibleItem = { ...item, depth }
    visibleItems.push(visibleItem)
    if (visibleItem.operationId !== undefined) {
      visibleDepthByOperationId.set(visibleItem.operationId, depth)
    }
  }

  return visibleItems
}

function isDefaultVisible(item: TraceItem): boolean {
  return (
    item.category === 'application' ||
    item.status === 'error' ||
    DEFAULT_VISIBLE_OPERATION_TYPES.has(item.operationType ?? '')
  )
}

function compareTraceItems(
  first: UnnestedTraceItem,
  second: UnnestedTraceItem
): number {
  return (
    first.startTime - second.startTime ||
    (second.durationMs ?? 0) - (first.durationMs ?? 0) ||
    first.id.localeCompare(second.id)
  )
}

function getOperationLabel(operation: RequestInsightOperation): string {
  const displayName = operation.name
    .replace(FIZZ_WORD, 'HTML')
    .replace(FLIGHT_WORD, 'RSC')

  if (displayName === 'resolve segment modules') {
    return 'resolve segment'
  }

  if (displayName === 'build component tree') {
    return 'build component tree'
  }

  if (!displayName.includes('.') && !/[a-z][A-Z]|[_-]/.test(displayName)) {
    return displayName
  }

  const identifier = displayName.slice(displayName.lastIndexOf('.') + 1)
  const words = identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(
      (word) => OPERATION_WORD_CASE[word.toLowerCase()] ?? word.toLowerCase()
    )
    .filter(
      (word, index, allWords) =>
        !(
          (word === 'Node' || word === 'web') &&
          (allWords[index + 1] === 'HTML' || allWords[index + 1] === 'RSC')
        )
    )

  if (words[0] === 'wait' && words[1] !== 'for') {
    words.splice(1, 0, 'for')
  }

  return words.join(' ')
}

function getUrlPath(url: string | undefined): string {
  if (!url) {
    return 'Unknown URL'
  }

  try {
    const parsedUrl = new URL(url, 'http://localhost')
    return `${parsedUrl.pathname}${parsedUrl.search}`
  } catch {
    return url
  }
}
