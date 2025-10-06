import type {
  ProxyFetchRequest,
  ProxyFetchResponse,
  ProxyResponse,
} from './proxy'
import { getTestReqInfo, type TestRequestReader } from './context'

type Fetch = typeof fetch
type FetchInputArg = Parameters<Fetch>[0]
type FetchInitArg = Parameters<Fetch>[1]

export const reader: TestRequestReader<Request> = {
  url(req) {
    return req.url
  },
  header(req, name) {
    return req.headers.get(name)
  },
}

function getTestStack(): string {
  let stack = (new Error().stack ?? '').split('\n')
  // Skip the first line and find first non-empty line.
  for (let i = 1; i < stack.length; i++) {
    if (stack[i].length > 0) {
      stack = stack.slice(i)
      break
    }
  }
  // Filter out franmework lines.
  stack = stack.filter((f) => !f.includes('/next/dist/'))
  // At most 5 lines.
  stack = stack.slice(0, 5)
  // Cleanup some internal info and trim.
  stack = stack.map((s) => s.replace('webpack-internal:///(rsc)/', '').trim())
  return stack.join('    ')
}

async function buildProxyRequest(
  testData: string,
  request: Request
): Promise<ProxyFetchRequest> {
  const {
    url,
    method,
    headers,
    body,
    cache,
    credentials,
    integrity,
    mode,
    redirect,
    referrer,
    referrerPolicy,
  } = request
  return {
    testData,
    api: 'fetch',
    request: {
      url,
      method,
      headers: [...Array.from(headers), ['next-test-stack', getTestStack()]],
      body: body
        ? Buffer.from(await request.arrayBuffer()).toString('base64')
        : null,
      cache,
      credentials,
      integrity,
      mode,
      redirect,
      referrer,
      referrerPolicy,
    },
  }
}

function buildResponse(proxyResponse: ProxyFetchResponse): Response {
  const { status, headers, body } = proxyResponse.response
  return new Response(body ? Buffer.from(body, 'base64') : null, {
    status,
    headers: new Headers(headers),
  })
}

export async function handleFetch(
  originalFetch: Fetch,
  request: Request
): Promise<Response> {
  const testInfo = getTestReqInfo(request, reader)
  if (!testInfo) {
    // Passthrough non-test requests.
    return originalFetch(request)
  }

  const { testData, proxyPort } = testInfo
  const proxyRequest = await buildProxyRequest(testData, request)

  const resp = await originalFetch(`http://localhost:${proxyPort}`, {
    method: 'POST',
    body: JSON.stringify(proxyRequest),
    next: {
      // @ts-ignore
      internal: true,
    },
  })
  if (!resp.ok) {
    throw new Error(`Proxy request failed: ${resp.status}`)
  }

  const proxyResponse = (await resp.json()) as ProxyResponse
  const { api } = proxyResponse
  switch (api) {
    case 'continue':
      return originalFetch(request)
    case 'abort':
    case 'unhandled':
      throw new Error(
        `Proxy request aborted [${request.method} ${request.url}]`
      )
    case 'fetch':
      return buildResponse(proxyResponse)
    default:
      return api satisfies never
  }
}

export function interceptFetch(originalFetch: Fetch) {
  global.fetch = function testFetch(
    input: FetchInputArg,
    init?: FetchInitArg
  ): Promise<Response> {
    // Passthrough internal requests.
    // @ts-ignore
    if (init?.next?.internal) {
      return originalFetch(input, init)
    }
    return handleFetch(originalFetch, new Request(input, init))
  }
  return () => {
    global.fetch = originalFetch
  }
}
