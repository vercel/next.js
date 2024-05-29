import type { BaseNextRequest } from '../base-http'
import type { NextUrlWithParsedQuery } from '../request-meta'

export interface RequestAdapter<ServerRequest extends BaseNextRequest> {
  adapt(req: ServerRequest, parsedURL: NextUrlWithParsedQuery): Promise<void>
}
