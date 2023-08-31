import type { NextParsedUrlQuery } from '../request-meta'
import type { BaseNextRequest } from '../base-http'

import { URL } from 'url'

export const InvokedRequestHeaders = {
  output: 'x-invoke-output',
  path: 'x-invoke-path',
  status: 'x-invoke-status',
  query: 'x-invoke-query',
  error: 'x-invoke-error',
}

export class InvokedRequest {
  constructor(
    public readonly pathname: string,
    public readonly output: string | undefined = undefined,
    public readonly statusCode: number | undefined = undefined,
    public readonly query: NextParsedUrlQuery | undefined = undefined,
    public readonly error: Error | null = null
  ) {}

  static parse(req: Pick<BaseNextRequest, 'headers'>): InvokedRequest | null {
    const headers: Record<
      keyof typeof InvokedRequestHeaders,
      string | string[] | undefined
    > = {
      output: req.headers[InvokedRequestHeaders.output],
      path: req.headers[InvokedRequestHeaders.path],
      status: req.headers[InvokedRequestHeaders.status],
      query: req.headers[InvokedRequestHeaders.query],
      error: req.headers[InvokedRequestHeaders.error],
    }

    if (!headers.path || typeof headers.path !== 'string') return null

    const { pathname } = new URL(headers.path, 'http://n')

    // If defined, the output must be a non-empty string.
    if (Array.isArray(headers.output) || headers.output === '') return null

    if (Array.isArray(headers.status)) return null

    // Parse the status code if it exists, throw an error if it's an invalid
    // value.
    let status: number | undefined
    if (headers.status) {
      const parsed = parseInt(headers.status, 10)
      if (Number.isNaN(parsed)) {
        throw new Error(
          `Invalid status code received from invoked function: ${headers.status}`
        )
      }

      status = parsed
    }

    if (Array.isArray(headers.query)) return null

    // Parse the query if it exists, throw an error if it's an invalid value.
    let query: NextParsedUrlQuery | undefined
    if (headers.query) {
      query = JSON.parse(decodeURIComponent(headers.query))
    }

    if (Array.isArray(headers.error)) return null

    // Parse the error if it exists.
    let error: Error | null = null
    if (typeof headers.error === 'string') {
      const { message } = JSON.parse(headers.error || '{}')
      error = new Error(message)
    }

    return new InvokedRequest(pathname, headers.output, status, query, error)
  }
}
