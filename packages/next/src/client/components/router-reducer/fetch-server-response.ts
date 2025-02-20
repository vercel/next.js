'use client'

// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
// import { createFromReadableStream } from 'react-server-dom-webpack/client'
const { createFromReadableStream } = (
  !!process.env.NEXT_RUNTIME
    ? // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client.edge')
    : // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client')
) as typeof import('react-server-dom-webpack/client')

import type {
  FlightRouterState,
  NavigationFlightResponse,
} from '../../../server/app-render/types'

import type { NEXT_ROUTER_SEGMENT_PREFETCH_HEADER } from '../app-router-headers'
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_RSC_UNION_QUERY,
  NEXT_URL,
  RSC_HEADER,
  RSC_CONTENT_TYPE_HEADER,
  NEXT_HMR_REFRESH_HEADER,
  NEXT_DID_POSTPONE_HEADER,
  NEXT_ROUTER_STALE_TIME_HEADER,
} from '../app-router-headers'
import { callServer } from '../../app-call-server'
import { findSourceMapURL } from '../../app-find-source-map-url'
import { PrefetchKind } from './router-reducer-types'
import {
  normalizeFlightData,
  type NormalizedFlightData,
} from '../../flight-data-helpers'
import { getAppBuildId } from '../../app-build-id'
import { setCacheBustingSearchParam } from './set-cache-busting-search-param'

export interface FetchServerResponseOptions {
  readonly flightRouterState: FlightRouterState
  readonly nextUrl: string | null
  readonly prefetchKind?: PrefetchKind
  readonly isHmrRefresh?: boolean
}

export type FetchServerResponseResult = {
  flightData: NormalizedFlightData[] | string
  canonicalUrl: URL | undefined
  couldBeIntercepted: boolean
  prerendered: boolean
  postponed: boolean
  staleTime: number
}

export type RequestHeaders = {
  [RSC_HEADER]?: '1'
  [NEXT_ROUTER_STATE_TREE_HEADER]?: string
  [NEXT_URL]?: string
  [NEXT_ROUTER_PREFETCH_HEADER]?: '1'
  [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]?: string
  'x-deployment-id'?: string
  [NEXT_HMR_REFRESH_HEADER]?: '1'
  // A header that is only added in test mode to assert on fetch priority
  'Next-Test-Fetch-Priority'?: RequestInit['priority']
}

export function urlToUrlWithoutFlightMarker(url: string): URL {
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
    flightData: urlToUrlWithoutFlightMarker(url).toString(),
    canonicalUrl: undefined,
    couldBeIntercepted: false,
    prerendered: false,
    postponed: false,
    staleTime: -1,
  }
}

let abortController = new AbortController()

if (typeof window !== 'undefined') {
  // Abort any in-flight requests when the page is unloaded, e.g. due to
  // reloading the page or performing hard navigations. This allows us to ignore
  // what would otherwise be a thrown TypeError when the browser cancels the
  // requests.
  window.addEventListener('pagehide', () => {
    abortController.abort()
  })

  // Use a fresh AbortController instance on pageshow, e.g. when navigating back
  // and the JavaScript execution context is restored by the browser.
  window.addEventListener('pageshow', () => {
    abortController = new AbortController()
  })
}

/**
 * Fetch the flight data for the provided url. Takes in the current router state
 * to decide what to render server-side.
 */
