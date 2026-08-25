import {
  REQUEST_INSIGHT_PROXY_SPAN_TYPE,
  REQUEST_INSIGHT_REQUEST_SPAN_TYPE,
  type RequestInsight,
  type RequestInsightSpan,
} from './request-insights'
import {
  getRequestInsightKind,
  getRequestInsightSource,
} from '../../shared/lib/request-insights'

export type RequestInsightFilter =
  | 'source:page'
  | 'source:api'
  | 'source:image'
  | 'source:asset'
  | 'source:unknown'
  | 'representation:html'
  | 'representation:rsc'
  | 'representation:unknown'
  | 'activity:proxy'
  | 'activity:instant-insights'
  | 'status:error'
  | 'status:http-4xx'
  | 'status:http-5xx'
  | 'fetches:present'
  | 'fetches:none'
  | 'cache:hit'
  | 'cache:miss'
  | 'cache:skip'
  | 'cache:none'

export const REQUEST_INSIGHT_FILTERS: readonly RequestInsightFilter[] = [
  'source:page',
  'source:api',
  'source:image',
  'source:asset',
  'source:unknown',
  'representation:html',
  'representation:rsc',
  'representation:unknown',
  'activity:proxy',
  'activity:instant-insights',
  'status:error',
  'status:http-4xx',
  'status:http-5xx',
  'fetches:present',
  'fetches:none',
  'cache:hit',
  'cache:miss',
  'cache:skip',
  'cache:none',
]

export type RequestInsightSummary = Omit<
  RequestInsight,
  'spans' | 'fetches'
> & {
  spanCount: number
  fetchCount: number
  statusCode?: number
  isRsc?: boolean
  hasError: boolean
  hasProxyActivity: boolean
  cacheStatuses: Array<'hit' | 'miss' | 'skip'>
}

export type RequestInsightListItem = RequestInsight | RequestInsightSummary

export type RequestInsightsHistoryPage = {
  sessionId: string
  generation: number
  requests: RequestInsightSummary[]
  matchingRequestCount: number
  totalRequestCount: number
  optionCounts: Record<RequestInsightFilter, number>
  nextCursor?: string
  truncated: boolean
}

export function isRequestInsightSummary(
  request: RequestInsightListItem
): request is RequestInsightSummary {
  return 'spanCount' in request
}

export function summarizeRequestInsight(
  request: RequestInsight
): RequestInsightSummary {
  const cacheStatuses = new Set<'hit' | 'miss' | 'skip'>()
  for (const fetch of request.fetches) {
    if (
      fetch.cacheStatus === 'hit' ||
      fetch.cacheStatus === 'miss' ||
      fetch.cacheStatus === 'skip'
    ) {
      cacheStatuses.add(fetch.cacheStatus)
    }
  }

  return {
    requestId: request.requestId,
    kind: request.kind,
    source: request.source,
    proxyStatus: request.proxyStatus,
    htmlRequestId: request.htmlRequestId,
    route: request.route,
    url: request.url,
    startTime: request.startTime,
    durationMs: request.durationMs,
    completedAt: request.completedAt,
    status: request.status,
    spanCount: request.spans.length,
    fetchCount: request.fetches.length,
    statusCode: getRequestStatusCode(request),
    isRsc: getRequestIsRsc(request),
    hasError:
      request.status === 'error' ||
      request.spans.some((span) => span.status === 'error' || span.error),
    hasProxyActivity:
      getRequestInsightSource(request) === 'proxy' ||
      request.proxyStatus === 'matched' ||
      request.spans.some(
        (span) =>
          span.attributes?.['next.span_type'] ===
          REQUEST_INSIGHT_PROXY_SPAN_TYPE
      ),
    cacheStatuses: [...cacheStatuses],
  }
}

export function getRequestInsightFetchCount(
  request: RequestInsightListItem
): number {
  return isRequestInsightSummary(request)
    ? request.fetchCount
    : request.fetches.length
}

export function getRequestInsightSpanCount(
  request: RequestInsightListItem
): number {
  return isRequestInsightSummary(request)
    ? request.spanCount
    : request.spans.length
}

export function getRequestInsightStatusCode(
  request: RequestInsightListItem
): number | undefined {
  return isRequestInsightSummary(request)
    ? request.statusCode
    : getRequestStatusCode(request)
}

export function getRequestInsightIsRsc(
  request: RequestInsightListItem
): boolean | undefined {
  return isRequestInsightSummary(request)
    ? request.isRsc
    : getRequestIsRsc(request)
}

export function hasRequestInsightError(
  request: RequestInsightListItem
): boolean {
  return isRequestInsightSummary(request)
    ? request.hasError
    : request.status === 'error' ||
        request.spans.some((span) => span.status === 'error' || span.error)
}

