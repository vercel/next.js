import type { IncomingHttpHeaders } from 'http'
import { MockedRequest } from '../../../server/lib/mock-request'
import { NodeNextRequest } from '../../../server/base-http/node'
import type { BaseNextRequest } from '../../../server/base-http'
import type { NextResponse } from '../../../server/web/exports'
import { parseUrl } from '../../../lib/url'

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
  if (!headers.host) {
    headers.host = parseUrl(url)?.host
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
  return Boolean(getRewrittenUrl(response))
}

/**
 * Returns the URL of the response rewrite if the response is a rewrite, or
 * returns null if the response is not.
 */
export function getRewrittenUrl(response: NextResponse): string | null {
  return response.headers.get('x-middleware-rewrite')
}
