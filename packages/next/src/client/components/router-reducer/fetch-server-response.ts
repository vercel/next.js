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
  FlightData,
  NextFlightResponse,
} from '../../../server/app-render/types'
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE,
  NEXT_RSC_UNION_QUERY,
  NEXT_URL,
  RSC_HEADER,
  RSC_CONTENT_TYPE_HEADER,
  NEXT_DID_POSTPONE_HEADER,
} from '../app-router-headers'
import { urlToUrlWithoutFlightMarker } from '../app-router'
import { callServer } from '../../app-call-server'
import { PrefetchKind } from './router-reducer-types'
import { hexHash } from '../../../shared/lib/hash'

export type FetchServerResponseResult = [
  flightData: FlightData,
  canonicalUrlOverride: URL | undefined,
  postponed?: boolean,
  intercepted?: boolean
]

function doMpaNavigation(url: string): FetchServerResponseResult {
  return [urlToUrlWithoutFlightMarker(url).toString(), undefined, false, false]
}

/**
 * Fetch the flight data for the provided url. Takes in the current router state to decide what to render server-side.
 */
export async function fetchServerResponse(
  url: URL,
  flightRouterState: FlightRouterState,
  nextUrl: string | null,
  currentBuildId: string,
  prefetchKind?: PrefetchKind
): Promise<FetchServerResponseResult> {
  const headers: {
    [RSC_HEADER]: '1'
    [NEXT_ROUTER_STATE_TREE]: string
    [NEXT_URL]?: string
    [NEXT_ROUTER_PREFETCH_HEADER]?: '1'
  } = {
    // Enable flight response
    [RSC_HEADER]: '1',
    // Provide the current router state
    [NEXT_ROUTER_STATE_TREE]: encodeURIComponent(
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

  if (nextUrl) {
    headers[NEXT_URL] = nextUrl
  }

  const uniqueCacheQuery = hexHash(
    [
      headers[NEXT_ROUTER_PREFETCH_HEADER] || '0',
      headers[NEXT_ROUTER_STATE_TREE],
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

    // Add unique cache query to avoid caching conflicts on CDN which don't respect to Vary header
    fetchUrl.searchParams.set(NEXT_RSC_UNION_QUERY, uniqueCacheQuery)

    const res = await fetch(fetchUrl, {
      // Backwards compat for older browsers. `same-origin` is the default in modern browsers.
      credentials: 'same-origin',
      headers,
    })

    const responseUrl = urlToUrlWithoutFlightMarker(res.url)
    const canonicalUrl = res.redirected ? responseUrl : undefined

    const contentType = res.headers.get('content-type') || ''
    const postponed = !!res.headers.get(NEXT_DID_POSTPONE_HEADER)
    const interception = !!res.headers.get('vary')?.includes(NEXT_URL)
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

    // Handle the `fetch` readable stream that can be unwrapped by `React.use`.
    const [buildId, flightData]: NextFlightResponse = await createFromFetch(
      Promise.resolve(res),
      {
        callServer,
      }
    )

    if (currentBuildId !== buildId) {
      return doMpaNavigation(res.url)
    }

    return [flightData, canonicalUrl, postponed, interception]
  } catch (err) {
    console.error(
      `Failed to fetch RSC payload for ${url}. Falling back to browser navigation.`,
      err
    )
    // If fetch fails handle it like a mpa navigation
    // TODO-APP: Add a test for the case where a CORS request fails, e.g. external url redirect coming from the response.
    // See https://github.com/vercel/next.js/issues/43605#issuecomment-1451617521 for a reproduction.
    return [url.toString(), undefined, false, false]
  }
}
