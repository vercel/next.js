'use client'

import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack/client'
import type {
  FlightRouterState,
  FlightData,
} from '../../../server/app-render/types'
import {
  NEXT_ROUTER_PREFETCH,
  NEXT_ROUTER_STATE_TREE,
  NEXT_URL,
  RSC,
  RSC_CONTENT_TYPE_HEADER,
} from '../app-router-headers'
import { urlToUrlWithoutFlightMarker } from '../app-router'
import { callServer } from '../../app-call-server'

/**
 * Fetch the flight data for the provided url. Takes in the current router state to decide what to render server-side.
 */

export async function fetchServerResponse(
  url: URL,
  flightRouterState: FlightRouterState,
  nextUrl: string | null,
  prefetch?: true
): Promise<[FlightData: FlightData, canonicalUrlOverride: URL | undefined]> {
  const headers: {
    [RSC]: '1'
    [NEXT_ROUTER_STATE_TREE]: string
    [NEXT_URL]?: string
    [NEXT_ROUTER_PREFETCH]?: '1'
  } = {
    // Enable flight response
    [RSC]: '1',
    // Provide the current router state
    [NEXT_ROUTER_STATE_TREE]: JSON.stringify(flightRouterState),
  }
  if (prefetch) {
    // Enable prefetch response
    headers[NEXT_ROUTER_PREFETCH] = '1'
  }

  if (nextUrl) {
    headers[NEXT_URL] = nextUrl
  }

  try {
    let fetchUrl = url
    if (process.env.NODE_ENV === 'production') {
      if (process.env.__NEXT_CONFIG_OUTPUT === 'export') {
        fetchUrl = new URL(url) // clone
        if (fetchUrl.pathname.endsWith('/')) {
          fetchUrl.pathname += 'index.txt'
        } else {
          fetchUrl.pathname += '.txt'
        }
      }
    }
    const res = await fetch(fetchUrl, {
      // Backwards compat for older browsers. `same-origin` is the default in modern browsers.
      credentials: 'same-origin',
      headers,
    })
    const canonicalUrl = res.redirected
      ? urlToUrlWithoutFlightMarker(res.url)
      : undefined

    const contentType = res.headers.get('content-type') || ''
    let isFlightResponse = contentType === RSC_CONTENT_TYPE_HEADER

    if (process.env.NODE_ENV === 'production') {
      if (process.env.__NEXT_CONFIG_OUTPUT === 'export') {
        if (!isFlightResponse) {
          isFlightResponse = contentType.startsWith('text/plain')
        }
      }
    }

    // If fetch returns something different than flight response handle it like a mpa navigation
    if (!isFlightResponse) {
      return [res.url, undefined]
    }

    // Handle the `fetch` readable stream that can be unwrapped by `React.use`.
    const flightData: FlightData = await createFromFetch(Promise.resolve(res), {
      callServer,
    })
    return [flightData, canonicalUrl]
  } catch (err) {
    console.error(
      'Failed to fetch RSC payload. Falling back to browser navigation.',
      err
    )
    // If fetch fails handle it like a mpa navigation
    // TODO-APP: Add a test for the case where a CORS request fails, e.g. external url redirect coming from the response.
    // See https://github.com/vercel/next.js/issues/43605#issuecomment-1451617521 for a reproduction.
    return [url.toString(), undefined]
  }
}
