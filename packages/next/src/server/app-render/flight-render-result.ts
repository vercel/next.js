import { RSC_CONTENT_TYPE_HEADER } from '../../client/components/app-router-headers'
import RenderResult, { type RenderResultMetadata } from '../render-result'
import type { AnyStream } from './stream-ops'

let observeFlightResponse: (response: string | AnyStream) => string | AnyStream
if (process.env.__NEXT_DEV_SERVER && process.env.NEXT_RUNTIME !== 'edge') {
  // This is the Flight payload sent to the browser, so it is measured for
  // Request Insights.
  const { tapRscPayloadForRequestInsights } =
    require('../dev/rsc-payload-tap') as typeof import('../dev/rsc-payload-tap')
  observeFlightResponse = (response) =>
    typeof response === 'string'
      ? response
      : tapRscPayloadForRequestInsights(response)
} else {
  observeFlightResponse = (response) => response
}

/**
 * Flight Response is always set to RSC_CONTENT_TYPE_HEADER to ensure it does not get interpreted as HTML.
 */
export class FlightRenderResult extends RenderResult {
  constructor(
    response: string | AnyStream,
    metadata: RenderResultMetadata = {},
    waitUntil?: Promise<unknown>
  ) {
    super(observeFlightResponse(response), {
      contentType: RSC_CONTENT_TYPE_HEADER,
      metadata,
      waitUntil,
    })
  }
}
