import type { NextParsedUrlQuery } from '../request-meta'
import type { BaseNextRequest } from '../base-http'

import { URL } from 'url'

export enum InvokedRequestHeaders {
  OUTPUT = 'x-invoke-output',
  PATH = 'x-invoke-path',
  STATUS = 'x-invoke-status',
  QUERY = 'x-invoke-query',
  ERROR = 'x-invoke-error',
}

export class InvokedRequest {
  constructor(
    public readonly pathname: string,
    public readonly output: string,
    public readonly statusCode: number | undefined = undefined,
    public readonly query: NextParsedUrlQuery | undefined = undefined,
    public readonly error: Error | null = null
  ) {}

  static parse(req: BaseNextRequest): InvokedRequest | null {
    const path = req.headers[InvokedRequestHeaders.PATH]
    if (!path || typeof path !== 'string') return null

    const { pathname } = new URL(path, 'http://n')

    const output = req.headers[InvokedRequestHeaders.OUTPUT]
    if (!output || typeof output !== 'string') return null

    const status = req.headers[InvokedRequestHeaders.STATUS]
    if (Array.isArray(status)) return null

    // Parse the status code if it exists, throw an error if it's an invalid
    // value.
    let statusCode: number | undefined
    if (status) {
      const parsed = parseInt(status, 10)
      if (Number.isNaN(parsed)) {
        throw new Error(
          `Invalid status code received from invoked function: ${status}`
        )
      }

      statusCode = parsed
    }

    const query = req.headers[InvokedRequestHeaders.QUERY]
    if (Array.isArray(query)) return null

    // Parse the query if it exists, throw an error if it's an invalid value.
    let parsedQuery: NextParsedUrlQuery | undefined
    if (query) {
      parsedQuery = JSON.parse(decodeURIComponent(query))
    }

    const error = req.headers[InvokedRequestHeaders.ERROR]
    if (Array.isArray(error)) return null

    // Parse the error if it exists.
    let parsedError: Error | null = null
    if (typeof error === 'string') {
      const { message } = JSON.parse(error || '{}')
      parsedError = new Error(message)
    }

    return new InvokedRequest(
      pathname,
      output,
      statusCode,
      parsedQuery,
      parsedError
    )
  }
}
