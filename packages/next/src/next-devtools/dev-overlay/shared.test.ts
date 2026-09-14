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
import type { RequestInsight } from '../shared/request-insights'
import type { SupportedErrorEvent } from './container/runtime-error/render-error'

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
): SupportedErrorEvent {
  return {
    id,
    error,
    frames: [],
    type: isFatal ? 'runtime' : 'console',
    isFatal,
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
