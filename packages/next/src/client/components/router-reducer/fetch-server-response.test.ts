/**
 * @jest-environment node
 */

import type { NavigationFlightResponse } from '../../../shared/lib/app-router-types'
import { setNavigationBuildId } from '../../navigation-build-id'
import { fetchServerResponse } from './fetch-server-response'

const mockCreateFromReadableStream = jest.fn()
const mockFetchOutputExportFallbackResponse = jest.fn()
const mockGetCachedOutputExportFallbackRequestUrl = jest.fn()

jest.mock('react-server-dom-webpack/client', () => ({
  createFromFetch: jest.fn(),
  createFromReadableStream: (...args: Array<unknown>) =>
    mockCreateFromReadableStream(...args),
}))

jest.mock('../../output-export-fallback', () => ({
  fetchOutputExportFallbackResponse: (...args: Array<unknown>) =>
    mockFetchOutputExportFallbackResponse(...args),
  getCachedOutputExportFallbackRequestUrl: (...args: Array<unknown>) =>
    mockGetCachedOutputExportFallbackRequestUrl(...args),
}))

function withResponseUrl(response: Response, url: string): Response {
  Object.defineProperty(response, 'url', { value: url })
  Object.defineProperty(response, 'redirected', { value: false })
  return response
}

describe('fetchServerResponse output export fallback', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalOutput = process.env.__NEXT_CONFIG_OUTPUT
  const originalFetch = global.fetch
  const originalLocation = global.location
  const processEnv = process.env as Record<string, string | undefined>

  beforeEach(() => {
    processEnv.NODE_ENV = 'production'
    processEnv.__NEXT_CONFIG_OUTPUT = 'export'
    global.location = new URL('https://example.com/') as unknown as Location
    setNavigationBuildId('build-id')
    mockCreateFromReadableStream.mockReset()
    mockFetchOutputExportFallbackResponse.mockReset()
    mockGetCachedOutputExportFallbackRequestUrl.mockReset()
    mockGetCachedOutputExportFallbackRequestUrl.mockReturnValue(null)
  })

  afterEach(() => {
    processEnv.NODE_ENV = originalNodeEnv
    processEnv.__NEXT_CONFIG_OUTPUT = originalOutput
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
    mockCreateFromReadableStream.mockResolvedValue({
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
    } satisfies NavigationFlightResponse)

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
})
