import type {
  RequestInsight,
  RequestInsightFetch,
  RequestInsightSpan,
} from '../../../shared/request-insights'

export type TraceItem = {
  id: string
  spanId?: string
  parentSpanId?: string
  spanType?: string
  category: 'nextjs' | 'application'
  label: string
  startTime: number
  durationMs?: number
  status: 'ok' | 'error' | 'pending'
  kind: 'span' | 'fetch'
  depth: number
}

export type TraceRange = {
  startTime: number
  durationMs: number
}

type UnnestedTraceItem = Omit<TraceItem, 'depth'>

const FETCH_SPAN_TYPE = 'AppRender.fetch'
const DEFAULT_VISIBLE_SPAN_TYPES = new Set([
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
  FETCH_SPAN_TYPE,
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
const SPAN_WORD_CASE: Record<string, string> = {
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
  const fetchSpansByIndex = new Map<number, RequestInsightSpan>()

  for (const span of request.spans) {
    const fetchIndex = getFetchIndex(span)
    if (isFetchSpan(span) && fetchIndex !== undefined) {
      fetchSpansByIndex.set(fetchIndex, span)
    }
  }

  const fetchIndexes = new Set(
    request.fetches
      .map((fetch) => fetch.index)
      .filter((index): index is number => index !== undefined)
  )
  const items: UnnestedTraceItem[] = []

  request.spans.forEach((span, index) => {
    const fetchIndex = getFetchIndex(span)
    if (
      isFetchSpan(span) &&
      fetchIndex !== undefined &&
      fetchIndexes.has(fetchIndex)
    ) {
      return
    }

    items.push(getSpanTraceItem(span, index))
  })

  request.fetches.forEach((fetch, index) => {
    const matchingSpan =
      fetch.index === undefined ? undefined : fetchSpansByIndex.get(fetch.index)
    const item = getFetchTraceItem(fetch, index, matchingSpan)
    if (item) {
      items.push(item)
    }
  })

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

function getSpanTraceItem(
  span: RequestInsightSpan,
  index: number
): UnnestedTraceItem {
  const type = span.attributes?.['next.span_type']

  return {
    id: `span:${span.spanId ?? index}:${span.startTime}`,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    spanType: typeof type === 'string' ? type : undefined,
    category: getSpanCategory(span),
    label: getSpanLabel(span),
    startTime: span.startTime,
    durationMs: span.durationMs,
    status: span.status ?? 'pending',
    kind: 'span',
  }
}

function getFetchTraceItem(
  fetch: RequestInsightFetch,
  index: number,
  matchingSpan: RequestInsightSpan | undefined
): UnnestedTraceItem | null {
  const startTime = fetch.startTime ?? matchingSpan?.startTime
  if (startTime === undefined) {
    return null
  }

  return {
    id: `fetch:${matchingSpan?.spanId ?? fetch.index ?? index}:${startTime}`,
    spanId: matchingSpan?.spanId,
    parentSpanId: matchingSpan?.parentSpanId,
    spanType: FETCH_SPAN_TYPE,
    category: matchingSpan ? getSpanCategory(matchingSpan) : 'application',
    label: `${fetch.method ?? 'GET'} ${getUrlPath(fetch.url)}`,
    startTime,
    durationMs: fetch.durationMs ?? matchingSpan?.durationMs,
    status:
      fetch.statusCode && fetch.statusCode >= 400
        ? 'error'
        : (matchingSpan?.status ?? 'ok'),
    kind: 'fetch',
  }
}

function nestTraceItems(items: UnnestedTraceItem[]): TraceItem[] {
  const sortedItems = [...items].sort(compareTraceItems)
  const itemBySpanId = new Map<string, UnnestedTraceItem>()
  const childrenByItemId = new Map<string, UnnestedTraceItem[]>()
  const roots: UnnestedTraceItem[] = []

  for (const item of sortedItems) {
    if (item.spanId && !itemBySpanId.has(item.spanId)) {
      itemBySpanId.set(item.spanId, item)
    }
  }

  for (const item of sortedItems) {
    const parent = item.parentSpanId
      ? itemBySpanId.get(item.parentSpanId)
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

  // Cyclic or otherwise malformed parent references should not hide spans.
  for (const item of sortedItems) {
    append(item, 0)
  }

  return nestedItems
}

function getDefaultTraceItems(items: TraceItem[]): TraceItem[] {
  const itemBySpanId = new Map<string, TraceItem>()
  const visibleDepthBySpanId = new Map<string, number>()
  const visibleItems: TraceItem[] = []

  for (const item of items) {
    if (item.spanId) {
      itemBySpanId.set(item.spanId, item)
    }
  }

  for (const item of items) {
    if (!isDefaultVisible(item)) {
      continue
    }

    let depth = 0
    let parent = item.parentSpanId
      ? itemBySpanId.get(item.parentSpanId)
      : undefined
    const visited = new Set<string>()

    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id)
      const parentDepth = parent.spanId
        ? visibleDepthBySpanId.get(parent.spanId)
        : undefined

      if (parentDepth !== undefined) {
        depth = parentDepth + 1
        break
      }

      parent = parent.parentSpanId
        ? itemBySpanId.get(parent.parentSpanId)
        : undefined
    }

    const visibleItem = { ...item, depth }
    visibleItems.push(visibleItem)
    if (visibleItem.spanId) {
      visibleDepthBySpanId.set(visibleItem.spanId, depth)
    }
  }

  return visibleItems
}

function isDefaultVisible(item: TraceItem): boolean {
  return (
    item.spanType === undefined ||
    item.status === 'error' ||
    DEFAULT_VISIBLE_SPAN_TYPES.has(item.spanType)
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

function isFetchSpan(span: RequestInsightSpan): boolean {
  return span.attributes?.['next.span_type'] === FETCH_SPAN_TYPE
}

function getFetchIndex(span: RequestInsightSpan): number | undefined {
  const index = span.attributes?.['next.fetch.idx']
  return typeof index === 'number' ? index : undefined
}

function getSpanCategory(span: RequestInsightSpan): 'nextjs' | 'application' {
  const category = span.attributes?.['next.span_category']
  if (category === 'nextjs' || category === 'application') {
    return category
  }

  if (span.attributes?.['next.span_type'] === FETCH_SPAN_TYPE) {
    return 'application'
  }

  return typeof span.attributes?.['next.span_type'] === 'string'
    ? 'nextjs'
    : 'application'
}

function getSpanLabel(span: RequestInsightSpan): string {
  const explicitName = span.attributes?.['next.span_name']
  const name =
    typeof explicitName === 'string' && explicitName.trim().length > 0
      ? explicitName
      : span.name
  const displayName = name
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
    .map((word) => SPAN_WORD_CASE[word.toLowerCase()] ?? word.toLowerCase())
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
