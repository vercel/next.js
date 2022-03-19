import type { NextMiddleware, RequestData, FetchEventResult } from './types'
import type { RequestInit } from './spec-extension/request'
import { DeprecationError } from './error'
import { fromNodeHeaders } from './utils'
import { NextFetchEvent } from './spec-extension/fetch-event'
import { NextRequest } from './spec-extension/request'
import { NextResponse } from './spec-extension/response'
import { waitUntilSymbol } from './spec-compliant/fetch-event'

export async function adapter(params: {
  handler: NextMiddleware
  page: string
  request: RequestData
}): Promise<FetchEventResult> {
  const request = new NextRequestHint({
    page: params.page,
    input: params.request.url,
    init: {
      body: params.request.body,
      geo: params.request.geo,
      headers: fromNodeHeaders(params.request.headers),
      ip: params.request.ip,
      method: params.request.method,
      nextConfig: params.request.nextConfig,
      page: params.request.page,
    },
  })

  const event = new NextFetchEvent({ request, page: params.page })
  const original = await params.handler(request, event)

  return {
    response: original || NextResponse.next(),
    waitUntil: Promise.all(event[waitUntilSymbol]),
  }
}

class NextRequestHint extends NextRequest {
  sourcePage: string

  constructor(params: {
    init: RequestInit
    input: Request | string
    page: string
  }) {
    super(params.input, params.init)
    this.sourcePage = params.page
  }

  /**
   * @deprecated The first parameter is now the request and the API is now async
   * with the form:
   *
   * ```ts
   * export function middleware(request, event) {
   *   return new Response("Hello " + request.url)
   * }
   * ```
   *
   * Read more: https://nextjs.org/docs/messages/middleware-new-signature
   */
  get request() {
    throw new DeprecationError({ page: this.sourcePage })
  }

  /**
   * @deprecated The first parameter is now the request and the API is now async
   * with the form:
   *
   * ```ts
   * export function middleware(request, event) {
   *   return new Response("Hello " + request.url)
   * }
   * ```
   *
   * Read more: https://nextjs.org/docs/messages/middleware-new-signature
   */
  respondWith() {
    throw new DeprecationError({ page: this.sourcePage })
  }

  /**
   * @deprecated The first parameter is now the request and the API is now async
   * with the form:
   *
   * ```ts
   * export function middleware(request, event) {
   *   return new Response("Hello " + request.url)
   * }
   * ```
   *
   * Read more: https://nextjs.org/docs/messages/middleware-new-signature
   */
  waitUntil() {
    throw new DeprecationError({ page: this.sourcePage })
  }
}
