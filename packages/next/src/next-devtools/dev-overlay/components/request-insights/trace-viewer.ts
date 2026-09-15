import type {
  RequestInsight,
  RequestInsightFetch,
  RequestInsightSpan,
} from '../../../shared/request-insights'
import type { StackFrame } from '../../../shared/stack-frame'

export type TraceItem = {
  id: string
  spanId?: string
  parentSpanId?: string
  spanType?: string
  reactTiming?: {
    kind: 'component' | 'await' | 'incomplete'
    incompleteReason?: string
    renderId?: string
    environment: string
    source?: StackFrame
    componentPath?: string
  }
  category: 'nextjs' | 'application'
  label: string
  fullLabel?: string
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

export type ReactTimingGroup = {
  id: string
  renderId?: string
  incompleteReason?: string
  environment: string
  range: TraceRange
  components: TraceItem[]
  awaits: TraceItem[]
}

export function getReactTimingGroups(items: TraceItem[]): ReactTimingGroup[] {
  const groups = new Map<string, ReactTimingGroup>()
  const incomplete: TraceItem[] = []
  for (const item of items) {
    if (!item.reactTiming) continue
    const { renderId, environment, kind } = item.reactTiming
    if (kind === 'incomplete') {
      incomplete.push(item)
      continue
    }
    // Older session records have no render ID. Keep those intervals separate
    // rather than inferring render passes from a shared parent or timestamp.
    const id = JSON.stringify([renderId ?? item.id, environment])
    let group = groups.get(id)
    const endTime = item.startTime + (item.durationMs ?? 0)
    if (!group) {
      group = {
        id,
        renderId,
        environment,
        range: { startTime: item.startTime, durationMs: item.durationMs ?? 0 },
        components: [],
        awaits: [],
      }
      groups.set(id, group)
    } else {
      const end = Math.max(
        endTime,
        group.range.startTime + group.range.durationMs
      )
      group.range.startTime = Math.min(group.range.startTime, item.startTime)
      group.range.durationMs = end - group.range.startTime
    }
    // These records are intervals, not an inclusive component ownership tree.
    const interval = { ...item, depth: 0 }
    if (kind === 'component') group.components.push(interval)
    else group.awaits.push(interval)
  }
  for (const item of incomplete) {
    const { renderId, incompleteReason } = item.reactTiming!
    let found = false
    for (const group of groups.values()) {
      if (renderId !== undefined && group.renderId === renderId) {
        group.incompleteReason = incompleteReason
        found = true
      }
    }
    if (!found) {
      groups.set(item.id, {
        id: item.id,
        renderId,
        incompleteReason,
        environment: '',
        range: { startTime: item.startTime, durationMs: 0 },
        components: [],
        awaits: [],
      })
    }
  }
  return [...groups.values()].sort(
    (a, b) => a.range.startTime - b.range.startTime
  )
}

type UnnestedTraceItem = Omit<TraceItem, 'depth'>

const FETCH_SPAN_TYPE = 'AppRender.fetch'
const REACT_COMPONENT_SPAN_TYPE = 'ReactServerComponents.component'
const REACT_AWAIT_SPAN_TYPE = 'ReactServerComponents.await'
const REACT_INCOMPLETE_SPAN_TYPE = 'ReactServerComponents.incomplete'
const MIDDLEWARE_SPAN_TYPE = 'Middleware.execute'
const DEFAULT_VISIBLE_SPAN_TYPES = new Set([
  'BaseServer.handleRequest',
  MIDDLEWARE_SPAN_TYPE,
  'NextNodeServer.matchRoute',
  'DevBundlerService.ensurePage',
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
  'AppRender.instantInsights',
  'AppRender.instantInsights.prepareValidation',
  'AppRender.instantInsights.runValidation',
  'AppRender.instantInsights.warmup',
  'AppRender.instantInsights.staticShell',
  'AppRender.instantInsights.validate',
  FETCH_SPAN_TYPE,
  REACT_COMPONENT_SPAN_TYPE,
  REACT_AWAIT_SPAN_TYPE,
  REACT_INCOMPLETE_SPAN_TYPE,
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
  const owner = span.attributes?.['next.rsc.owner']
  const label =
    getSpanLabel(span) +
    (type === REACT_AWAIT_SPAN_TYPE && typeof owner === 'string' && owner
      ? ` · ${owner}`
      : '')
  const reactTiming =
    type === REACT_COMPONENT_SPAN_TYPE
      ? 'React render interval'
      : type === REACT_AWAIT_SPAN_TYPE
        ? 'React await interval'
        : type === REACT_INCOMPLETE_SPAN_TYPE
          ? 'Incomplete React timing recording'
          : undefined
  const environment = span.attributes?.['next.rsc.environment']
  const renderId = span.attributes?.['next.rsc.render_id']
  const componentPath = span.attributes?.['next.rsc.component_path']
  const incompleteReason = span.attributes?.['next.rsc.incomplete_reason']
  const file = span.attributes?.['next.rsc.source.file']
  const line1 = span.attributes?.['next.rsc.source.line']
  const column1 = span.attributes?.['next.rsc.source.column']
  const methodName = span.attributes?.['next.rsc.source.name']
  const source =
    typeof file === 'string' &&
    file.length > 0 &&
    file.length <= 2048 &&
    typeof line1 === 'number' &&
    Number.isSafeInteger(line1) &&
    line1 > 0 &&
    typeof column1 === 'number' &&
    Number.isSafeInteger(column1) &&
    column1 > 0
      ? {
          file,
          line1,
          column1,
          methodName: typeof methodName === 'string' ? methodName : '',
          arguments: [],
        }
      : undefined

  return {
    id: `span:${span.spanId ?? index}:${span.startTime}`,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    spanType: typeof type === 'string' ? type : undefined,
    reactTiming: reactTiming
      ? {
          source,
          componentPath:
            typeof componentPath === 'string' ? componentPath : undefined,
          kind:
            type === REACT_COMPONENT_SPAN_TYPE
              ? 'component'
              : type === REACT_AWAIT_SPAN_TYPE
                ? 'await'
                : 'incomplete',
          incompleteReason:
            typeof incompleteReason === 'string' ? incompleteReason : undefined,
          renderId: typeof renderId === 'string' ? renderId : undefined,
          environment: typeof environment === 'string' ? environment : '',
        }
      : undefined,
    category: getSpanCategory(span),
    label,
    fullLabel: reactTiming
      ? `${label} · ${reactTiming}${typeof environment === 'string' && environment ? ` · ${environment}` : ''}${environment === 'Cache' ? ' · May include replayed timings from cached output' : ''}`
      : undefined,
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

  const type = span.attributes?.['next.span_type']
  if (
    type === FETCH_SPAN_TYPE ||
    type === REACT_COMPONENT_SPAN_TYPE ||
    type === REACT_AWAIT_SPAN_TYPE
  ) {
    return 'application'
  }

  return typeof span.attributes?.['next.span_type'] === 'string'
    ? 'nextjs'
    : 'application'
}

function getSpanLabel(span: RequestInsightSpan): string {
  const explicitName = span.attributes?.['next.span_name']
  const type = span.attributes?.['next.span_type']
  const name =
    typeof explicitName === 'string' && explicitName.trim().length > 0
      ? explicitName
      : span.name
  if (type === REACT_COMPONENT_SPAN_TYPE || type === REACT_AWAIT_SPAN_TYPE) {
    return name
  }
  const displayName = name
    .replace(FIZZ_WORD, 'HTML')
    .replace(FLIGHT_WORD, 'RSC')

  if (span.attributes?.['next.span_type'] === MIDDLEWARE_SPAN_TYPE) {
    const method = span.attributes['http.method']
    return typeof method === 'string' && method.length > 0
      ? `proxy ${method}`
      : displayName.replace(/^middleware\b/i, 'proxy')
  }

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
