import type { IncomingHttpHeaders } from 'http'
import { MockedRequest } from '../lib/mock-request'
import { NodeNextRequest } from '../base-http/node'
import type { BaseNextRequest } from '../base-http'
import type { NextResponse } from '../web/exports'

export function constructRequest({
  url,
  headers = {},
  cookies = {},
}: {
  url: string
  headers?: IncomingHttpHeaders
  cookies?: Record<string, string>
}): BaseNextRequest {
  if (!headers) {
    headers = {}
  }
  if (cookies) {
    headers = {
      ...headers,
      cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join(';'),
    }
  }
  return new NodeNextRequest(new MockedRequest({ url, headers, method: 'GET' }))
}

/**
 * Returns the URL of the redirect if the response is a redirect response or
 * returns null if the response is not.
 */
export function getRedirectUrl(response: NextResponse): string | null {
  return response.headers.get('location')
}

/**
 * Checks whether the provided response is a rewrite response to a different
 * URL.
 */
export function isRewrite(response: NextResponse): boolean {
  return Boolean(response.headers.get('x-middleware-rewrite'))
}

/**
 * Returns the URL of the response rewrite if the response is a rewrite, or
 * returns null if the response is not.
 */
export function getRewrittenUrl(response: NextResponse): string | null {
  return response.headers.get('x-middleware-rewrite')
}
