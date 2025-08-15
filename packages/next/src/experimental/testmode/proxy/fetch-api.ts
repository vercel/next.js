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

  // Extract credentials from URL and convert to Authorization header
  let cleanUrl = url
  const requestHeaders = new Headers(headers)

  try {
    const u = new URL(url)
    const hasCreds = u.username !== '' || u.password !== ''
    if (hasCreds) {
      if (!requestHeaders.has('Authorization')) {
        const token = Buffer.from(
          `${u.username}:${u.password}`,
          'utf-8'
        ).toString('base64')
        requestHeaders.set('Authorization', `Basic ${token}`)
      }
      u.username = ''
      u.password = ''
      cleanUrl = u.toString()
    }
  } catch {
    // Use original URL if parsing fails
  }

  return new Request(cleanUrl, {
    ...options,
    headers: requestHeaders,
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
