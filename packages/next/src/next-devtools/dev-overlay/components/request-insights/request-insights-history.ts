import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { REQUEST_INSIGHTS_DEV_ENDPOINT } from '../../../../shared/lib/constants'
import {
  getRequestInsightKey,
  MAX_LIVE_COMPLETED_REQUEST_INSIGHTS,
  type RequestInsight,
} from '../../../shared/request-insights'
import {
  matchesRequestInsightFilters,
  type RequestInsightFilter,
  type RequestInsightListItem,
  type RequestInsightsHistoryPage,
  type RequestInsightSummary,
} from '../../../shared/request-insights-summary'
import { getRequestInsightFilterResult } from './request-filters'

const HISTORY_PAGE_SIZE = 100
const HISTORY_REFRESH_INTERVAL = 1000

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
  const [nextCursor, setNextCursor] = useState<string>()
  const [hasNewer, setHasNewer] = useState(false)
  const [loading, setLoading] = useState(false)
  const requestGeneration = useRef(0)
  const browsingOlder = useRef(false)
  const loadedHead = useRef<string | undefined>(undefined)
  const session = useRef<string | undefined>(undefined)
  const inFlight = useRef<AbortController | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  const liveRequestsRef = useRef(liveRequests)
  liveRequestsRef.current = liveRequests
  const completedKeys = liveRequests
    .filter((request) => request.completedAt !== undefined)
    .map(getRequestInsightKey)
    .sort()
    .join(',')
  const lastRequestedKeys = useRef(completedKeys)

  const fetchPage = useCallback(
    async (cursor?: string) => {
      if (inFlight.current) return
      let generation = requestGeneration.current
      const controller = new AbortController()
      inFlight.current = controller
      setLoading(true)
      const params = new URLSearchParams({
        view: 'history',
        limit: String(HISTORY_PAGE_SIZE),
        showInternal: showInternal ? '1' : '0',
      })
      for (const filter of activeFilters) {
        params.append('filter', filter)
      }
      const liveKeys = liveRequestsRef.current
        .filter((request) => request.completedAt !== undefined)
        .map(getRequestInsightKey)
        .slice(-MAX_LIVE_COMPLETED_REQUEST_INSIGHTS)
      lastRequestedKeys.current = liveKeys.toSorted().join(',')
      for (const key of liveKeys) {
        params.append('liveRequestKey', key)
      }
      if (cursor) {
        params.set('cursor', cursor)
      }

      try {
        let response = await fetch(
          `${REQUEST_INSIGHTS_DEV_ENDPOINT}?${params}`,
          { cache: 'no-store', signal: controller.signal }
        )
        if (
          response.status === 409 &&
          cursor &&
          !controller.signal.aborted &&
          generation === requestGeneration.current
        ) {
          generation = ++requestGeneration.current
          cursor = undefined
          browsingOlder.current = false
          setHistory([])
          setPageInfo(null)
          setNextCursor(undefined)
          setHasNewer(false)
          params.delete('cursor')
          response = await fetch(`${REQUEST_INSIGHTS_DEV_ENDPOINT}?${params}`, {
            cache: 'no-store',
            signal: controller.signal,
          })
        }
        if (!response.ok) {
          return
        }
        const page = (await response.json()) as RequestInsightsHistoryPage
        if (
          controller.signal.aborted ||
          generation !== requestGeneration.current
        ) {
          return
        }
        const pageSession = `${page.sessionId}:${page.generation}`
        if (session.current !== pageSession) {
          browsingOlder.current = false
          session.current = pageSession
          cursor = undefined
        }
        if (cursor) {
          setHistory((requests) => mergeRequests(requests, page.requests))
          setNextCursor(page.nextCursor)
        } else if (!browsingOlder.current) {
          setHistory(page.requests)
          setNextCursor(page.nextCursor)
          loadedHead.current = page.requests[0]
            ? getRequestInsightKey(page.requests[0])
            : undefined
          setHasNewer(false)
        } else {
          setHasNewer(
            page.requests[0] !== undefined &&
              getRequestInsightKey(page.requests[0]) !== loadedHead.current
          )
        }
        setPageInfo(page)
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Failed to load Request Insights history', error)
        }
      } finally {
        if (
          !controller.signal.aborted &&
          generation === requestGeneration.current
        ) {
          inFlight.current = null
          setLoading(false)
        }
      }
    },
    [activeFilters, showInternal]
  )

  useEffect(() => {
    requestGeneration.current++
    browsingOlder.current = false
    loadedHead.current = undefined
    setHistory([])
    setPageInfo(null)
    setNextCursor(undefined)
    setHasNewer(false)
    void fetchPage()
    return () => {
      inFlight.current?.abort()
      inFlight.current = null
      clearTimeout(refreshTimer.current)
      refreshTimer.current = undefined
    }
  }, [fetchPage])

  useEffect(() => {
    if (
      completedKeys === lastRequestedKeys.current ||
      refreshTimer.current !== undefined
    ) {
      return
    }
    const refresh = () => {
      if (inFlight.current) {
        refreshTimer.current = setTimeout(refresh, HISTORY_REFRESH_INTERVAL)
        return
      }
      refreshTimer.current = undefined
      void fetchPage()
    }
    refreshTimer.current = setTimeout(refresh, HISTORY_REFRESH_INTERVAL)
  }, [completedKeys, fetchPage])

  const unfilteredRequests = useMemo(() => {
    const merged = new Map<string, RequestInsightListItem>()
    for (const request of [...liveRequests].reverse()) {
      merged.set(getRequestInsightKey(request), request)
    }
    for (const request of history) {
      const key = getRequestInsightKey(request)
      if (!merged.has(key)) {
        merged.set(key, request)
      }
    }
    return [...merged.values()]
  }, [history, liveRequests])
  const requests = useMemo(
    () =>
      unfilteredRequests.filter((request) =>
        matchesRequestInsightFilters(request, activeFilters)
      ),
    [activeFilters, unfilteredRequests]
  )

  const counts = useMemo(() => {
    const live = getRequestInsightFilterResult(
      liveRequests,
      activeFilters,
      showInternal
    )
    if (!pageInfo) return live

    const liveKeys = new Set(liveRequests.map(getRequestInsightKey))
    const overlap = getRequestInsightFilterResult(
      (pageInfo.liveRequestOverlaps ?? []).filter((request) =>
        liveKeys.has(getRequestInsightKey(request))
      ),
      activeFilters,
      showInternal
    )
    const optionCounts = { ...pageInfo.optionCounts }
    for (const filter of Object.keys(optionCounts) as RequestInsightFilter[]) {
      optionCounts[filter] +=
        live.optionCounts[filter] - overlap.optionCounts[filter]
    }
    return {
      matchingRequestCount:
        pageInfo.matchingRequestCount +
        live.matchingRequestCount -
        overlap.matchingRequestCount,
      totalRequestCount:
        pageInfo.totalRequestCount +
        live.totalRequestCount -
        overlap.totalRequestCount,
      optionCounts,
    }
  }, [activeFilters, liveRequests, pageInfo, showInternal])

  const loadMore = useCallback(() => {
    if (!inFlight.current && nextCursor) {
      browsingOlder.current = true
      void fetchPage(nextCursor)
    }
  }, [fetchPage, nextCursor])

  const loadNewer = useCallback(() => {
    if (!inFlight.current) {
      browsingOlder.current = false
      void fetchPage()
    }
  }, [fetchPage])

  return {
    requests,
    unfilteredRequests,
    loading,
    loadMore,
    loadNewer,
    hasNewer,
    hasMore: nextCursor !== undefined,
    truncated: pageInfo?.truncated ?? false,
    matchingRequestCount: counts.matchingRequestCount,
    totalRequestCount: counts.totalRequestCount,
    optionCounts: counts.optionCounts,
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
