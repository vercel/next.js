import type { BaseNextRequest } from '../base-http'

import { addRequestMeta, type NextUrlWithParsedQuery } from '../request-meta'
import { BaseRequestAdapter } from './base-request-adapter'
import { RequestError } from './request-error'

export class InvokePathRequestAdapter<
  ServerRequest extends BaseNextRequest,
> extends BaseRequestAdapter<ServerRequest> {
  public async adapt(req: ServerRequest, parsedURL: NextUrlWithParsedQuery) {
    const invokePath = req.headers['x-invoke-path']

    // If there's no path to invoke, or we're just processing middleware, just
    // normalize the request.
    if (
      !invokePath ||
      typeof invokePath !== 'string' ||
      req.headers['x-middleware-invoke']
    ) {
      return this.adaptRequest(req, parsedURL)
    }

    // Strip any internal query parameters from the query object that aren't
    // associated with internal Next.js
    for (const key of Object.keys(parsedURL.query)) {
      if (!key.startsWith('__next') && !key.startsWith('_next')) {
        delete parsedURL.query[key]
      }
    }

    // Apply the query parameters from the x-invoke-query header.
    const query = req.headers['x-invoke-query']
    if (typeof query === 'string') {
      Object.assign(parsedURL.query, JSON.parse(decodeURIComponent(query)))
    }

    // If a status is provided, assume that it's an error.
    if (typeof req.headers['x-invoke-status'] === 'string') {
      const statusCode = Number(req.headers['x-invoke-status'])

      let cause: Error | null = null
      if (typeof req.headers['x-invoke-error'] === 'string') {
        try {
          const { message } = JSON.parse(req.headers['x-invoke-error'])
          cause = new Error(message)
        } catch {
          cause = new Error()
        }
      }

      throw new RequestError(statusCode, cause, parsedURL.query)
    }

    // Save a copy of the original unmodified pathname so we can see if we
    // rewrote it.
    const originalPathname = parsedURL.pathname

    // If it differs from the invoke path, rewrite the pathname.
    parsedURL.pathname = invokePath

    // Adapt using the base adapter.
    await super.adapt(req, parsedURL)

    // If we did we rewrite the URL, add a metadata entry.
    if (originalPathname !== parsedURL.pathname) {
      addRequestMeta(req, 'rewroteURL', parsedURL.pathname)
    }
  }
}
