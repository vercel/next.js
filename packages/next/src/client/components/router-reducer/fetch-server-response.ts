'use client'

// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromFetch } from 'react-server-dom-webpack/client'
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
import { PrefetchKind } from './router-reducer-types'

/**
 * Fetch the flight data for the provided url. Takes in the current router state to decide what to render server-side.
 */

export async function fetchServerResponse(
  url: URL,
  flightRouterState: FlightRouterState,
  nextUrl: string | null,
  prefetchKind?: PrefetchKind
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

  /**
   * Three cases:
   * - `prefetchKind` is `undefined`, it means it's a normal navigation, so we want to prefetch the page data fully
   * - `prefetchKind` is `full` - we want to prefetch the whole page so same as above
   * - `prefetchKind` is `auto` - if the page is dynamic, prefetch the page data partially, if static prefetch the page data fully
   */
  if (prefetchKind === PrefetchKind.AUTO) {
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
    
    // without cloning the URL any link that you click on will add the `rscQuery` to the url you are visting.
    const cloneUrl = fetchUrl.searchParams ? new URL(fetchUrl.toString()) : new URL(fetchUrl);

    // this can probably be removed, I was doing all of this with patch-package and ran into some issues without having proper TS support in node_modules when implementing the patch
    if (!cloneUrl.searchParams.has('rscQuery')) cloneUrl.searchParams.append('rscQuery', true)
  
    const res = await fetch(cloneUrl, {
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
