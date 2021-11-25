import type { RequestData, FetchEventResult } from './types'
import { DeprecationError } from './error'
import { fromNodeHeaders } from './utils'
import { NextFetchEvent } from './spec-extension/fetch-event'
import { NextRequest, RequestInit } from './spec-extension/request'
import { NextResponse } from './spec-extension/response'
import { waitUntilSymbol } from './spec-compliant/fetch-event'

export async function adapter(params: {
  handler: (request: NextRequest, event: NextFetchEvent) => Promise<Response>
  page: string
  request: RequestData
}): Promise<FetchEventResult> {
  const url = params.request.url.startsWith('/')
    ? `https://${params.request.headers.host}${params.request.url}`
    : params.request.url

  const request = new NextRequestHint({
    page: params.page,
    input: url,
    init: {
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
