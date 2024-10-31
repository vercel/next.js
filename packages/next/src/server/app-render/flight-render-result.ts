import { RSC_CONTENT_TYPE_HEADER } from '../../client/components/app-router-headers'
import RenderResult, {
  type AppPageRenderResultMetadata,
} from '../render-result'

/**
 * Flight Response is always set to RSC_CONTENT_TYPE_HEADER to ensure it does not get interpreted as HTML.
 */
export class FlightRenderResult extends RenderResult<AppPageRenderResultMetadata> {
  constructor(
    response: string | ReadableStream<Uint8Array>,
    metadata: AppPageRenderResultMetadata = {
      type: 'app',
    }
  ) {
    super(response, { contentType: RSC_CONTENT_TYPE_HEADER, metadata })
  }
}
