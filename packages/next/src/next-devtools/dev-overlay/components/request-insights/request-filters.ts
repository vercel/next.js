import {
  getRequestInsightKind,
  getRequestInsightSource,
  type RequestInsight,
} from '../../../shared/request-insights'
import {
  getRequestInsightRepresentation,
  getRequestInsightStatusCode,
  hasRequestInsightProxyActivity,
} from './request-list'

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
  requests: RequestInsight[]
  matchingRequestCount: number
  totalRequestCount: number
  optionCounts: Readonly<Record<RequestInsightFilter, number>>
}>

export function getRequestInsightFilterResult(
  requests: readonly RequestInsight[],
  activeFilters: readonly RequestInsightFilter[],
  showInternal = false
): RequestInsightFilterResult {
  const revealInternal =
    showInternal || activeFilters.includes('activity:instant-insights')
  const visibleRequests = requests.filter(
    (request) => getRequestInsightKind(request) === 'request' || revealInternal
  )
  const activeFiltersByFacet = groupFiltersByFacet(activeFilters)
  const optionCounts = Object.fromEntries(
    ALL_FILTERS.map((filter) => [filter, 0])
  ) as Record<RequestInsightFilter, number>

  for (const request of requests) {
    const tags = getRequestInsightTags(request)
    if (getRequestInsightKind(request) === 'request' || showInternal) {
      for (const tag of tags) {
        optionCounts[tag] += 1
      }
    } else if (tags.has('activity:instant-insights')) {
      optionCounts['activity:instant-insights'] += 1
    }
  }

  const matchingRequests = visibleRequests.filter((request) =>
    matchesActiveFilters(getRequestInsightTags(request), activeFiltersByFacet)
  )

  return {
    requests: matchingRequests,
    matchingRequestCount: matchingRequests.length,
    totalRequestCount: visibleRequests.length,
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
  request: RequestInsight
): Set<RequestInsightFilter> {
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
  if (getRequestInsightKind(request) === 'instant-insights') {
    tags.add('activity:instant-insights')
  }

  if (
    request.status === 'error' ||
    request.spans.some((span) => span.status === 'error' || span.error)
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

function getRequestSourceFilter(
  request: RequestInsight
): RequestInsightFilter | undefined {
  const source = getRequestInsightSource(request)
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
