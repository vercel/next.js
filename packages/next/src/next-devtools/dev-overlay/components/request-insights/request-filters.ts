import { getRequestInsightKind } from '../../../shared/request-insights'
import {
  getRequestInsightTags,
  matchesRequestInsightFilters,
  REQUEST_INSIGHT_FILTERS,
  type RequestInsightFilter,
  type RequestInsightListItem,
} from '../../../shared/request-insights-summary'

export type { RequestInsightFilter } from '../../../shared/request-insights-summary'

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

type RequestInsightFilterResult = Readonly<{
  requests: RequestInsightListItem[]
  matchingRequestCount: number
  totalRequestCount: number
  optionCounts: Readonly<Record<RequestInsightFilter, number>>
}>

export function getRequestInsightFilterResult(
  requests: readonly RequestInsightListItem[],
  activeFilters: readonly RequestInsightFilter[],
  showInternal = false
): RequestInsightFilterResult {
  const revealInternal =
    showInternal || activeFilters.includes('activity:instant-insights')
  const visibleRequests = requests.filter(
    (request) => getRequestInsightKind(request) === 'request' || revealInternal
  )
  const optionCounts = Object.fromEntries(
    REQUEST_INSIGHT_FILTERS.map((filter) => [filter, 0])
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
    matchesRequestInsightFilters(request, activeFilters)
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