export function hasRequestInsightProxyActivity(
  request: RequestInsightListItem
): boolean {
  return isRequestInsightSummary(request)
    ? request.hasProxyActivity
    : getRequestInsightSource(request) === 'proxy' ||
        request.proxyStatus === 'matched' ||
        request.spans.some(
          (span) =>
            span.attributes?.['next.span_type'] ===
            REQUEST_INSIGHT_PROXY_SPAN_TYPE
        )
}

export function getRequestInsightCacheStatuses(
  request: RequestInsightListItem
): readonly string[] {
  return isRequestInsightSummary(request)
    ? request.cacheStatuses
    : request.fetches.flatMap((fetch) =>
        fetch.cacheStatus ? [fetch.cacheStatus] : []
      )
}

export function getRequestInsightTags(
  request: RequestInsightListItem
): Set<RequestInsightFilter> {
  const tags = new Set<RequestInsightFilter>()
  const source = getRequestInsightSource(request)
  switch (source) {
    case 'page':
      tags.add('source:page')
      break
    case 'app-route':
    case 'pages-api':
      tags.add('source:api')
      break
    case 'image':
      tags.add('source:image')
      break
    case 'asset':
      tags.add('source:asset')
      break
    case 'unknown':
      tags.add('source:unknown')
      break
    case 'proxy':
    case 'instant-insights':
      break
  }

  if (source === 'page') {
    const isRsc = getRequestInsightIsRsc(request)
    tags.add(
      isRsc === true
        ? 'representation:rsc'
        : isRsc === false
          ? 'representation:html'
          : 'representation:unknown'
    )
  } else if (source === 'unknown') {
    tags.add('representation:unknown')
  }

  if (hasRequestInsightProxyActivity(request)) {
    tags.add('activity:proxy')
  }
  if (getRequestInsightKind(request) === 'instant-insights') {
    tags.add('activity:instant-insights')
  }

  if (hasRequestInsightError(request)) {
    tags.add('status:error')
  }
  const statusCode = getRequestInsightStatusCode(request)
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    tags.add('status:http-4xx')
  } else if (
    statusCode !== undefined &&
    statusCode >= 500 &&
    statusCode < 600
  ) {
    tags.add('status:http-5xx')
  }

  const fetchCount = getRequestInsightFetchCount(request)
  if (fetchCount === 0) {
    tags.add('fetches:none')
    tags.add('cache:none')
  } else {
    tags.add('fetches:present')
    for (const cacheStatus of getRequestInsightCacheStatuses(request)) {
      if (
        cacheStatus === 'hit' ||
        cacheStatus === 'miss' ||
        cacheStatus === 'skip'
      ) {
        tags.add(`cache:${cacheStatus}`)
      }
    }
  }

  return tags
}

export function matchesRequestInsightFilters(
  request: RequestInsightListItem,
  filters: readonly RequestInsightFilter[]
): boolean {
  const tags = getRequestInsightTags(request)
  const filtersByFacet = new Map<string, RequestInsightFilter[]>()

  for (const filter of filters) {
    const facet = filter.slice(0, filter.indexOf(':'))
    const facetFilters = filtersByFacet.get(facet)
    if (facetFilters) {
      facetFilters.push(filter)
    } else {
      filtersByFacet.set(facet, [filter])
    }
  }

  for (const facetFilters of filtersByFacet.values()) {
    if (!facetFilters.some((filter) => tags.has(filter))) {
      return false
    }
  }
  return true
}

function getRequestStatusCode(request: RequestInsight): number | undefined {
  return getCanonicalThenAnySpanAttribute(
    request,
    'http.status_code',
    (value): value is number => typeof value === 'number'
  )
}

function getRequestIsRsc(request: RequestInsight): boolean | undefined {
  return getCanonicalThenAnySpanAttribute(
    request,
    'next.rsc',
    (value): value is boolean => typeof value === 'boolean'
  )
}

function getCanonicalThenAnySpanAttribute<T>(
  request: RequestInsight,
  key: string,
  isValue: (value: unknown) => value is T
): T | undefined {
  let latestRequestSpan: RequestInsightSpan | undefined
  let latestMatchedRouteSpan: RequestInsightSpan | undefined

  for (const span of request.spans) {
    if (
      span.attributes?.['next.span_type'] !== REQUEST_INSIGHT_REQUEST_SPAN_TYPE
    ) {
      continue
    }
    if (!latestRequestSpan || span.startTime >= latestRequestSpan.startTime) {
      latestRequestSpan = span
    }
    if (
      request.route &&
      span.attributes?.['next.route'] === request.route &&
      (!latestMatchedRouteSpan ||
        span.startTime >= latestMatchedRouteSpan.startTime)
    ) {
      latestMatchedRouteSpan = span
    }
  }

  const canonicalValue = (latestMatchedRouteSpan ?? latestRequestSpan)
    ?.attributes?.[key]
  if (isValue(canonicalValue)) {
    return canonicalValue
  }

  for (const span of request.spans) {
    const value = span.attributes?.[key]
    if (isValue(value)) {
      return value
    }
  }
}
