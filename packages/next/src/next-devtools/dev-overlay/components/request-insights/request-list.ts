import {
  getRequestInsightKey,
  getRequestInsightKind,
  getRequestInsightSource,
  REQUEST_INSIGHT_PROXY_SPAN_TYPE,
  REQUEST_INSIGHT_REQUEST_SPAN_TYPE,
  type RequestInsight,
  type RequestInsightSpan,
} from '../../../shared/request-insights'

export function getActiveRequestKey(
  requests: readonly RequestInsight[],
  selectedRequestKey: string | null
): string | null {
  if (
    selectedRequestKey !== null &&
    requests.some(
      (request) => getRequestInsightKey(request) === selectedRequestKey
    )
  ) {
    return selectedRequestKey
  }

  const request =
    requests.find((item) => item.fetches.length > 0) ?? requests[0]
  return request ? getRequestInsightKey(request) : null
}

export function isInternalRequestInsight(
  request: Pick<RequestInsight, 'kind'>
): boolean {
  return getRequestInsightKind(request) !== 'request'
}

export type RequestListEntry = {
  request: RequestInsight
  nested: boolean
}

export function getRequestListEntries(
  requests: readonly RequestInsight[],
  showInternal: boolean
): RequestListEntry[] {
  if (!showInternal) {
    return requests
      .filter((request) => !isInternalRequestInsight(request))
      .map((request) => ({ request, nested: false }))
  }

  const internalByRequestId = new Map<string, RequestInsight[]>()
  const parentRequestIds = new Set<string>()
  for (const request of requests) {
    if (isInternalRequestInsight(request)) {
      const internal = internalByRequestId.get(request.requestId)
      if (internal) {
        internal.push(request)
      } else {
        internalByRequestId.set(request.requestId, [request])
      }
    } else {
      parentRequestIds.add(request.requestId)
    }
  }

  const entries: RequestListEntry[] = []
  for (const request of requests) {
    if (isInternalRequestInsight(request)) {
      if (!parentRequestIds.has(request.requestId)) {
        entries.push({ request, nested: false })
      }
      continue
    }

    entries.push({ request, nested: false })
    const internal = internalByRequestId.get(request.requestId)
    if (internal) {
      for (const internalRequest of internal) {
        entries.push({ request: internalRequest, nested: true })
      }
    }
  }
  return entries
}

export type RequestInsightRowType =
  | 'page'
  | 'page-load'
  | 'rsc'
  | 'api'
  | 'image'
  | 'asset'
  | 'proxy'
  | 'instant-insights'
  | 'unknown'

export type RequestInsightRowTypePresentation = Readonly<{
  type: RequestInsightRowType
  label: string
  accessibleLabel: string
}>

const REQUEST_INSIGHT_ROW_TYPES: Readonly<
  Record<RequestInsightRowType, RequestInsightRowTypePresentation>
> = {
  page: { type: 'page', label: 'Page', accessibleLabel: 'Page request' },
  'page-load': {
    type: 'page-load',
    label: 'Page load',
    accessibleLabel: 'Page load',
  },
  rsc: {
    type: 'rsc',
    label: 'RSC',
    accessibleLabel: 'React Server Component request',
  },
  api: { type: 'api', label: 'API', accessibleLabel: 'API request' },
  image: {
    type: 'image',
    label: 'Image',
    accessibleLabel: 'Image optimization request',
  },
  asset: {
    type: 'asset',
    label: 'Asset',
    accessibleLabel: 'Static asset request',
  },
  proxy: { type: 'proxy', label: 'Proxy', accessibleLabel: 'Proxy request' },
  'instant-insights': {
    type: 'instant-insights',
    label: 'Instant',
    accessibleLabel: 'Instant Insights activity',
  },
  unknown: {
    type: 'unknown',
    label: 'Unknown',
    accessibleLabel: 'Unclassified request',
  },
}

