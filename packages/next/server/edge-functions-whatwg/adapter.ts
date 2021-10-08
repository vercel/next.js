import type { EdgeFunctionRequest, EdgeFunctionResult } from './types'

import { FetchEvent } from './spec-compliant/fetch-event'
import { fromNodeHeaders } from './utils'
import { Request } from './spec-extension/request'
import { Response } from './spec-extension/response'
import { waitUntilSymbol, responseSymbol } from './spec-compliant/fetch-event'

export async function adapter(params: {
  handler: (event: FetchEvent) => void | Promise<void>
  request: EdgeFunctionRequest
}): Promise<EdgeFunctionResult> {
  const event = new FetchEvent(
    new Request(params.request.url, {
      headers: fromNodeHeaders(params.request.headers),
      method: params.request.method,
      nextConfig: params.request.nextConfig,
      page: params.request.page,
    })
  )

  // Execute the handler, it could be a promise but it has
  // to be executed synchronously. Should we check if the
  // user is attempting to respondWith after nextTick?
  params.handler(event)

  const original = await event[responseSymbol]

  // The Response has no knowledge of the Request although
  // it can read the basePath and locale from it. If we define
  // a rewrite to a pathname when the request comes from a certain
  // locale, we will correct the location to reflect such locale
  // after the effect is read.
  return {
    response: original || Response.next(),
    waitUntil: Promise.all(event[waitUntilSymbol]),
  }
}
