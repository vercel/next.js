import { AsyncLocalStorage } from 'async_hooks'
import { NodeRequestHandler } from '../../server/next-server'
import type {
  ProxyFetchRequest,
  ProxyFetchResponse,
  ProxyResponse,
} from './proxy'
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'

interface TestReqInfo {
  url: string
  proxyPort: number
  testData: string
}

const testStorage = new AsyncLocalStorage<TestReqInfo>()

type Fetch = typeof fetch
type FetchInputArg = Parameters<Fetch>[0]
type FetchInitArg = Parameters<Fetch>[1]

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
      headers: Array.from(headers),
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

async function handleFetch(
  originalFetch: Fetch,
  request: Request
): Promise<Response> {
  const testInfo = testStorage.getStore()
  if (!testInfo) {
    throw new Error('No test info')
  }

  const { testData, proxyPort } = testInfo
  const proxyRequest = await buildProxyRequest(testData, request)

  const resp = await originalFetch(`http://localhost:${proxyPort}`, {
    method: 'POST',
    body: JSON.stringify(proxyRequest),
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
      throw new Error('Proxy request aborted')
    default:
      break
  }
  return buildResponse(proxyResponse)
}

function interceptFetch() {
  const originalFetch = global.fetch
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
}

export function interceptTestApis(): () => void {
  const originalFetch = global.fetch
  interceptFetch()

  const clientRequestInterceptor = new ClientRequestInterceptor()
  clientRequestInterceptor.on('request', async ({ request }) => {
    const response = await handleFetch(originalFetch, request)
    request.respondWith(response)
  })
  clientRequestInterceptor.apply()

  // Cleanup.
  return () => {
    clientRequestInterceptor.dispose()
    global.fetch = originalFetch
  }
}

export function wrapRequestHandler(
  handler: NodeRequestHandler
): NodeRequestHandler {
  return async (req, res, parsedUrl) => {
    const proxyPortHeader = req.headers['next-test-proxy-port']
    if (!proxyPortHeader) {
      await handler(req, res, parsedUrl)
      return
    }

    const url = req.url ?? ''
    const proxyPort = Number(proxyPortHeader)
    const testData = (req.headers['next-test-data'] as string | undefined) ?? ''
    const testReqInfo: TestReqInfo = {
      url,
      proxyPort,
      testData,
    }
    await testStorage.run(testReqInfo, () => handler(req, res, parsedUrl))
  }
}
