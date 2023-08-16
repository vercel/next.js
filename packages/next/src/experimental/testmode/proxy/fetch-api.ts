import type { ProxyFetchRequest, ProxyResponse } from './types'
import { ABORT, CONTINUE, UNHANDLED } from './types'

export type FetchHandlerResult =
  | Response
  | 'abort'
  | 'continue'
  | null
  | undefined

export type FetchHandler = (
  testData: string,
  request: Request
) => FetchHandlerResult | Promise<FetchHandlerResult>

function buildRequest(req: ProxyFetchRequest): Request {
  const { request: proxyRequest } = req
  const { url, headers, body, ...options } = proxyRequest
  return new Request(url, {
    ...options,
    headers: new Headers(headers),
    body: body ? Buffer.from(body, 'base64') : null,
  })
}

async function buildResponse(
  response: FetchHandlerResult
): Promise<ProxyResponse> {
  if (!response) {
    return UNHANDLED
  }
  if (response === 'abort') {
    return ABORT
  }
  if (response === 'continue') {
    return CONTINUE
  }

  const { status, headers, body } = response
  return {
    api: 'fetch',
    response: {
      status,
      headers: Array.from(headers),
      body: body
        ? Buffer.from(await response.arrayBuffer()).toString('base64')
        : null,
    },
  }
}

export async function handleFetch(
  req: ProxyFetchRequest,
  onFetch: FetchHandler
): Promise<ProxyResponse> {
  const { testData } = req
  const request = buildRequest(req)
  const response = await onFetch(testData, request)
  return buildResponse(response)
}
