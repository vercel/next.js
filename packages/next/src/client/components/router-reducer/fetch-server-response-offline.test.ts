import { fetchServerResponse } from './fetch-server-response'
import { fetch as segmentCacheFetch } from '../segment-cache/fetch'

jest.mock('../segment-cache/fetch', () => ({
  fetch: jest.fn(),
}))

// Mock the offline module so the test controls connectivity state without
// touching the network or timers.
jest.mock('../offline', () => ({
  checkOfflineError: jest.fn(() => true),
  getOffline: jest.fn(() => ({})),
  waitForConnection: jest.fn(() => Promise.resolve()),
}))

// The real react-server-dom-webpack client needs Next's bundler-config aliasing
// that only exists in built apps. The Flight client reports fetch rejections
// through the response (not as unhandled rejections); emulate that here.
jest.mock('react-server-dom-webpack/client', () => ({
  createFromFetch: (promise: Promise<any>) => {
    promise.catch(() => {})
    return promise
  },
  createFromReadableStream: jest.fn(),
}))

const fetchMock = segmentCacheFetch as jest.Mock

describe('fetchServerResponse offline retry', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    process.env.__NEXT_USE_OFFLINE = '1'
  })

  afterEach(() => {
    delete process.env.__NEXT_USE_OFFLINE
  })

  const options = {
    flightRouterState: ['', {}] as any,
    nextUrl: null,
  }

  it('falls back to an MPA navigation after the retry budget is exhausted', async () => {
    // A deterministic failure that checkOfflineError misclassifies as
    // offline (e.g. a Flight decode error) must not retry forever.
    fetchMock.mockRejectedValue(new Error('deterministic failure'))

    const result = await fetchServerResponse(
      new URL('https://example.com/foo'),
      options
    )

    // 1 initial attempt + MAX_OFFLINE_RETRIES (2) retries, then the MPA
    // fallback. Before the fix, this looped forever.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result).toBe('https://example.com/foo')
  })

  it('does not retry when the offline handling is disabled', async () => {
    delete process.env.__NEXT_USE_OFFLINE
    fetchMock.mockRejectedValue(new Error('deterministic failure'))

    const result = await fetchServerResponse(
      new URL('https://example.com/foo'),
      options
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toBe('https://example.com/foo')
  })
})
