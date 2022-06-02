import type { NextMiddleware, RequestData, FetchEventResult } from './types'
import type { RequestInit } from './spec-extension/request'
import { DeprecationSignatureError } from './error'
import { fromNodeHeaders } from './utils'
import { NextFetchEvent } from './spec-extension/fetch-event'
import { NextRequest } from './spec-extension/request'
import { NextResponse } from './spec-extension/response'
import { waitUntilSymbol } from './spec-extension/fetch-event'
import { NextURL } from './next-url'

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
    },
  })

  const event = new NextFetchEvent({ request, page: params.page })
  const response = await params.handler(request, event)

  /**
   * For rewrites we must always include the locale in the final pathname
   * so we re-create the NextURL forcing it to include it when the it is
   * an internal rewrite.
   */
  if (response?.headers.has('x-middleware-rewrite')) {
    const url = new NextURL(response.headers.get('x-middleware-rewrite')!, {
      forceLocale: true,
      headers: params.request.headers,
      nextConfig: params.request.nextConfig,
    })

    if (url.host === request.nextUrl.host) {
      response.headers.set(
        'x-middleware-rewrite',
        String(
          new NextURL(response.headers.get('x-middleware-rewrite')!, {
            forceLocale: true,
            headers: params.request.headers,
            nextConfig: params.request.nextConfig,
          })
        )
      )
    }
  }

  return {
    response: response || NextResponse.next(),
    waitUntil: Promise.all(event[waitUntilSymbol]),
  }
}

export function blockUnallowedResponse(
  promise: Promise<FetchEventResult>
): Promise<FetchEventResult> {
  return promise.then((result) => {
    if (result.response?.body) {
      console.error(
        new Error(
          `A middleware can not alter response's body. Learn more: https://nextjs.org/docs/messages/returning-response-body-in-middleware`
        )
      )
      return {
        ...result,
        response: new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      }
    }
    return result
  })
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
    throw new DeprecationSignatureError({ page: this.sourcePage })
  }

  respondWith() {
    throw new DeprecationSignatureError({ page: this.sourcePage })
  }

  waitUntil() {
    throw new DeprecationSignatureError({ page: this.sourcePage })
  }
}
