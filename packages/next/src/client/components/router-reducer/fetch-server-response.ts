'use client'

// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
// import { createFromFetch } from 'react-server-dom-webpack/client'
const { createFromFetch } = (
  !!process.env.NEXT_RUNTIME
    ? // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client.edge')
    : // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client')
) as typeof import('react-server-dom-webpack/client')

import type {
  FlightRouterState,
  NavigationFlightResponse,
  FetchServerResponseResult,
} from '../../../server/app-render/types'
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_RSC_UNION_QUERY,
  NEXT_URL,
  RSC_HEADER,
  RSC_CONTENT_TYPE_HEADER,
  NEXT_HMR_REFRESH_HEADER,
  NEXT_IS_PRERENDER_HEADER,
} from '../app-router-headers'
import { callServer } from '../../app-call-server'
import { PrefetchKind } from './router-reducer-types'
import { hexHash } from '../../../shared/lib/hash'
import { waitForWebpackRuntimeHotUpdate } from '../react-dev-overlay/app/hot-reloader-client'

export interface FetchServerResponseOptions {
  readonly flightRouterState: FlightRouterState
  readonly nextUrl: string | null
  readonly buildId: string
  readonly prefetchKind?: PrefetchKind
  readonly isHmrRefresh?: boolean
}

function urlToUrlWithoutFlightMarker(url: string): URL {
  const urlWithoutFlightParameters = new URL(url, location.origin)
  urlWithoutFlightParameters.searchParams.delete(NEXT_RSC_UNION_QUERY)
  if (process.env.NODE_ENV === 'production') {
    if (
      process.env.__NEXT_CONFIG_OUTPUT === 'export' &&
      urlWithoutFlightParameters.pathname.endsWith('.txt')
    ) {
      const { pathname } = urlWithoutFlightParameters
      const length = pathname.endsWith('/index.txt') ? 10 : 4
      // Slice off `/index.txt` or `.txt` from the end of the pathname
      urlWithoutFlightParameters.pathname = pathname.slice(0, -length)
    }
  }
  return urlWithoutFlightParameters
}

function doMpaNavigation(url: string): FetchServerResponseResult {
  return {
    f: urlToUrlWithoutFlightMarker(url).toString(),
    c: undefined,
    i: false,
    p: false,
  }
}

/**
 * Fetch the flight data for the provided url. Takes in the current router state
 * to decide what to render server-side.
 */
