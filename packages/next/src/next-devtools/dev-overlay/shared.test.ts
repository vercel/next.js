import {
  createDynamicBodyError,
  createDynamicBodyErrorInNavigation,
  createLinkBodyErrorInNavigation,
  createRuntimeBodyError,
  createRuntimeBodyErrorInNavigation,
} from '../../server/app-render/blocking-route-messages'
import {
  createRequestInsightsByteLengthCache,
  getInstantErrorRoute,
  routeTemplateMatchesPath,
  updateRequestInsights,
} from './shared'
import type {
  RequestInsight,
  RequestInsightsCaptureState,
} from '../shared/request-insights'

const STATIC_ROUTE = '/example'
const DYNAMIC_ROUTE_TEMPLATE = '/posts/[slug]'
const CATCH_ALL_ROUTE_TEMPLATE = '/docs/[...slug]'

function createRequestInsight(
  kind: RequestInsight['kind'],
  durationMs: number,
  overrides: Partial<RequestInsight> = {}
): RequestInsight {
  return {
    requestId: 'shared-request',
    kind,
    source: kind === 'instant-insights' ? 'instant-insights' : 'page',
    htmlRequestId: 'shared-html',
    route: '/dashboard',
    startTime: 100,
    durationMs,
    status: 'ok',
    spans: [],
    fetches: [],
    ...overrides,
  }
}

function createCaptureState(
  pageRequestGroupCount: number,
  apiRequestGroupCount: number
): RequestInsightsCaptureState {
  return {
    limits: {
      maxRequestGroupsPerBucket: 200,
      maxBytesPerBucket: 18.75 * 1024 * 1024,
      maxRetainedBytes: 93.75 * 1024 * 1024,
      maxRecordsPerGroup: 15,
      maxSpansPerRecord: 200,
      maxFetchesPerRecord: 200,
      maxBytesPerRecord: 64 * 1024,
      maxBytesPerSpan: 8 * 1024,
      maxEventsPerSpan: 16,
      maxLinksPerSpan: 8,
      maxSnapshotBytes: 4 * 1024 * 1024,
    },
    usage: {
      retainedRequestGroupCount: pageRequestGroupCount + apiRequestGroupCount,
      retainedRequestCount: pageRequestGroupCount + apiRequestGroupCount,
      retainedBytes: 0,
      buckets: [
        {
          bucket: 'page',
          retainedRequestGroupCount: pageRequestGroupCount,
          retainedRequestCount: pageRequestGroupCount,
          retainedBytes: 0,
          evictedRequestGroupCount: 0,
        },
        {
          bucket: 'api',
          retainedRequestGroupCount: apiRequestGroupCount,
          retainedRequestCount: apiRequestGroupCount,
          retainedBytes: 0,
          evictedRequestGroupCount: 0,
        },
      ],
    },
  }
}

describe('updateRequestInsights', () => {
  it('updates request kinds independently when request IDs match', () => {
    const request = createRequestInsight('request', 25)
    const instantInsights = createRequestInsight('instant-insights', 50)
    const updatedInstantInsights = createRequestInsight('instant-insights', 75)
    const initialRequests = [request]
    const firstUpdate = updateRequestInsights(
      initialRequests,
      createRequestInsightsByteLengthCache(initialRequests),
      instantInsights
    )

    expect(
      updateRequestInsights(
        firstUpdate.requests,
        firstUpdate.byteLengths,
        updatedInstantInsights
      ).requests
    ).toEqual([request, updatedInstantInsights])
  })

  it('reconciles updates with per-bucket capture limits without a global 100-record cap', () => {
    const pageRequests = Array.from({ length: 70 }, (_, index) =>
      createRequestInsight('request', index, {
        requestId: `page-${index}`,
        htmlRequestId: `page-${index}`,
        source: 'page',
      })
    )
    const apiRequests = Array.from({ length: 70 }, (_, index) =>
      createRequestInsight('request', index, {
        requestId: `api-${index}`,
        htmlRequestId: `api-${index}`,
        source: 'app-route',
      })
    )
    const capture = createCaptureState(70, 70)

    const currentRequests = [...pageRequests, ...apiRequests]
    const requests = updateRequestInsights(
      currentRequests,
      createRequestInsightsByteLengthCache(currentRequests),
      createRequestInsight('request', 100, {
        requestId: 'page-70',
        htmlRequestId: 'page-70',
        source: 'page',
      }),
      capture
    ).requests

    expect(requests).toHaveLength(capture.usage.retainedRequestCount)
    expect(requests.map((request) => request.requestId)).toEqual([
      ...pageRequests.slice(1).map((request) => request.requestId),
      ...apiRequests.map((request) => request.requestId),
      'page-70',
    ])
  })

  it('serializes only the changed record during a live update', () => {
    const serializationCounts = { page: 0, api: 0, updatedPage: 0 }
    const page = withSerializationCounter(
      createRequestInsight('request', 10, {
        requestId: 'page',
        htmlRequestId: 'page',
        source: 'page',
      }),
      () => serializationCounts.page++
    )
    const api = withSerializationCounter(
      createRequestInsight('request', 20, {
        requestId: 'api',
        htmlRequestId: 'api',
        source: 'app-route',
      }),
      () => serializationCounts.api++
    )
    const currentRequests = [page, api]
    const byteLengths = createRequestInsightsByteLengthCache(currentRequests)
    serializationCounts.page = 0
    serializationCounts.api = 0
    const updatedPage = withSerializationCounter(
      createRequestInsight('request', 30, {
        requestId: 'page',
        htmlRequestId: 'page',
        source: 'page',
      }),
      () => serializationCounts.updatedPage++
    )

    const update = updateRequestInsights(
      currentRequests,
      byteLengths,
      updatedPage,
      createCaptureState(1, 1)
    )

    expect(update.requests).toEqual([updatedPage, api])
    expect(serializationCounts).toEqual({ page: 0, api: 0, updatedPage: 1 })
  })
})

