import { fetchRouteOnCacheMiss } from 'next/dist/client/components/segment-cache/cache'

describe('segment cache response body cancellation', () => {
  const originalFetch = global.fetch
  const originalLocation = global.location

  beforeAll(() => {
    // @ts-ignore
    delete global.location
    // @ts-ignore
    global.location = new URL('http://localhost:3000')
  })

  afterAll(() => {
    global.fetch = originalFetch
    global.location = originalLocation
  })

  it('cancels response.body when prefetch receives an error response (e.g. 404 or 500)', async () => {
    const mockCancel = jest.fn().mockResolvedValue(undefined)
    const mockBody = {
      cancel: mockCancel,
    } as unknown as ReadableStream

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({
        'content-type': 'text/x-component',
      }),
      body: mockBody,
      url: 'http://localhost:3000/dead-link',
      redirected: false,
    })

    const entry = {
      canonicalUrl: null,
      status: 0,
      blockedTasks: null,
      root: null,
      couldBeIntercepted: true,
      supportsPerSegmentPrefetching: false,
      predictedFrom: null,
      renderedSearch: null,
      ref: null,
      size: 0,
      staleAt: Infinity,
      version: 0,
    } as any

    const key = {
      pathname: '/dead-link',
      search: '',
      nextUrl: null,
    }

    const result = await fetchRouteOnCacheMiss(entry, key)
    expect(result).toBeNull()
    expect(mockCancel).toHaveBeenCalledTimes(1)
  })

  it('cancels response.body when prefetch receives an invalid/non-flight content-type', async () => {
    const mockCancel = jest.fn().mockResolvedValue(undefined)
    const mockBody = {
      cancel: mockCancel,
    } as unknown as ReadableStream

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'text/html',
      }),
      body: mockBody,
      url: 'http://localhost:3000/html-page',
      redirected: false,
    })

    const entry = {
      canonicalUrl: null,
      status: 0,
      blockedTasks: null,
      root: null,
      couldBeIntercepted: true,
      supportsPerSegmentPrefetching: false,
      predictedFrom: null,
      renderedSearch: null,
      ref: null,
      size: 0,
      staleAt: Infinity,
      version: 0,
    } as any

    const key = {
      pathname: '/html-page',
      search: '',
      nextUrl: null,
    }

    const result = await fetchRouteOnCacheMiss(entry, key)
    expect(result).toBeNull()
    expect(mockCancel).toHaveBeenCalledTimes(1)
  })

  it('handles response without body gracefully without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      body: null,
      url: 'http://localhost:3000/no-body',
      redirected: false,
    })

    const entry = {
      canonicalUrl: null,
      status: 0,
      blockedTasks: null,
      root: null,
      couldBeIntercepted: true,
      supportsPerSegmentPrefetching: false,
      predictedFrom: null,
      renderedSearch: null,
      ref: null,
      size: 0,
      staleAt: Infinity,
      version: 0,
    } as any

    const key = {
      pathname: '/no-body',
      search: '',
      nextUrl: null,
    }

    const result = await fetchRouteOnCacheMiss(entry, key)
    expect(result).toBeNull()
  })
})