export async function fetchServerResponse(
  url: URL,
  options: FetchServerResponseOptions
): Promise<FetchServerResponseResult> {
  const { flightRouterState, nextUrl, buildId, prefetchKind } = options

  const headers: {
    [RSC_HEADER]: '1'
    [NEXT_ROUTER_STATE_TREE_HEADER]: string
    [NEXT_URL]?: string
    [NEXT_ROUTER_PREFETCH_HEADER]?: '1'
    [NEXT_HMR_REFRESH_HEADER]?: '1'
    // A header that is only added in test mode to assert on fetch priority
    'Next-Test-Fetch-Priority'?: RequestInit['priority']
  } = {
    // Enable flight response
    [RSC_HEADER]: '1',
    // Provide the current router state
    [NEXT_ROUTER_STATE_TREE_HEADER]: encodeURIComponent(
      JSON.stringify(flightRouterState)
    ),
  }

  /**
   * Three cases:
   * - `prefetchKind` is `undefined`, it means it's a normal navigation, so we want to prefetch the page data fully
   * - `prefetchKind` is `full` - we want to prefetch the whole page so same as above
   * - `prefetchKind` is `auto` - if the page is dynamic, prefetch the page data partially, if static prefetch the page data fully
   */
  if (prefetchKind === PrefetchKind.AUTO) {
    headers[NEXT_ROUTER_PREFETCH_HEADER] = '1'
  }

  if (process.env.NODE_ENV === 'development' && options.isHmrRefresh) {
    headers[NEXT_HMR_REFRESH_HEADER] = '1'
  }

  if (nextUrl) {
    headers[NEXT_URL] = nextUrl
  }

  const uniqueCacheQuery = hexHash(
    [
      headers[NEXT_ROUTER_PREFETCH_HEADER] || '0',
      headers[NEXT_ROUTER_STATE_TREE_HEADER],
      headers[NEXT_URL],
    ].join(',')
  )

  try {
    let fetchUrl = new URL(url)
    if (process.env.NODE_ENV === 'production') {
      if (process.env.__NEXT_CONFIG_OUTPUT === 'export') {
        if (fetchUrl.pathname.endsWith('/')) {
          fetchUrl.pathname += 'index.txt'
        } else {
          fetchUrl.pathname += '.txt'
        }
      }
    }

    // Add unique cache query to avoid caching conflicts on CDN which don't respect the Vary header
    fetchUrl.searchParams.set(NEXT_RSC_UNION_QUERY, uniqueCacheQuery)

    // When creating a "temporary" prefetch (the "on-demand" prefetch that gets created on navigation, if one doesn't exist)
    // we send the request with a "high" priority as it's in response to a user interaction that could be blocking a transition.
    // Otherwise, all other prefetches are sent with a "low" priority.
    // We use "auto" for in all other cases to match the existing default, as this function is shared outside of prefetching.
    const fetchPriority = prefetchKind
      ? prefetchKind === PrefetchKind.TEMPORARY
        ? 'high'
        : 'low'
      : 'auto'

    if (process.env.__NEXT_TEST_MODE) {
      headers['Next-Test-Fetch-Priority'] = fetchPriority
    }

    const res = await fetch(fetchUrl, {
      // Backwards compat for older browsers. `same-origin` is the default in modern browsers.
      credentials: 'same-origin',
      headers,
      priority: fetchPriority,
    })

    const responseUrl = urlToUrlWithoutFlightMarker(res.url)
    const canonicalUrl = res.redirected ? responseUrl : undefined

    const contentType = res.headers.get('content-type') || ''
    const interception = !!res.headers.get('vary')?.includes(NEXT_URL)
    const isPrerender = !!res.headers.get(NEXT_IS_PRERENDER_HEADER)
    let isFlightResponse = contentType === RSC_CONTENT_TYPE_HEADER

    if (process.env.NODE_ENV === 'production') {
      if (process.env.__NEXT_CONFIG_OUTPUT === 'export') {
        if (!isFlightResponse) {
          isFlightResponse = contentType.startsWith('text/plain')
        }
      }
    }

    // If fetch returns something different than flight response handle it like a mpa navigation
    // If the fetch was not 200, we also handle it like a mpa navigation
    if (!isFlightResponse || !res.ok) {
      // in case the original URL came with a hash, preserve it before redirecting to the new URL
      if (url.hash) {
        responseUrl.hash = url.hash
      }

      return doMpaNavigation(responseUrl.toString())
    }

    // We may navigate to a page that requires a different Webpack runtime.
    // In prod, every page will have the same Webpack runtime.
    // In dev, the Webpack runtime is minimal for each page.
    // We need to ensure the Webpack runtime is updated before executing client-side JS of the new page.
    if (process.env.NODE_ENV !== 'production' && !process.env.TURBOPACK) {
      await waitForWebpackRuntimeHotUpdate()
    }

    // Handle the `fetch` readable stream that can be unwrapped by `React.use`.
    const response: NavigationFlightResponse = await createFromFetch(
      Promise.resolve(res),
      {
        callServer,
      }
    )

    if (buildId !== response.b) {
      return doMpaNavigation(res.url)
    }

    return {
      f: response.f,
      c: canonicalUrl,
      i: interception,
      p: isPrerender,
    }
  } catch (err) {
    console.error(
      `Failed to fetch RSC payload for ${url}. Falling back to browser navigation.`,
      err
    )
    // If fetch fails handle it like a mpa navigation
    // TODO-APP: Add a test for the case where a CORS request fails, e.g. external url redirect coming from the response.
    // See https://github.com/vercel/next.js/issues/43605#issuecomment-1451617521 for a reproduction.
    return {
      f: url.toString(),
      c: undefined,
      i: false,
      p: false,
    }
  }
}
