import {
  getRequestInsightKind,
  getRequestInsightSource,
  type RequestInsight,
} from '../../../shared/request-insights'
import {
  getRequestInsightRepresentation,
  getRequestInsightRouterActivity,
  getRequestInsightStatusCode,
  hasRequestInsightProxyActivity,
  type RequestListEntry,
} from './request-list'

export type RequestInsightFilter =
  | 'source:page'
  | 'source:action'
  | 'source:api'
  | 'source:image'
  | 'source:asset'
  | 'source:unknown'
  | 'representation:html'
  | 'representation:rsc'
  | 'representation:unknown'
  | 'activity:proxy'
  | 'activity:instant-insights'
  | 'activity:prefetch'
  | 'activity:segment-prefetch'
  | 'activity:hmr-refresh'
  | 'status:error'
  | 'status:http-4xx'
  | 'status:http-5xx'
  | 'delivery:active'
  | 'delivery:finished'
  | 'delivery:aborted'
  | 'delivery:errored'
  | 'delivery:unknown'
  | 'fetches:present'
  | 'fetches:none'
  | 'cache:hit'
  | 'cache:miss'
  | 'cache:skip'
  | 'cache:none'

export type RequestInsightFilterGroup = Readonly<{
  label: string
  options: ReadonlyArray<{
    value: RequestInsightFilter
    label: string
  }>
}>

export const REQUEST_INSIGHT_FILTER_GROUPS: readonly RequestInsightFilterGroup[] =
  [
    {
      label: 'Request type',
      options: [
        { value: 'source:page', label: 'Page or navigation' },
        { value: 'source:action', label: 'Server Action' },
        { value: 'source:api', label: 'API' },
        { value: 'source:image', label: 'Image optimization' },
        { value: 'source:asset', label: 'Static asset' },
        { value: 'source:unknown', label: 'Unknown type' },
      ],
    },
    {
      label: 'Page response',
      options: [
        { value: 'representation:html', label: 'HTML' },
        { value: 'representation:rsc', label: 'RSC' },
        { value: 'representation:unknown', label: 'Unavailable' },
      ],
    },
    {
      label: 'Activity',
      options: [
        { value: 'activity:proxy', label: 'Matched proxy' },
        { value: 'activity:prefetch', label: 'App Router prefetch' },
        { value: 'activity:segment-prefetch', label: 'Segment prefetch' },
        { value: 'activity:hmr-refresh', label: 'HMR refresh' },
        { value: 'activity:instant-insights', label: 'Instant Insights' },
      ],
    },
    {
      label: 'Status',
      options: [
        { value: 'status:error', label: 'Recorded error' },
        { value: 'status:http-4xx', label: 'HTTP 4xx' },
        { value: 'status:http-5xx', label: 'HTTP 5xx' },
      ],
    },
    {
      label: 'Response delivery',
      options: [
        { value: 'delivery:active', label: 'Active or streaming' },
        { value: 'delivery:finished', label: 'Finished' },
        { value: 'delivery:aborted', label: 'Aborted' },
        { value: 'delivery:errored', label: 'Errored' },
        { value: 'delivery:unknown', label: 'Unavailable' },
      ],
    },
    {
      label: 'Fetches',
      options: [
        { value: 'fetches:present', label: 'Has fetches' },
        { value: 'fetches:none', label: 'No fetches' },
      ],
    },
    {
      label: 'Fetch cache',
      options: [
        { value: 'cache:hit', label: 'Hit' },
        { value: 'cache:miss', label: 'Miss' },
        { value: 'cache:skip', label: 'Skip' },
        { value: 'cache:none', label: 'No cache activity' },
      ],
    },
  ]

const ALL_FILTERS = REQUEST_INSIGHT_FILTER_GROUPS.flatMap((group) =>
  group.options.map((option) => option.value)
)

type RequestInsightFilterResult = Readonly<{
  entries: RequestListEntry[]
  matchingRequestCount: number
  totalRequestCount: number
  optionCounts: Readonly<Record<RequestInsightFilter, number>>
}>

