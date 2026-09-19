import {
  createDynamicBodyError,
  createDynamicBodyErrorInNavigation,
  createLinkBodyErrorInNavigation,
  createRuntimeBodyError,
  createRuntimeBodyErrorInNavigation,
} from '../../server/app-render/blocking-route-messages'
import {
  getInstantErrorRoute,
  mergeErrorEvent,
  routeTemplateMatchesPath,
  updateRequestInsights,
} from './shared'
import {
  createRequestInsightDelta,
  type RequestInsight,
} from '../shared/request-insights'
import type { RuntimeErrorEvent } from './container/runtime-error/render-error'

const STATIC_ROUTE = '/example'
const DYNAMIC_ROUTE_TEMPLATE = '/posts/[slug]'
const CATCH_ALL_ROUTE_TEMPLATE = '/docs/[...slug]'

function createRequestInsight(
  kind: RequestInsight['kind'],
  durationMs: number
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
  }
}

function createErrorEvent(
  id: number,
  error: Error,
  isFatal: boolean = false
): RuntimeErrorEvent {
  return {
    id,
    error,
    frames: [],
    type: isFatal ? 'runtime' : 'console',
    isFatal,
    boundary: undefined,
  }
}

const noOwnerStack = () => null

describe('mergeErrorEvent', () => {
  it('keeps errors with different messages when their stacks match', () => {
    const firstError = new Error('first')
    const secondError = new Error('second')
    firstError.stack = secondError.stack = 'shared stack'
    const first = createErrorEvent(0, firstError)
    const second = createErrorEvent(1, secondError)

    expect(mergeErrorEvent([first], second, noOwnerStack)).toEqual([
      first,
      second,
    ])
  })

  it('dedupes stacks that only differ below the StrictMode frame', () => {
    const firstError = new Error('repeated')
    const secondError = new Error('repeated')
    firstError.stack =
      'Error: repeated\n at Component\n at Object.react_stack_bottom_frame (react.js:1:1)\n at first pass'
    secondError.stack =
      'Error: repeated\n at Component\n at Object.react_stack_bottom_frame (react.js:1:1)\n at second pass'
    const first = createErrorEvent(0, firstError)
    const events = [first]

    expect(
      mergeErrorEvent(events, createErrorEvent(1, secondError), noOwnerStack)
    ).toBe(events)
  })

  it('preserves occurrences caught by different boundaries', () => {
    const error = new Error('same error')
    const first = {
      ...createErrorEvent(0, error),
      boundary: { kind: 'custom' as const, name: 'Boundary' },
    }
    const second = {
      ...createErrorEvent(1, error, true),
      boundary: { kind: 'default-global' as const },
    }
    expect(mergeErrorEvent([first], second, noOwnerStack)).toEqual([
      first,
      second,
    ])
  })

  it('promotes an uncaught console report to a fatal boundary occurrence', () => {
    const error = new Error('reused')
    const first = createErrorEvent(4, error)
    const fatal = {
      ...createErrorEvent(5, error, true),
      boundary: { kind: 'default-global' as const },
    }
    const promoted = mergeErrorEvent([first], fatal, noOwnerStack)
    expect(promoted).toEqual([{ ...fatal, id: first.id }])
    expect(mergeErrorEvent(promoted, { ...fatal, id: 6 }, noOwnerStack)).toBe(
      promoted
    )
  })

  it('promotes a fatal duplicate while preserving its id', () => {
    const firstError = new Error('repeated')
    const fatalError = new Error('repeated')
    firstError.stack = fatalError.stack = 'shared stack'
    const first = createErrorEvent(4, firstError)
    const fatal = createErrorEvent(5, fatalError, true)

    expect(mergeErrorEvent([first], fatal, noOwnerStack)).toEqual([
      { ...fatal, id: first.id },
    ])
  })
})

