import { RSC_CONTENT_TYPE_HEADER_FULL } from '../../client/components/app-router-headers'
import RenderResult, { type RenderResultMetadata } from '../render-result'
import type { AnyStream } from './stream-ops'

/**
 * Flight Response is always set to RSC_CONTENT_TYPE_HEADER_FULL (text/x-component; charset=utf-8) to ensure it does not get interpreted as HTML.
 */
export class FlightRenderResult extends RenderResult {
  constructor(
    response: string | AnyStream,
    metadata: RenderResultMetadata = {},
    waitUntil?: Promise<unknown>
  ) {
    super(response, {
      contentType: RSC_CONTENT_TYPE_HEADER_FULL,
      metadata,
      waitUntil,
    })
  }
}