export function getRequestInsightFilterResult(
  entries: readonly RequestListEntry[],
  activeFilters: readonly RequestInsightFilter[]
): RequestInsightFilterResult {
  const activeFiltersByFacet = groupFiltersByFacet(activeFilters)
  const optionCounts = Object.fromEntries(
    ALL_FILTERS.map((filter) => [filter, 0])
  ) as Record<RequestInsightFilter, number>

  for (const entry of entries) {
    const tags = getRequestInsightTags(entry)
    for (const tag of tags) {
      optionCounts[tag] += 1
    }
  }

  const matchingEntries = entries.filter((entry) => {
    const tags = getRequestInsightTags(entry)
    return matchesActiveFilters(tags, activeFiltersByFacet)
  })

  return {
    entries: matchingEntries,
    matchingRequestCount: matchingEntries.length,
    totalRequestCount: entries.length,
    optionCounts,
  }
}

export function toggleRequestInsightFilter(
  activeFilters: readonly RequestInsightFilter[],
  filter: RequestInsightFilter
): RequestInsightFilter[] {
  return activeFilters.includes(filter)
    ? activeFilters.filter((activeFilter) => activeFilter !== filter)
    : [...activeFilters, filter]
}

function getRequestInsightTags(
  entry: RequestListEntry
): Set<RequestInsightFilter> {
  const { request } = entry
  const tags = new Set<RequestInsightFilter>()
  const source = getRequestSourceFilter(request)
  if (source) {
    tags.add(source)
  }

  switch (getRequestInsightRepresentation(request)) {
    case 'html':
      tags.add('representation:html')
      break
    case 'rsc':
      tags.add('representation:rsc')
      break
    case 'unknown':
      tags.add('representation:unknown')
      break
    case 'not-applicable':
      break
  }

  if (hasRequestInsightProxyActivity(request)) {
    tags.add('activity:proxy')
  }
  const routerActivity = getRequestInsightRouterActivity(request)
  if (routerActivity) {
    tags.add(`activity:${routerActivity}`)
  }
  if (
    entry.instantInsights.length > 0 ||
    getRequestInsightKind(request) === 'instant-insights'
  ) {
    tags.add('activity:instant-insights')
  }

  if (
    [request, ...entry.instantInsights].some(
      (item) =>
        item.status === 'error' ||
        item.spans.some((span) => span.status === 'error' || span.error)
    )
  ) {
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

  tags.add(getRequestInsightDeliveryPresentation(request).filter)

  if (request.fetches.length === 0) {
    tags.add('fetches:none')
    tags.add('cache:none')
  } else {
    tags.add('fetches:present')
    for (const fetch of request.fetches) {
      if (
        fetch.cacheStatus === 'hit' ||
        fetch.cacheStatus === 'miss' ||
        fetch.cacheStatus === 'skip'
      ) {
        tags.add(`cache:${fetch.cacheStatus}`)
      }
    }
  }

  return tags
}

export function getRequestInsightDeliveryPresentation(
  request: Pick<RequestInsight, 'response'>
): Readonly<{
  filter: Extract<RequestInsightFilter, `delivery:${string}`>
  label?: string
}> {
  switch (request.response?.outcome) {
    case 'pending':
      return { filter: 'delivery:active', label: 'Delivery active' }
    case 'finished':
      return { filter: 'delivery:finished', label: 'Delivery finished' }
    case 'aborted':
      return { filter: 'delivery:aborted', label: 'Delivery aborted' }
    case 'errored':
      return { filter: 'delivery:errored', label: 'Delivery errored' }
    case undefined:
    default:
      return { filter: 'delivery:unknown' }
  }
}

function getRequestSourceFilter(
  request: RequestInsight
): RequestInsightFilter | undefined {
  const source = getRequestInsightSource(request)
  if (source === 'page' && request.serverAction) {
    return 'source:action'
  }

  switch (source) {
    case 'page':
      return 'source:page'
    case 'app-route':
    case 'pages-api':
      return 'source:api'
    case 'image':
      return 'source:image'
    case 'asset':
      return 'source:asset'
    case 'proxy':
    case 'instant-insights':
      return undefined
    case 'unknown':
      return 'source:unknown'
  }
}

function groupFiltersByFacet(
  filters: readonly RequestInsightFilter[]
): Map<string, RequestInsightFilter[]> {
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

  return filtersByFacet
}

function matchesActiveFilters(
  tags: ReadonlySet<RequestInsightFilter>,
  activeFiltersByFacet: ReadonlyMap<string, RequestInsightFilter[]>
): boolean {
  for (const facetFilters of activeFiltersByFacet.values()) {
    if (!facetFilters.some((filter) => tags.has(filter))) {
      return false
    }
  }
  return true
}
