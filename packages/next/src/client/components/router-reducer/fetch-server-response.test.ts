/**
 * @jest-environment node
 */

import type { NavigationFlightResponse } from '../../../shared/lib/app-router-types'
import { setNavigationBuildId } from '../../navigation-build-id'
import { fetchServerResponse } from './fetch-server-response'

const mockCreateFromReadableStream = jest.fn()
const mockFetchOutputExportFallbackResponse = jest.fn()
const mockFetchOutputExportNotFoundDataResponse = jest.fn()
const mockFetchOutputExportNotFoundResponse = jest.fn()
const mockGetCachedOutputExportFallbackBasePath = jest.fn()
const mockGetCachedOutputExportFallbackRequestUrl = jest.fn()
const mockGetConfiguredOutputExportNotFoundCandidate = jest.fn()

jest.mock('react-server-dom-webpack/client', () => ({
  createFromFetch: jest.fn(),
  createFromReadableStream: (...args: Array<unknown>) =>
    mockCreateFromReadableStream(...args),
}))

jest.mock('../../output-export-fallback', () => ({
  addOutputExportDataSuffix: (url: URL) => {
    const nextUrl = new URL(url)
    nextUrl.pathname = nextUrl.pathname.endsWith('/')
      ? `${nextUrl.pathname}index.txt`
      : `${nextUrl.pathname}.txt`
    return nextUrl
  },
  fetchOutputExportFallbackResponse: (...args: Array<unknown>) =>
    mockFetchOutputExportFallbackResponse(...args),
  fetchOutputExportNotFoundDataResponse: (...args: Array<unknown>) =>
    mockFetchOutputExportNotFoundDataResponse(...args),
  fetchOutputExportNotFoundResponse: (...args: Array<unknown>) =>
    mockFetchOutputExportNotFoundResponse(...args),
  getCachedOutputExportFallbackBasePath: (...args: Array<unknown>) =>
    mockGetCachedOutputExportFallbackBasePath(...args),
  getCachedOutputExportFallbackRequestUrl: (...args: Array<unknown>) =>
    mockGetCachedOutputExportFallbackRequestUrl(...args),
  getConfiguredOutputExportNotFoundCandidate: (...args: Array<unknown>) =>
    mockGetConfiguredOutputExportNotFoundCandidate(...args),
}))

function withResponseUrl(response: Response, url: string): Response {
  Object.defineProperty(response, 'url', { value: url })
  Object.defineProperty(response, 'redirected', { value: false })
  return response
}

function createFallbackNavigationFlightResponse(): NavigationFlightResponse {
  return {
    b: 'build-id',
    f: [
      [
        'children',
        'another',
        'children',
        ['slug', '%%drp:slug:abc123%%', 'd', null],
        [
          '',
          {
            children: [
              'another',
              {
                children: [['slug', '%%drp:slug:abc123%%', 'd', null], {}],
              },
            ],
          },
        ],
        null,
        null,
        false,
      ],
    ],
    S: false,
    q: '',
    i: false,
    h: null,
  }
}

function createNotFoundNavigationFlightResponse(): NavigationFlightResponse {
  return {
    b: 'build-id',
    f: [
      [
        'children',
        '/_not-found',
        ['', { children: ['/_not-found', {}] }],
        null,
        null,
        false,
      ],
    ],
    S: false,
    q: '',
    i: false,
    h: null,
  }
}

