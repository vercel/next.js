/**
 * @jest-environment jsdom
 */
/* eslint-disable import/no-extraneous-dependencies -- Not a prod file */
import { act, renderHook } from '@testing-library/react'
import {
  getRequestInsightKey,
  type RequestInsight,
} from '../../../shared/request-insights'
import {
  summarizeRequestInsight,
  type RequestInsightFilter,
  type RequestInsightsHistoryPage,
} from '../../../shared/request-insights-summary'
import { getRequestInsightFilterResult } from './request-filters'
import { useRequestInsightsHistory } from './request-insights-history'

const NO_FILTERS: readonly RequestInsightFilter[] = []

function request(
  id: number,
  overrides: Partial<RequestInsight> = {}
): RequestInsight {
  return {
    requestId: `request-${id}`,
    kind: 'request',
    source: 'page',
    startTime: id,
    completedAt: id + 1,
    status: 'ok',
    spans: [],
    fetches: [],
    ...overrides,
  }
}

describe('useRequestInsightsHistory', () => {
  let archived: RequestInsight[]
  let sessionId: string
  let fetchMock: jest.Mock
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.useFakeTimers()
    archived = []
    sessionId = 'session-1'
    fetchMock = jest.fn(async (url: string) => {
      const params = new URL(url, 'http://localhost').searchParams
      const cursor = params.get('cursor')
      if (cursor && !cursor.startsWith(`${sessionId}:`)) {
        return { ok: false, status: 409 }
      }
      const filters = params.getAll('filter') as RequestInsightFilter[]
      const filtered = getRequestInsightFilterResult(
        archived,
        filters,
        params.get('showInternal') === '1'
      )
      const before = cursor ? Number(cursor.split(':')[1]) : Infinity
      const matching = filtered.requests
        .filter((item) => item.startTime < before)
        .toReversed()
      const page = matching.slice(0, Number(params.get('limit')))
      const response: RequestInsightsHistoryPage = {
        ...filtered,
        requests: page.map((item) =>
          summarizeRequestInsight(item as RequestInsight)
        ),
        sessionId,
        generation: 0,
        liveRequestOverlaps: archived
          .filter((item) =>
            params.getAll('liveRequestKey').includes(getRequestInsightKey(item))
          )
          .map(summarizeRequestInsight),
        nextCursor:
          matching.length > page.length
            ? `${sessionId}:${page.at(-1)!.startTime}`
            : undefined,
        truncated: false,
      }
      return { ok: true, status: 200, json: async () => response }
    })
    global.fetch = fetchMock
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.useRealTimers()
  })

  it('keeps requests completed after mounting reachable after live eviction', async () => {
    archived = [request(0)]
    const { result, rerender } = renderHook(useRequestInsightsHistory, {
      initialProps: {
        activeFilters: NO_FILTERS,
        liveRequests: archived,
        showInternal: false,
      },
    })
    await act(async () => {})

    archived = Array.from({ length: 201 }, (_, id) => request(id))
    rerender({
      activeFilters: NO_FILTERS,
      liveRequests: archived.slice(-100),
      showInternal: false,
    })
    await act(async () => {
      jest.advanceTimersByTime(1100)
    })

    expect(result.current.totalRequestCount).toBe(201)
    expect(result.current.hasMore).toBe(true)
    await act(async () => result.current.loadMore())
    expect(
      result.current.requests.some((item) => item.requestId === 'request-1')
    ).toBe(true)
    expect(
      new Set(result.current.requests.map((item) => item.requestId)).size
    ).toBe(result.current.requests.length)
  })

  it('includes pending-only filter counts without double counting archived live rows', async () => {
    const completed = request(0)
    const pending = request(1, {
      source: 'app-route',
      completedAt: undefined,
      status: 'pending',
    })
    archived = [completed]
    const { result } = renderHook(useRequestInsightsHistory, {
      initialProps: {
        activeFilters: NO_FILTERS,
        liveRequests: [completed, pending],
        showInternal: false,
      },
    })
    await act(async () => {})

    expect(result.current.totalRequestCount).toBe(2)
    expect(result.current.matchingRequestCount).toBe(2)
    expect(result.current.optionCounts['source:api']).toBe(1)
    expect(result.current.optionCounts['source:page']).toBe(1)
  })

  it('keeps the pause snapshot independent of active filters', async () => {
    const page = request(0)
    const api = request(1, { source: 'app-route' })
    archived = [page, api]
    const { result } = renderHook(useRequestInsightsHistory, {
      initialProps: {
        activeFilters: ['source:page'] as readonly RequestInsightFilter[],
        liveRequests: [page, api],
        showInternal: false,
      },
    })
    await act(async () => {})

    const frozen = [...result.current.unfilteredRequests]
    expect(
      getRequestInsightFilterResult(frozen, ['source:page']).requests
    ).toEqual([page])
    expect(getRequestInsightFilterResult(frozen, NO_FILTERS).requests).toEqual([
      api,
      page,
    ])
    expect(
      getRequestInsightFilterResult(frozen, ['source:api']).optionCounts[
        'source:api'
      ]
    ).toBe(1)
  })

  it('does not fetch history for every pending span update', async () => {
    const pending = request(0, { completedAt: undefined, status: 'pending' })
    const props = {
      activeFilters: NO_FILTERS,
      liveRequests: [pending],
      showInternal: false,
    }
    const { rerender } = renderHook(useRequestInsightsHistory, {
      initialProps: props,
    })
    await act(async () => {})
    const initialFetches = fetchMock.mock.calls.length
    for (let i = 0; i < 10; i++) {
      rerender({ ...props, liveRequests: [{ ...pending, durationMs: i }] })
    }
    await act(async () => jest.advanceTimersByTime(1100))
    expect(fetchMock).toHaveBeenCalledTimes(initialFetches)
  })

  it('preserves older pagination during traffic and offers the latest history separately', async () => {
    archived = Array.from({ length: 301 }, (_, id) => request(id))
    const props = {
      activeFilters: NO_FILTERS,
      liveRequests: archived.slice(-100),
      showInternal: false,
    }
    const { result, rerender } = renderHook(useRequestInsightsHistory, {
      initialProps: props,
    })
    await act(async () => {})
    await act(async () => result.current.loadMore())

    archived = Array.from({ length: 601 }, (_, id) => request(id))
    rerender({ ...props, liveRequests: archived.slice(-100) })
    await act(async () => jest.advanceTimersByTime(1100))
    expect(result.current.hasNewer).toBe(true)
    expect(result.current.totalRequestCount).toBe(601)

    await act(async () => result.current.loadMore())
    const tailUrl = new URL(fetchMock.mock.calls.at(-1)![0], 'http://localhost')
    expect(tailUrl.searchParams.get('cursor')).toBe('session-1:101')
    expect(
      result.current.requests.some((item) => item.requestId === 'request-1')
    ).toBe(true)

    await act(async () => result.current.loadNewer())
    expect(result.current.hasNewer).toBe(false)
    expect(result.current.unfilteredRequests).toHaveLength(100)
    await act(async () => result.current.loadMore())
    expect(
      result.current.requests.some((item) => item.requestId === 'request-401')
    ).toBe(true)
  })

  it('throttles continuous completions without retaining every refreshed page', async () => {
    const props = {
      activeFilters: NO_FILTERS,
      liveRequests: archived,
      showInternal: false,
    }
    const { result, rerender } = renderHook(useRequestInsightsHistory, {
      initialProps: props,
    })
    await act(async () => {})
    for (let batch = 1; batch <= 10; batch++) {
      archived = Array.from({ length: batch * 100 }, (_, id) => request(id))
      rerender({ ...props, liveRequests: archived.slice(-100) })
      await act(async () => jest.advanceTimersByTime(200))
    }

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.current.totalRequestCount).toBe(1000)
    expect(result.current.unfilteredRequests).toHaveLength(100)
    expect(result.current.hasMore).toBe(true)
  })

  it('deduplicates live rows outside the filtered first page', async () => {
    archived = Array.from({ length: 201 }, (_, id) => request(id))
    const olderApi = request(0, { source: 'app-route' })
    archived[0] = olderApi
    const { result } = renderHook(useRequestInsightsHistory, {
      initialProps: {
        activeFilters: ['source:page'] as readonly RequestInsightFilter[],
        liveRequests: [olderApi, archived[1], archived[200]],
        showInternal: false,
      },
    })
    await act(async () => {})
    expect(result.current.matchingRequestCount).toBe(200)
    expect(result.current.totalRequestCount).toBe(201)
    expect(result.current.optionCounts['source:api']).toBe(1)
    expect(result.current.optionCounts['source:page']).toBe(200)
  })

  it('replaces loaded pages after a stale cursor retry', async () => {
    archived = Array.from({ length: 201 }, (_, id) => request(id))
    const { result } = renderHook(useRequestInsightsHistory, {
      initialProps: {
        activeFilters: NO_FILTERS,
        liveRequests: [],
        showInternal: false,
      },
    })
    await act(async () => {})
    await act(async () => result.current.loadMore())

    sessionId = 'session-2'
    archived = [request(900)]
    await act(async () => result.current.loadMore())
    expect(result.current.requests.map((item) => item.requestId)).toEqual([
      'request-900',
    ])
    expect(result.current.totalRequestCount).toBe(1)
    expect(result.current.loading).toBe(false)
    expect(result.current.hasMore).toBe(false)
    expect(result.current.hasNewer).toBe(false)
  })

  it('discards an in-flight page after filters change', async () => {
    archived = [request(0), request(1, { source: 'app-route' })]
    let resolvePage: (response: unknown) => void
    const stale = new Promise((resolve) => {
      resolvePage = resolve
    })
    const ordinaryFetch = fetchMock.getMockImplementation()!
    fetchMock.mockImplementationOnce(() => stale)
    const { result, rerender } = renderHook(useRequestInsightsHistory, {
      initialProps: {
        activeFilters: NO_FILTERS,
        liveRequests: [],
        showInternal: false,
      },
    })
    rerender({
      activeFilters: ['source:api'],
      liveRequests: [],
      showInternal: false,
    })
    await act(async () => {})
    await act(async () => {
      resolvePage!(await ordinaryFetch('/?view=history&limit=100'))
    })
    expect(result.current.requests.map((item) => item.requestId)).toEqual([
      'request-1',
    ])
    expect(result.current.matchingRequestCount).toBe(1)
    expect(result.current.loading).toBe(false)
  })

  it('refreshes completions that arrive while the previous page is in flight', async () => {
    archived = [request(0)]
    const props = {
      activeFilters: NO_FILTERS,
      liveRequests: archived,
      showInternal: false,
    }
    const ordinaryFetch = fetchMock.getMockImplementation()!
    let resolvePage: (response: unknown) => void
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve
        })
    )
    const { result, rerender } = renderHook(useRequestInsightsHistory, {
      initialProps: props,
    })
    const firstUrl = fetchMock.mock.calls[0][0]
    archived = [request(0), request(1)]
    rerender({ ...props, liveRequests: archived })
    await act(async () => jest.advanceTimersByTime(1100))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => resolvePage!(await ordinaryFetch(firstUrl)))
    await act(async () => jest.advanceTimersByTime(1100))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.totalRequestCount).toBe(2)
    expect(result.current.optionCounts['source:page']).toBe(2)
  })

  it('settles a pending completion racing the archive response on the next refresh', async () => {
    const pending = request(0, {
      source: 'app-route',
      completedAt: undefined,
      status: 'pending',
    })
    const props = {
      activeFilters: NO_FILTERS,
      liveRequests: [pending],
      showInternal: false,
    }
    const ordinaryFetch = fetchMock.getMockImplementation()!
    let resolvePage: (response: unknown) => void
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve
        })
    )
    const { result, rerender } = renderHook(useRequestInsightsHistory, {
      initialProps: props,
    })
    const firstUrl = fetchMock.mock.calls[0][0]
    archived = [request(0, { source: 'app-route' })]
    rerender({ ...props, liveRequests: archived })
    await act(async () => resolvePage!(await ordinaryFetch(firstUrl)))
    await act(async () => jest.advanceTimersByTime(1100))
    expect(result.current.totalRequestCount).toBe(1)
    expect(result.current.matchingRequestCount).toBe(1)
    expect(result.current.optionCounts['source:api']).toBe(1)
  })

  it('resets an older browsing session when a head refresh observes rotation', async () => {
    archived = Array.from({ length: 201 }, (_, id) => request(id))
    const props = {
      activeFilters: NO_FILTERS,
      liveRequests: archived.slice(-100),
      showInternal: false,
    }
    const { result, rerender } = renderHook(useRequestInsightsHistory, {
      initialProps: props,
    })
    await act(async () => {})
    await act(async () => result.current.loadMore())

    sessionId = 'session-2'
    archived = [request(900)]
    rerender({ ...props, liveRequests: archived })
    await act(async () => jest.advanceTimersByTime(1100))
    expect(result.current.requests.map((item) => item.requestId)).toEqual([
      'request-900',
    ])
    expect(result.current.totalRequestCount).toBe(1)
    expect(result.current.hasMore).toBe(false)
    expect(result.current.hasNewer).toBe(false)
  })
})
