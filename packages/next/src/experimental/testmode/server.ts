import { AsyncLocalStorage } from 'async_hooks'
import { NodeRequestHandler } from '../../server/next-server'
import type {
  ProxyFetchRequest,
  ProxyFetchResponse,
  ProxyResponse,
} from './proxy'

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

export function createTestFetch(originalFetch: Fetch): Fetch {
  return async function testFetch(
    input: FetchInputArg,
    init?: FetchInitArg
  ): Promise<Response> {
    const testInfo = testStorage.getStore()
    if (!testInfo) {
      return Promise.reject(new Error('No test info'))
    }

    const { testData, proxyPort } = testInfo
    const originalRequest = new Request(input, init)
    const proxyRequest = await buildProxyRequest(testData, originalRequest)

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
        return originalFetch(originalRequest)
      case 'abort':
      case 'unhandled':
        throw new Error('Proxy request aborted')
      default:
        break
    }
    return buildResponse(proxyResponse)
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