describe('fetchServerResponse output export fallback', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalOutput = process.env.__NEXT_CONFIG_OUTPUT
  const originalOutputExportDynamicFallbacks =
    process.env.__NEXT_OUTPUT_EXPORT_DYNAMIC_FALLBACKS
  const originalFetch = global.fetch
  const originalLocation = global.location
  const processEnv = process.env as Record<string, string | undefined>

  beforeEach(() => {
    processEnv.NODE_ENV = 'production'
    processEnv.__NEXT_CONFIG_OUTPUT = 'export'
    processEnv.__NEXT_OUTPUT_EXPORT_DYNAMIC_FALLBACKS = 'true'
    global.location = new URL('https://example.com/') as unknown as Location
    setNavigationBuildId('build-id')
    mockCreateFromReadableStream.mockReset()
    mockFetchOutputExportFallbackResponse.mockReset()
    mockFetchOutputExportNotFoundDataResponse.mockReset()
    mockFetchOutputExportNotFoundResponse.mockReset()
    mockGetCachedOutputExportFallbackBasePath.mockReset()
    mockGetCachedOutputExportFallbackRequestUrl.mockReset()
    mockGetConfiguredOutputExportNotFoundCandidate.mockReset()
    mockGetCachedOutputExportFallbackBasePath.mockReturnValue(null)
    mockGetCachedOutputExportFallbackRequestUrl.mockReturnValue(null)
    mockFetchOutputExportNotFoundDataResponse.mockResolvedValue(null)
    mockFetchOutputExportNotFoundResponse.mockResolvedValue(
      withResponseUrl(
        new Response('not found payload', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
        `${global.location.origin}/_not-found.txt`
      )
    )
    mockGetConfiguredOutputExportNotFoundCandidate.mockReturnValue(
      '/_not-found'
    )
  })

  afterEach(() => {
    processEnv.NODE_ENV = originalNodeEnv
    processEnv.__NEXT_CONFIG_OUTPUT = originalOutput
    if (originalOutputExportDynamicFallbacks === undefined) {
      delete processEnv.__NEXT_OUTPUT_EXPORT_DYNAMIC_FALLBACKS
    } else {
      processEnv.__NEXT_OUTPUT_EXPORT_DYNAMIC_FALLBACKS =
        originalOutputExportDynamicFallbacks
    }
    global.fetch = originalFetch
    global.location = originalLocation
    jest.restoreAllMocks()
  })

  it('reuses the discovered fallback response instead of fetching it again', async () => {
    const origin = global.location.origin
    const initialMiss = withResponseUrl(
      new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      }),
      `${origin}/another/third.txt`
    )
    const fallbackResponse = withResponseUrl(
      new Response('fallback payload', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
      `${origin}/another/__fallback/index.txt`
    )

    global.fetch = jest
      .fn(async () => initialMiss)
      .mockImplementationOnce(async () => initialMiss)
      .mockImplementation(async () => {
        throw new Error('unexpected extra fetch')
      }) as typeof fetch

    mockFetchOutputExportFallbackResponse.mockResolvedValue({
      response: fallbackResponse,
      renderedUrl: new URL('/another/third', origin),
      fallbackUrl: new URL('/another/__fallback', origin),
    })
    mockCreateFromReadableStream.mockResolvedValue(
      createFallbackNavigationFlightResponse()
    )

    const result = await fetchServerResponse(
      new URL('/another/third', origin),
      {
        flightRouterState: ['', {}, null, null],
        nextUrl: null,
      }
    )

    expect(typeof result).not.toBe('string')
    if (typeof result !== 'string') {
      expect(result.canonicalUrl.href).toBe(`${origin}/another/third`)
      expect(result.outputExportFallbackBasePath).toBe('/another/__fallback')
    }
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(mockFetchOutputExportFallbackResponse).toHaveBeenCalledTimes(1)
  })

  it('routes cached fallback requests explicitly through fetchServerResponse', async () => {
    const origin = global.location.origin
    const fallbackResponse = withResponseUrl(
      new Response('fallback payload', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
      `${origin}/another/__fallback.txt`
    )
    const fallbackRequestUrl = new URL('/another/__fallback.txt', origin)

    global.fetch = jest.fn(async () => fallbackResponse) as typeof fetch
    mockGetCachedOutputExportFallbackRequestUrl.mockReturnValue(
      fallbackRequestUrl
    )
    mockGetCachedOutputExportFallbackBasePath.mockReturnValue(
      '/another/__fallback'
    )
    mockCreateFromReadableStream.mockResolvedValue(
      createFallbackNavigationFlightResponse()
    )

    const result = await fetchServerResponse(
      new URL('/another/third', origin),
      {
        flightRouterState: ['', {}, null, null],
        nextUrl: null,
      }
    )

    expect(typeof result).not.toBe('string')
    if (typeof result !== 'string') {
      expect(result.canonicalUrl.href).toBe(`${origin}/another/third`)
      expect(result.outputExportFallbackBasePath).toBe('/another/__fallback')
    }
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain(
      '/another/__fallback.txt?'
    )
    expect(mockFetchOutputExportFallbackResponse).not.toHaveBeenCalled()
  })

  it('validates cached fallback requests before reusing them', async () => {
    const origin = global.location.origin
    const fallbackResponse = withResponseUrl(
      new Response('fallback payload', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
      `${origin}/another/__fallback.txt`
    )
    const notFoundResponse = withResponseUrl(
      new Response('not found payload', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
      `${origin}/_not-found.txt`
    )
    const fallbackRequestUrl = new URL('/another/__fallback.txt', origin)

    global.fetch = jest.fn(async () => fallbackResponse) as typeof fetch
    mockGetCachedOutputExportFallbackRequestUrl.mockReturnValue(
      fallbackRequestUrl
    )
    mockGetCachedOutputExportFallbackBasePath
      .mockReturnValueOnce('/another/__fallback')
      .mockReturnValueOnce('/_not-found')
    mockFetchOutputExportNotFoundDataResponse.mockResolvedValue(
      notFoundResponse
    )
    mockCreateFromReadableStream
      .mockResolvedValueOnce(createFallbackNavigationFlightResponse())
      .mockResolvedValueOnce(createNotFoundNavigationFlightResponse())

    const result = await fetchServerResponse(
      new URL('/another/third/extra', origin),
      {
        flightRouterState: ['', {}, null, null],
        nextUrl: null,
      }
    )

    expect(typeof result).not.toBe('string')
    if (typeof result !== 'string') {
      expect(result.canonicalUrl.href).toBe(`${origin}/another/third/extra`)
      expect(result.outputExportFallbackBasePath).toBe('/_not-found')
    }
    expect(mockFetchOutputExportNotFoundDataResponse).toHaveBeenCalledTimes(1)
  })
})