function withSerializationCounter(
  request: RequestInsight,
  onSerialize: () => void
): RequestInsight {
  Object.defineProperty(request, 'toJSON', {
    value() {
      onSerialize()
      return { ...request }
    },
  })
  return request
}

describe('getInstantErrorRoute', () => {
  it('returns the route for an in-navigation runtime body error', () => {
    expect(
      getInstantErrorRoute(createRuntimeBodyErrorInNavigation(STATIC_ROUTE))
    ).toBe(STATIC_ROUTE)
  })

  it('returns the route for an in-navigation dynamic body error', () => {
    expect(
      getInstantErrorRoute(
        createDynamicBodyErrorInNavigation(DYNAMIC_ROUTE_TEMPLATE)
      )
    ).toBe(DYNAMIC_ROUTE_TEMPLATE)
  })

  it('returns the route for an in-navigation URL-data prefetch error', () => {
    expect(
      getInstantErrorRoute(
        createLinkBodyErrorInNavigation(DYNAMIC_ROUTE_TEMPLATE)
      )
    ).toBe(DYNAMIC_ROUTE_TEMPLATE)
  })

  it('returns the route for the unrendered-segment wrapper', () => {
    const error = new Error(
      `Route "${STATIC_ROUTE}": Could not validate that a segment in your UI has instant navigation.\n\nThis segment was dropped from rendering. Issues that would prevent instant navigation will go undetected.\n\nDropped segment:\n  app/example/page.tsx`
    )
    expect(getInstantErrorRoute(error)).toBe(STATIC_ROUTE)
  })

  it('returns null for SSR-only body errors', () => {
    expect(getInstantErrorRoute(createRuntimeBodyError(STATIC_ROUTE))).toBe(
      null
    )
    expect(getInstantErrorRoute(createDynamicBodyError(STATIC_ROUTE))).toBe(
      null
    )
  })

  it('returns null for unrelated errors', () => {
    expect(getInstantErrorRoute(new Error('regular bug'))).toBe(null)
  })

  it('returns null for non-Error inputs', () => {
    expect(getInstantErrorRoute(null)).toBe(null)
    expect(getInstantErrorRoute(undefined)).toBe(null)
    expect(getInstantErrorRoute('string error')).toBe(null)
  })
})

describe('routeTemplateMatchesPath', () => {
  it('matches identical static routes', () => {
    expect(routeTemplateMatchesPath(STATIC_ROUTE, STATIC_ROUTE)).toBe(true)
  })

  it('does not match different static routes', () => {
    expect(routeTemplateMatchesPath('/foo', '/bar')).toBe(false)
  })

  it('matches a dynamic template against a resolved URL', () => {
    expect(routeTemplateMatchesPath(DYNAMIC_ROUTE_TEMPLATE, '/posts/123')).toBe(
      true
    )
    expect(
      routeTemplateMatchesPath(DYNAMIC_ROUTE_TEMPLATE, '/posts/hello-world')
    ).toBe(true)
  })

  it('does not match a dynamic template against a sibling route', () => {
    expect(routeTemplateMatchesPath(DYNAMIC_ROUTE_TEMPLATE, '/users/123')).toBe(
      false
    )
  })

  it('does not match a dynamic template against deeper path segments', () => {
    expect(
      routeTemplateMatchesPath(DYNAMIC_ROUTE_TEMPLATE, '/posts/2026/05/16')
    ).toBe(false)
  })

  it('matches a catch-all template against multiple resolved segments', () => {
    expect(
      routeTemplateMatchesPath(
        CATCH_ALL_ROUTE_TEMPLATE,
        '/docs/getting-started'
      )
    ).toBe(true)
    expect(
      routeTemplateMatchesPath(
        CATCH_ALL_ROUTE_TEMPLATE,
        '/docs/app/api-reference/functions/cookies'
      )
    ).toBe(true)
  })
})
