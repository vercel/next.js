import type {
  NextMiddleware,
  RequestData,
  FetchEventResult,
  NextMiddlewareResult,
} from './types'
import type { RequestInit } from './spec-extension/request'
import { DeprecationError } from './error'
import { fromNodeHeaders } from './utils'
import { NextFetchEvent } from './spec-extension/fetch-event'
import { NextRequest } from './spec-extension/request'
import { NextResponse, RedirectHeader } from './spec-extension/response'
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
  const response = await params.handler(request, event)

  return {
    response: response || NextResponse.next(),
    waitUntil: Promise.all(event[waitUntilSymbol]),
  }
}

export function blockUnallowedResponse(
  promise: Promise<FetchEventResult>
): Promise<FetchEventResult> {
  return promise.then((result) => ({
    ...result,
    response: isAllowed(result.response)
      ? result.response
      : new Response(
          JSON.stringify({
            message: `A middleware can not alter response's body. Learn more: https://nextjs.org/docs/messages/returning-response-body-in-_middleware`,
          }),
          {
            status: 500,
            statusText: 'Internal Server Error',
            headers: { 'content-type': 'application/json' },
          }
        ),
  }))
}

function isAllowed(response: NextMiddlewareResult): boolean {
  return (
    !response?.body || !response.body || response.headers.has(RedirectHeader)
  )
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

  get request() {
    throw new DeprecationError({ page: this.sourcePage })
  }

  respondWith() {
    throw new DeprecationError({ page: this.sourcePage })
  }

  waitUntil() {
    throw new DeprecationError({ page: this.sourcePage })
  }
}
