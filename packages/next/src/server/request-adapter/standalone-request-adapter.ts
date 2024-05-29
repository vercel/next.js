import type { BaseNextRequest } from '../base-http'
import type { NextUrlWithParsedQuery } from '../request-meta'
import type { RequestAdapter } from './request-adapter'
import type { InvokePathRequestAdapter } from './invoke-path-request-adapter'
import type { MatchedPathRequestAdapter } from './matched-path-request-adapter'

export class StandaloneRequestAdapter<ServerRequest extends BaseNextRequest>
  implements RequestAdapter<ServerRequest>
{
  constructor(
    private readonly matchedPathRequestAdapter: MatchedPathRequestAdapter<ServerRequest>,
    private readonly invokePathRequestAdapter: InvokePathRequestAdapter<ServerRequest>
  ) {}

  public async adapt(
    req: ServerRequest,
    parsedURL: NextUrlWithParsedQuery
  ): Promise<void> {
    // Today, standalone mode is used to test the x-matched-path support as
    // well.

    // FIXME: remove this fallback when the tests are updated.
    if (
      req.headers['x-matched-path'] &&
      typeof req.headers['x-matched-path'] === 'string'
    ) {
      return this.matchedPathRequestAdapter.adapt(req, parsedURL)
    }

    return this.invokePathRequestAdapter.adapt(req, parsedURL)
  }
}
