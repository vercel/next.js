import type { RequestData, FetchEventResult } from './types'

import { fromNodeHeaders } from './utils'
import { NextFetchEvent } from './spec-extension/fetch-event'
import { NextRequest } from './spec-extension/request'
import { NextResponse } from './spec-extension/response'
import { waitUntilSymbol, responseSymbol } from './spec-compliant/fetch-event'

export async function adapter(params: {
  handler: (event: NextFetchEvent) => void | Promise<void>
  request: RequestData
}): Promise<FetchEventResult> {
  const event = new NextFetchEvent(
    new NextRequest(params.request.url, {
      geo: params.request.geo,
      headers: fromNodeHeaders(params.request.headers),
      ip: params.request.ip,
      method: params.request.method,
      nextConfig: params.request.nextConfig,
      page: params.request.page,
    })
  )

  const handled = params.handler(event)
  const original = await event[responseSymbol]

  return {
    promise: Promise.resolve(handled),
    response: original || NextResponse.next(),
    waitUntil: Promise.all(event[waitUntilSymbol]),
  }
}
