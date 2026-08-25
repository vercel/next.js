import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { REQUEST_INSIGHTS_DEV_ENDPOINT } from '../../../../shared/lib/constants'
import {
  getRequestInsightKey,
  type RequestInsight,
} from '../../../shared/request-insights'
import {
  matchesRequestInsightFilters,
  REQUEST_INSIGHT_FILTERS,
  type RequestInsightFilter,
  type RequestInsightListItem,
  type RequestInsightsHistoryPage,
  type RequestInsightSummary,
} from '../../../shared/request-insights-summary'

const HISTORY_PAGE_SIZE = 100
const EMPTY_OPTION_COUNTS = Object.fromEntries(
  REQUEST_INSIGHT_FILTERS.map((filter) => [filter, 0])
) as Record<RequestInsightFilter, number>

export function useRequestInsightsHistory({
  activeFilters,
  liveRequests,
  showInternal,
}: {
  activeFilters: readonly RequestInsightFilter[]
  liveRequests: readonly RequestInsight[]
  showInternal: boolean
}) {
  const [history, setHistory] = useState<RequestInsightSummary[]>([])
  const [pageInfo, setPageInfo] = useState<RequestInsightsHistoryPage | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const requestGeneration = useRef(0)

  const fetchPage = useCallback(
    async (cursor?: string) => {
      let generation = requestGeneration.current
      setLoading(true)
      const params = new URLSearchParams({
        view: 'history',
        limit: String(HISTORY_PAGE_SIZE),
        showInternal: showInternal ? '1' : '0',
      })
      for (const filter of activeFilters) {
        params.append('filter', filter)
      }
      if (cursor) {
        params.set('cursor', cursor)
      }

      try {
        let response = await fetch(
          `${REQUEST_INSIGHTS_DEV_ENDPOINT}?${params}`,
          { cache: 'no-store' }
        )
        if (
          response.status === 409 &&
          cursor &&
          generation === requestGeneration.current
        ) {
          generation = ++requestGeneration.current
          setHistory([])
          setPageInfo(null)
          params.delete('cursor')
          response = await fetch(`${REQUEST_INSIGHTS_DEV_ENDPOINT}?${params}`, {
            cache: 'no-store',
          })
        }
        if (!response.ok) {
          return
        }
        const page = (await response.json()) as RequestInsightsHistoryPage
        if (generation !== requestGeneration.current) {
          return
        }
        setHistory((requests) =>
          cursor ? mergeRequests(requests, page.requests) : page.requests
        )
        setPageInfo(page)
      } finally {
        if (generation === requestGeneration.current) {
          setLoading(false)
        }
      }
    },
    [activeFilters, showInternal]
  )

  useEffect(() => {
    requestGeneration.current++
    setHistory([])
    setPageInfo(null)
    void fetchPage()
  }, [fetchPage])

  const requests = useMemo(() => {
    const merged = new Map<string, RequestInsightListItem>()
    for (const request of [...liveRequests].reverse()) {
      if (matchesRequestInsightFilters(request, activeFilters)) {
        merged.set(getRequestInsightKey(request), request)
      }
    }
    for (const request of history) {
      const key = getRequestInsightKey(request)
      if (!merged.has(key)) {
        merged.set(key, request)
      }
    }
    return [...merged.values()]
  }, [activeFilters, history, liveRequests])

  const loadMore = useCallback(() => {
    if (!loading && pageInfo?.nextCursor) {
      void fetchPage(pageInfo.nextCursor)
    }
  }, [fetchPage, loading, pageInfo?.nextCursor])

  return {
    requests,
    loading,
    loadMore,
    hasMore: pageInfo?.nextCursor !== undefined,
    truncated: pageInfo?.truncated ?? false,
    matchingRequestCount: pageInfo?.matchingRequestCount ?? requests.length,
    totalRequestCount: pageInfo?.totalRequestCount ?? requests.length,
    optionCounts: pageInfo?.optionCounts ?? EMPTY_OPTION_COUNTS,
  }
}

export async function loadRequestInsightDetail(
  request: RequestInsightSummary,
  signal: AbortSignal
): Promise<RequestInsight | undefined> {
  const params = new URLSearchParams({
    view: 'detail',
    requestId: request.requestId,
    kind: request.kind ?? 'request',
  })
  const response = await fetch(`${REQUEST_INSIGHTS_DEV_ENDPOINT}?${params}`, {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) {
    return undefined
  }
  return ((await response.json()) as { request?: RequestInsight }).request
}

function mergeRequests(
  current: RequestInsightSummary[],
  next: RequestInsightSummary[]
): RequestInsightSummary[] {
  const requests = new Map(
    current.map((request) => [getRequestInsightKey(request), request])
  )
  for (const request of next) {
    requests.set(getRequestInsightKey(request), request)
  }
  return [...requests.values()]
}