export async function fetchServerResponse(
  url: URL,
  options: FetchServerResponseOptions
): Promise<FetchServerResponseResult> {
  const { flightRouterState, nextUrl, prefetchKind } = options

  const headers: RequestHeaders = {
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

  try {
    // When creating a "temporary" prefetch (the "on-demand" prefetch that gets created on navigation, if one doesn't exist)
    // we send the request with a "high" priority as it's in response to a user interaction that could be blocking a transition.
    // Otherwise, all other prefetches are sent with a "low" priority.
    // We use "auto" for in all other cases to match the existing default, as this function is shared outside of prefetching.
    const fetchPriority = prefetchKind
      ? prefetchKind === PrefetchKind.TEMPORARY
        ? 'high'
        : 'low'
      : 'auto'

    const res = await createFetch(
      url,
      headers,
      fetchPriority,
      abortController.signal
    )

    const responseUrl = urlToUrlWithoutFlightMarker(res.url)
    const canonicalUrl = res.redirected ? responseUrl : undefined

    const contentType = res.headers.get('content-type') || ''
    const interception = !!res.headers.get('vary')?.includes(NEXT_URL)
    const postponed = !!res.headers.get(NEXT_DID_POSTPONE_HEADER)
    const staleTimeHeader = res.headers.get(NEXT_ROUTER_STALE_TIME_HEADER)
    const staleTime =
      staleTimeHeader !== null ? parseInt(staleTimeHeader, 10) : -1
    let isFlightResponse = contentType.startsWith(RSC_CONTENT_TYPE_HEADER)

    if (process.env.NODE_ENV === 'production') {
      if (process.env.__NEXT_CONFIG_OUTPUT === 'export') {
        if (!isFlightResponse) {
          isFlightResponse = contentType.startsWith('text/plain')
        }
      }
    }

    // If fetch returns something different than flight response handle it like a mpa navigation
    // If the fetch was not 200, we also handle it like a mpa navigation
    if (!isFlightResponse || !res.ok || !res.body) {
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
      await require('../react-dev-overlay/app/hot-reloader-client').waitForWebpackRuntimeHotUpdate()
    }

    // Handle the `fetch` readable stream that can be unwrapped by `React.use`.
    const flightStream = postponed
      ? createUnclosingPrefetchStream(res.body)
      : res.body
    const response = await (createFromNextReadableStream(
      flightStream
    ) as Promise<NavigationFlightResponse>)

    if (getAppBuildId() !== response.b) {
      return doMpaNavigation(res.url)
    }

    return {
      flightData: normalizeFlightData(response.f),
      canonicalUrl: canonicalUrl,
      couldBeIntercepted: interception,
      prerendered: response.S,
      postponed,
      staleTime,
    }
  } catch (err) {
    if (!abortController.signal.aborted) {
      console.error(
        `Failed to fetch RSC payload for ${url}. Falling back to browser navigation.`,
        err
      )
    }

    // If fetch fails handle it like a mpa navigation
    // TODO-APP: Add a test for the case where a CORS request fails, e.g. external url redirect coming from the response.
    // See https://github.com/vercel/next.js/issues/43605#issuecomment-1451617521 for a reproduction.
    return {
      flightData: url.toString(),
      canonicalUrl: undefined,
      couldBeIntercepted: false,
      prerendered: false,
      postponed: false,
      staleTime: -1,
    }
  }
}

export function createFetch(
  url: URL,
  headers: RequestHeaders,
  fetchPriority: 'auto' | 'high' | 'low' | null,
  signal?: AbortSignal
) {
  const fetchUrl = new URL(url)

  if (process.env.NODE_ENV === 'production') {
    if (process.env.__NEXT_CONFIG_OUTPUT === 'export') {
      if (fetchUrl.pathname.endsWith('/')) {
        fetchUrl.pathname += 'index.txt'
      } else {
        fetchUrl.pathname += '.txt'
      }
    }
  }

  setCacheBustingSearchParam(fetchUrl, headers)

  if (process.env.__NEXT_TEST_MODE && fetchPriority !== null) {
    headers['Next-Test-Fetch-Priority'] = fetchPriority
  }

  if (process.env.NEXT_DEPLOYMENT_ID) {
    headers['x-deployment-id'] = process.env.NEXT_DEPLOYMENT_ID
  }

  return fetch(fetchUrl, {
    // Backwards compat for older browsers. `same-origin` is the default in modern browsers.
    credentials: 'same-origin',
    headers,
    priority: fetchPriority || undefined,
    signal,
  })
}

export function createFromNextReadableStream(
  flightStream: ReadableStream<Uint8Array>
): Promise<unknown> {
  return createFromReadableStream(flightStream, {
    callServer,
    findSourceMapURL,
  })
}

function createUnclosingPrefetchStream(
  originalFlightStream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  // When PPR is enabled, prefetch streams may contain references that never
  // resolve, because that's how we encode dynamic data access. In the decoded
  // object returned by the Flight client, these are reified into hanging
  // promises that suspend during render, which is effectively what we want.
  // The UI resolves when it switches to the dynamic data stream
  // (via useDeferredValue(dynamic, static)).
  //
  // However, the Flight implementation currently errors if the server closes
  // the response before all the references are resolved. As a cheat to work
  // around this, we wrap the original stream in a new stream that never closes,
  // and therefore doesn't error.
  const reader = originalFlightStream.getReader()
  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (!done) {
          // Pass to the target stream and keep consuming the Flight response
          // from the server.
          controller.enqueue(value)
          continue
        }
        // The server stream has closed. Exit, but intentionally do not close
        // the target stream.
        return
      }
    },
  })
}