export function getRequestInsightRowType(
  request: RequestInsight,
  pageLoad = false
): RequestInsightRowTypePresentation {
  switch (getRequestInsightSource(request)) {
    case 'page': {
      if (getRequestInsightIsRsc(request) === true) {
        return REQUEST_INSIGHT_ROW_TYPES.rsc
      }
      return REQUEST_INSIGHT_ROW_TYPES[pageLoad ? 'page-load' : 'page']
    }
    case 'app-route':
    case 'pages-api':
      return REQUEST_INSIGHT_ROW_TYPES.api
    case 'image':
      return REQUEST_INSIGHT_ROW_TYPES.image
    case 'asset':
      return REQUEST_INSIGHT_ROW_TYPES.asset
    case 'proxy':
      return REQUEST_INSIGHT_ROW_TYPES.proxy
    case 'instant-insights':
      return REQUEST_INSIGHT_ROW_TYPES['instant-insights']
    case 'unknown':
      return REQUEST_INSIGHT_ROW_TYPES.unknown
  }
}

export function hasRequestInsightProxyActivity(
  request: RequestInsight
): boolean {
  return (
    getRequestInsightSource(request) === 'proxy' ||
    request.proxyStatus === 'matched' ||
    request.spans.some(
      (span) =>
        span.attributes?.['next.span_type'] === REQUEST_INSIGHT_PROXY_SPAN_TYPE
    )
  )
}

export function getCanonicalRequestSpan(
  request: Pick<RequestInsight, 'route' | 'spans'>
): RequestInsightSpan | undefined {
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

  return latestMatchedRouteSpan ?? latestRequestSpan
}

export function getRequestInsightStatusCode(
  request: Pick<RequestInsight, 'route' | 'spans'>
): number | undefined {
  return getCanonicalThenAnySpanAttribute(
    request,
    'http.status_code',
    (value): value is number => typeof value === 'number'
  )
}

export function getRequestInsightIsRsc(
  request: Pick<RequestInsight, 'route' | 'spans'>
): boolean | undefined {
  return getCanonicalThenAnySpanAttribute(
    request,
    'next.rsc',
    (value): value is boolean => typeof value === 'boolean'
  )
}

export type RequestInsightRepresentation =
  | 'html'
  | 'rsc'
  | 'not-applicable'
  | 'unknown'

export function getRequestInsightRepresentation(
  request: Pick<RequestInsight, 'kind' | 'source' | 'route' | 'spans'>
): RequestInsightRepresentation {
  switch (getRequestInsightSource(request)) {
    case 'page': {
      const isRsc = getRequestInsightIsRsc(request)
      return isRsc === true ? 'rsc' : isRsc === false ? 'html' : 'unknown'
    }
    case 'unknown':
      return 'unknown'
    case 'app-route':
    case 'pages-api':
    case 'image':
    case 'asset':
    case 'proxy':
    case 'instant-insights':
      return 'not-applicable'
  }
}

export function getRequestInsightSummaryTypeLabel(
  request: RequestInsight
): string {
  const rowType = getRequestInsightRowType(request)
  if (rowType.type === 'instant-insights') {
    return rowType.accessibleLabel
  }

  switch (getRequestInsightRepresentation(request)) {
    case 'html':
      return 'HTML request'
    case 'rsc':
      return 'RSC request'
    case 'not-applicable':
    case 'unknown':
      return rowType.accessibleLabel
  }
}

function getCanonicalThenAnySpanAttribute<T>(
  request: Pick<RequestInsight, 'route' | 'spans'>,
  key: string,
  isValue: (value: unknown) => value is T
): T | undefined {
  const canonicalValue = getCanonicalRequestSpan(request)?.attributes?.[key]
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

export function isPageLoadRequest(
  request: RequestInsight,
  initialRequestId: string | undefined
): boolean {
  return (
    getRequestInsightKind(request) === 'request' &&
    getRequestInsightSource(request) === 'page' &&
    getRequestInsightIsRsc(request) === false &&
    request.htmlRequestId === initialRequestId
  )
}
