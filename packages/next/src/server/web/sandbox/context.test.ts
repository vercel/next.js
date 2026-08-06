import { RequestInsights } from '../../lib/trace/request-insights'
import { getModuleContext, requestStore } from './context'
import { validateURL } from '../utils'

const mockPrepareRequestInsightsSandboxFetch = jest.fn()

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  validateURL: jest.fn(jest.requireActual('../utils').validateURL),
}))

jest.mock('../../lib/trace/request-insights-sandbox-fetch', () => {
  const actual = jest.requireActual<
    typeof import('../../lib/trace/request-insights-sandbox-fetch')
  >('../../lib/trace/request-insights-sandbox-fetch')
  return {
    ...actual,
    prepareRequestInsightsSandboxFetch: (
      ...args: Parameters<typeof actual.prepareRequestInsightsSandboxFetch>
    ) => {
      mockPrepareRequestInsightsSandboxFetch(...args)
      return actual.prepareRequestInsightsSandboxFetch(...args)
    },
  }
})

const mockedValidateURL = jest.mocked(validateURL)

describe('Next.js sandbox Request constructor', () => {
  let moduleContext: any

  beforeEach(async () => {
    mockedValidateURL.mockClear()
    moduleContext = await getModuleContext({
      moduleName: 'test-module',
      onError: () => {},
      onWarning: () => {},
      useCache: false,
      distDir: '/tmp',
      edgeFunctionEntry: {
        assets: [],
        wasm: [],
        env: {},
      },
    })
  })

  it('should preserve Request method when copying Request in Next.js context', () => {
    const { Request: NextRequest } = moduleContext.runtime.context

    const originalRequest = new NextRequest('https://example.com', {
      method: 'POST',
    })
    expect(originalRequest.method).toBe('POST')

    const copiedRequest = new NextRequest(originalRequest)

    expect(copiedRequest.method).toBe('POST')
    expect(copiedRequest.url).toBe('https://example.com/')
  })

  it('should validate URL is called during Request construction', () => {
    const { Request: NextRequest } = moduleContext.runtime.context

    new NextRequest('https://example.com')
    expect(mockedValidateURL).toHaveBeenCalledWith('https://example.com')
  })

  it('should handle Request with body and headers correctly', () => {
    const { Request: NextRequest } = moduleContext.runtime.context

    const originalRequest = new NextRequest('https://example.com', {
      method: 'POST',
      body: 'test body',
      headers: { 'Content-Type': 'application/json' },
    })

    const copiedRequest = new NextRequest(originalRequest)

    expect(copiedRequest.method).toBe('POST')
    expect(copiedRequest.headers.get('Content-Type')).toBe('application/json')
  })

  it('should throw Next.js specific error for relative URLs', () => {
    const { Request: NextRequest } = moduleContext.runtime.context
    expect(() => new NextRequest('/urls-b')).toThrow(
      'Please use only absolute URLs'
    )
  })

  it('shares one RequestInit method read between Request Insights and fetch', async () => {
    const originalDevServer = process.env.__NEXT_DEV_SERVER
    process.env.__NEXT_DEV_SERVER = '1'
    const requestInsights = new RequestInsights()
    let methodReads = 0
    const init = Object.defineProperty({}, 'method', {
      enumerable: true,
      get() {
        methodReads++
        if (methodReads > 1) {
          throw new Error('method was read more than once')
        }
        return 'GET'
      },
    }) as RequestInit

    try {
      const response = await requestStore.run(
        {
          headers: new Headers(),
          requestInsightsFetchContext: {
            identity: {
              requestId: 'edge-fetch',
              htmlRequestId: 'edge-fetch',
              url: '/edge',
            },
            requestInsights,
          },
        },
        () => moduleContext.runtime.context.fetch('data:text/plain,edge', init)
      )

      expect(await response.text()).toBe('edge')
      expect(methodReads).toBe(1)
      expect(
        requestInsights
          .getSnapshot()
          .requests.find((request) => request.requestId === 'edge-fetch')
          ?.fetches
      ).toEqual([expect.objectContaining({ method: 'GET', statusCode: 200 })])
    } finally {
      requestInsights.dispose()
      if (originalDevServer === undefined) {
        delete process.env.__NEXT_DEV_SERVER
      } else {
        process.env.__NEXT_DEV_SERVER = originalDevServer
      }
    }
  })

  it('shares boxed RequestInit string coercion with fetch', async () => {
    const originalDevServer = process.env.__NEXT_DEV_SERVER
    process.env.__NEXT_DEV_SERVER = '1'
    const requestInsights = new RequestInsights()
    let methodReads = 0
    let methodCoercions = 0
    let credentialsReads = 0
    let credentialsCoercions = 0
    const init = Object.defineProperties(
      {},
      {
        credentials: {
          enumerable: true,
          get() {
            credentialsReads++
            return {
              toString() {
                credentialsCoercions++
                return 'omit'
              },
            }
          },
        },
        method: {
          enumerable: true,
          get() {
            methodReads++
            return {
              toString() {
                methodCoercions++
                return 'GET'
              },
            }
          },
        },
      }
    ) as RequestInit

    try {
      const response = await requestStore.run(
        {
          headers: new Headers(),
          requestInsightsFetchContext: {
            identity: {
              requestId: 'edge-boxed-fetch',
              htmlRequestId: 'edge-boxed-fetch',
              url: '/edge',
            },
            requestInsights,
          },
        },
        () => moduleContext.runtime.context.fetch('data:text/plain,edge', init)
      )

      expect(await response.text()).toBe('edge')
      expect(methodReads).toBe(1)
      expect(methodCoercions).toBe(1)
      expect(credentialsReads).toBe(1)
      expect(credentialsCoercions).toBe(1)
      expect(
        requestInsights
          .getSnapshot()
          .requests.find((request) => request.requestId === 'edge-boxed-fetch')
          ?.fetches
      ).toEqual([expect.objectContaining({ method: 'GET', statusCode: 200 })])
    } finally {
      requestInsights.dispose()
      if (originalDevServer === undefined) {
        delete process.env.__NEXT_DEV_SERVER
      } else {
        process.env.__NEXT_DEV_SERVER = originalDevServer
      }
    }
  })

  it('does not invoke Request Insights fetch bookkeeping without context', async () => {
    const originalDevServer = process.env.__NEXT_DEV_SERVER
    process.env.__NEXT_DEV_SERVER = '1'
    mockPrepareRequestInsightsSandboxFetch.mockClear()

    try {
      const response = await moduleContext.runtime.context.fetch(
        'data:text/plain,edge'
      )
      expect(await response.text()).toBe('edge')
      expect(mockPrepareRequestInsightsSandboxFetch).not.toHaveBeenCalled()
    } finally {
      if (originalDevServer === undefined) {
        delete process.env.__NEXT_DEV_SERVER
      } else {
        process.env.__NEXT_DEV_SERVER = originalDevServer
      }
    }
  })
})