describe('updateRequestInsights', () => {
  it('serializes new spans once instead of resending the growing request', () => {
    const request = createRequestInsight('request', 25)
    const updates = []
    let firstHalfBytes = 0
    let totalBytes = 0
    for (let index = 0; index < 200; index++) {
      request.spans.push({
        name: 'render component',
        startTime: 100,
        spanId: String(index),
      })
      const update = createRequestInsightDelta(request, index, 0)
      updates.push(update)
      totalBytes += Buffer.byteLength(JSON.stringify(update), 'utf8')
      if (index === 99) firstHalfBytes = totalBytes
    }

    expect(updates.every((update) => update.spans.length === 1)).toBe(true)
    expect(totalBytes).toBeLessThan(firstHalfBytes * 2.1)
    expect(updates[0].spans).toEqual([
      { name: 'render component', startTime: 100, spanId: '0' },
    ])
  })

  it('splits large batches into bounded deltas without losing records', () => {
    const request = createRequestInsight('request', 25)
    request.spans = Array.from({ length: 300 }, (_, index) => ({
      name: `span ${index}`,
      startTime: index,
    }))
    request.fetches = Array.from({ length: 150 }, (_, index) => ({
      url: `/data/${index}`,
      startTime: index,
    }))
    let requests: RequestInsight[] = []
    let spanOffset = 0
    let fetchOffset = 0
    while (
      spanOffset < request.spans.length ||
      fetchOffset < request.fetches.length
    ) {
      const delta = createRequestInsightDelta(request, spanOffset, fetchOffset)
      expect(delta.spans.length + delta.fetches.length).toBeGreaterThan(0)
      expect(delta.spans.length + delta.fetches.length).toBeLessThanOrEqual(128)
      requests = updateRequestInsights(requests, delta)
      spanOffset += delta.spans.length
      fetchOffset += delta.fetches.length
    }
    expect(requests).toEqual([request])
  })

  it('appends only the unseen portion of a delta after a snapshot', () => {
    const firstSpan = { name: 'first', startTime: 100 }
    const secondSpan = { name: 'second', startTime: 110 }
    const thirdSpan = { name: 'third', startTime: 120 }
    const firstFetch = { url: '/first', startTime: 100 }
    const secondFetch = { url: '/second', startTime: 120 }
    const snapshot = {
      ...createRequestInsight('request', 25),
      spans: [firstSpan, secondSpan],
      fetches: [firstFetch],
    }
    const delta = {
      ...snapshot,
      spanOffset: 1,
      fetchOffset: 0,
      spans: [secondSpan, thirdSpan],
      fetches: [firstFetch, secondFetch],
    }
    const updated = updateRequestInsights([snapshot], delta)

    expect(updated[0].spans).toEqual([firstSpan, secondSpan, thirdSpan])
    expect(updated[0].fetches).toEqual([firstFetch, secondFetch])
    expect(updateRequestInsights(updated, delta)).toEqual(updated)
    expect(snapshot.spans).toEqual([firstSpan, secondSpan])
    expect(snapshot.fetches).toEqual([firstFetch])
  })

  it('preserves span and fetch arrays when only metadata changes', () => {
    const previous = {
      ...createRequestInsight('request', 25),
      spans: [{ name: 'render', startTime: 100 }],
      fetches: [{ url: '/data', startTime: 100 }],
    }
    const update = {
      ...previous,
      completedAt: 150,
      spanOffset: 1,
      fetchOffset: 1,
      spans: [],
      fetches: [],
    }
    const [completed] = updateRequestInsights([previous], update)

    expect(completed.completedAt).toBe(150)
    expect(completed.spans).toBe(previous.spans)
    expect(completed.fetches).toBe(previous.fetches)
  })

  it('keeps completed requests in completion order after late updates', () => {
    const first = {
      ...createRequestInsight('request', 25),
      requestId: 'first',
      completedAt: 100,
    }
    const second = { ...first, requestId: 'second', completedAt: 110 }
    const lateUpdate = {
      ...first,
      spanOffset: 0,
      fetchOffset: 0,
      spans: [{ name: 'late work', startTime: 120 }],
    }

    expect(
      updateRequestInsights([first, second], lateUpdate).map(
        (request) => request.requestId
      )
    ).toEqual(['first', 'second'])
  })

  it('waits for the initial snapshot when a delta starts after missing records', () => {
    const delta = {
      ...createRequestInsight('request', 25),
      spanOffset: 5,
      fetchOffset: 0,
      spans: [{ name: 'late work', startTime: 120 }],
    }
    expect(updateRequestInsights([], delta)).toEqual([])
  })

  it('updates request kinds independently when request IDs match', () => {
    const request = createRequestInsight('request', 25)
    const instantInsights = createRequestInsight('instant-insights', 50)
    const updatedInstantInsights = createRequestInsight('instant-insights', 75)

    expect(
      updateRequestInsights(
        updateRequestInsights([request], instantInsights),
        updatedInstantInsights
      )
    ).toEqual([request, updatedInstantInsights])
  })

  it('keeps active requests outside the completed request limit', () => {
    const active = {
      ...createRequestInsight('request', 25),
      requestId: 'active',
      completedAt: undefined,
    }
    const completed = Array.from({ length: 101 }, (_, index) => ({
      ...createRequestInsight('request', 25),
      requestId: `completed-${index}`,
      completedAt: index + 1,
    }))

    const requests = completed.reduce<RequestInsight[]>(
      (current, request) => updateRequestInsights(current, request),
      [active]
    )

    expect(requests).toHaveLength(101)
    expect(requests[0]).toBe(active)
    expect(
      requests.some((request) => request.requestId === 'completed-0')
    ).toBe(false)
  })
})

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
