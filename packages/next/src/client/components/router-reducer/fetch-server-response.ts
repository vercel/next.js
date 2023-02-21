'use client'

import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack/client'
import { FlightRouterState, FlightData } from '../../../server/app-render'
import {
  NEXT_ROUTER_PREFETCH,
  NEXT_ROUTER_STATE_TREE,
  RSC,
  RSC_CONTENT_TYPE_HEADER,
} from '../app-router-headers'
import { urlToUrlWithoutFlightMarker } from '../app-router'

/**
 * Fetch the flight data for the provided url. Takes in the current router state to decide what to render server-side.
 */

export async function fetchServerResponse(
  url: URL,
  flightRouterState: FlightRouterState,
  prefetch?: true
): Promise<[FlightData: FlightData, canonicalUrlOverride: URL | undefined]> {
  const headers: {
    [RSC]: '1'
    [NEXT_ROUTER_STATE_TREE]: string
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

  const res = await fetch(url.toString(), {
    // Backwards compat for older browsers. `same-origin` is the default in modern browsers.
    credentials: 'same-origin',
    headers,
  })
  const canonicalUrl = res.redirected
    ? urlToUrlWithoutFlightMarker(res.url)
    : undefined

  const isFlightResponse =
    res.headers.get('content-type') === RSC_CONTENT_TYPE_HEADER

  // If fetch returns something different than flight response handle it like a mpa navigation
  if (!isFlightResponse) {
    return [res.url, undefined]
  }

  // Handle the `fetch` readable stream that can be unwrapped by `React.use`.
  const flightData: FlightData = await createFromFetch(Promise.resolve(res))
  return [flightData, canonicalUrl]
}
