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
  const requestUrl = new NextURL(params.request.url, {
    headers: params.request.headers,
    nextConfig: params.request.nextConfig,
  })

  // Ensure users only see page requests, never data requests.
  const buildId = requestUrl.buildId
  requestUrl.buildId = ''

  const request = new NextRequestHint({
    page: params.page,
    input: String(requestUrl),
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
   * an internal rewrite. Also we make sure the outgoing rewrite URL is
   * a data URL if the request was a data request.
   */
  const rewrite = response?.headers.get('x-middleware-rewrite')
  if (response && rewrite) {
    const rewriteUrl = new NextURL(rewrite, {
      forceLocale: true,
      headers: params.request.headers,
      nextConfig: params.request.nextConfig,
    })

    if (rewriteUrl.host === request.nextUrl.host) {
      rewriteUrl.buildId = buildId || rewriteUrl.buildId
      response.headers.set('x-middleware-rewrite', String(rewriteUrl))
    }
  }

  /**
   * For redirects we will not include the locale in case when it is the
   * default and we must also make sure the outgoing URL is a data one if
   * the incoming request was a data request.
   */
  const redirect = response?.headers.get('Location')
  if (response && redirect) {
    const redirectURL = new NextURL(redirect, {
      forceLocale: false,
      headers: params.request.headers,
      nextConfig: params.request.nextConfig,
    })

    if (redirectURL.host === request.nextUrl.host) {
      redirectURL.buildId = buildId || redirectURL.buildId
      response.headers.set('Location', String(redirectURL))
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
