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

jest.mock('react-server-dom-webpack/client', () => ({
  createFromFetch: jest.fn(),
  createFromReadableStream: (...args: Array<unknown>) =>
    mockCreateFromReadableStream(...args),
}))

jest.mock('../../output-export-fallback', () => ({
  fetchOutputExportFallbackResponse: (...args: Array<unknown>) =>
    mockFetchOutputExportFallbackResponse(...args),
  fetchOutputExportNotFoundDataResponse: (...args: Array<unknown>) =>
    mockFetchOutputExportNotFoundDataResponse(...args),
  fetchOutputExportNotFoundResponse: (...args: Array<unknown>) =>
    mockFetchOutputExportNotFoundResponse(...args),
}))

function withResponseUrl(response: Response, url: string): Response {
  Object.defineProperty(response, 'url', { value: url })
  Object.defineProperty(response, 'redirected', { value: false })
  return response
}

function createFallbackNavigationFlightResponse({
  buildId = 'build-id',
}: {
  buildId?: string | null
} = {}): NavigationFlightResponse {
  const response: NavigationFlightResponse = {
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
  if (buildId !== null) {
    response.b = buildId
  }
  return response
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
    mockFetchOutputExportNotFoundDataResponse.mockResolvedValue(null)
    mockFetchOutputExportNotFoundResponse.mockResolvedValue({
      response: withResponseUrl(
        new Response('not found payload', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
        `${global.location.origin}/_not-found.txt`
      ),
      renderedUrl: new URL('/_not-found', global.location.origin),
      fallbackUrl: new URL('/_not-found', global.location.origin),
    })
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
    }
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(mockFetchOutputExportFallbackResponse).toHaveBeenCalledTimes(1)
  })

  it('allows static fallback artifacts without serialized build ids', async () => {
    const origin = global.location.origin
    setNavigationBuildId('deployment-id')
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
      `${origin}/another/__fallback.txt`
    )

    global.fetch = jest.fn(async () => initialMiss) as typeof fetch
    mockFetchOutputExportFallbackResponse.mockResolvedValue({
      response: fallbackResponse,
      renderedUrl: new URL('/another/third', origin),
      fallbackUrl: new URL('/another/__fallback', origin),
    })
    mockCreateFromReadableStream.mockResolvedValue(
      createFallbackNavigationFlightResponse({ buildId: null })
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
    }
  })

  it('rejects fallback artifacts with explicit build id mismatches', async () => {
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
      `${origin}/another/__fallback.txt`
    )

    global.fetch = jest.fn(async () => initialMiss) as typeof fetch
    mockFetchOutputExportFallbackResponse.mockResolvedValue({
      response: fallbackResponse,
      renderedUrl: new URL('/another/third', origin),
      fallbackUrl: new URL('/another/__fallback', origin),
    })
    mockCreateFromReadableStream.mockResolvedValue(
      createFallbackNavigationFlightResponse({ buildId: 'different-build-id' })
    )

    const result = await fetchServerResponse(
      new URL('/another/third', origin),
      {
        flightRouterState: ['', {}, null, null],
        nextUrl: null,
      }
    )

    expect(result).toBe(`${origin}/another/third`)
  })

  it('validates fallback route shapes before reusing them', async () => {
    const origin = global.location.origin
    const initialMiss = withResponseUrl(
      new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      }),
      `${origin}/another/third/extra.txt`
    )
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

    global.fetch = jest.fn(async () => initialMiss) as typeof fetch
    mockFetchOutputExportFallbackResponse.mockResolvedValue({
      response: fallbackResponse,
      renderedUrl: new URL('/another/third/extra', origin),
      fallbackUrl: new URL('/another/__fallback', origin),
    })
    mockFetchOutputExportNotFoundDataResponse.mockResolvedValue({
      response: notFoundResponse,
      renderedUrl: new URL('/another/third/extra', origin),
      fallbackUrl: new URL('/_not-found', origin),
    })
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
    }
    expect(mockFetchOutputExportNotFoundDataResponse).toHaveBeenCalledTimes(1)
  })
})
