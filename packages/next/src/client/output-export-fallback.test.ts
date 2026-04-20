import {
  addOutputExportDataSuffix,
  clearOutputExportFallbackManifestCache,
  fetchOutputExportDataResponse,
  fetchOutputExportFallbackResponse,
  getCachedOutputExportFallbackDataUrl,
  getCachedOutputExportFallbackRequestUrl,
  getOutputExportFallbackCandidates,
  stripOutputExportDataSuffix,
} from './output-export-fallback'

describe('output export fallback helpers', () => {
  const originalFetch = global.fetch
  const originalBasePath = process.env.__NEXT_ROUTER_BASEPATH
  const originalTrailingSlash = process.env.__NEXT_TRAILING_SLASH

  afterEach(() => {
    global.fetch = originalFetch
    process.env.__NEXT_ROUTER_BASEPATH = originalBasePath
    process.env.__NEXT_TRAILING_SLASH = originalTrailingSlash
    clearOutputExportFallbackManifestCache()
    jest.restoreAllMocks()
  })

  it('discovers fallback candidates from deepest static prefix to root', () => {
    expect(getOutputExportFallbackCandidates('/org/acme/chat/123')).toEqual([
      '/org/acme/chat/123/__fallback',
      '/org/acme/chat/__fallback',
      '/org/acme/__fallback',
      '/org/__fallback',
      '/__fallback',
    ])
  })

  it('includes the current pathname for optional catch-all root matches', () => {
    expect(getOutputExportFallbackCandidates('/optional/')).toEqual([
      '/optional/__fallback',
      '/__fallback',
    ])
  })

  it('adds the export data suffix for flat and trailing slash routes', () => {
    expect(
      addOutputExportDataSuffix(new URL('https://example.com/blog/post')).href
    ).toBe('https://example.com/blog/post.txt')

    expect(
      addOutputExportDataSuffix(new URL('https://example.com/blog/post/')).href
    ).toBe('https://example.com/blog/post/index.txt')
  })

  it('strips the export data suffix back to the fallback document path', () => {
    expect(
      stripOutputExportDataSuffix(
        new URL('https://example.com/blog/post/index.txt')
      ).href
    ).toBe('https://example.com/blog/post')

    expect(
      stripOutputExportDataSuffix(new URL('https://example.com/blog/post.txt'))
        .href
    ).toBe('https://example.com/blog/post.html')

    expect(
      stripOutputExportDataSuffix(new URL('https://example.com/index.txt')).href
    ).toBe('https://example.com/')
  })

  it('tries both flat and trailing-slash data files', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/blog/post.txt')) {
        return new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        })
      }

      return new Response('payload', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    })

    global.fetch = fetchMock as typeof fetch

    const response = await fetchOutputExportDataResponse(
      new URL('https://example.com/blog/post')
    )

    expect(response).not.toBeNull()
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.com/blog/post.txt',
      'https://example.com/blog/post/index.txt',
    ])
  })

  it('tries the direct fallback artifact before manifest lookups', async () => {
    process.env.__NEXT_TRAILING_SLASH = 'false'
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/org/acme/chat/123/__fallback.txt')) {
        return new Response('payload', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      }

      return new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      })
    })

    global.fetch = fetchMock as typeof fetch

    const renderedUrl = new URL('https://example.com/org/acme/chat/123')
    const result = await fetchOutputExportFallbackResponse(renderedUrl)

    expect(result).not.toBeNull()
    expect(result?.renderedUrl.href).toBe(renderedUrl.href)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.com/org/acme/chat/123/__fallback.txt',
    ])
  })

  it('falls through deeper prefixes before using a shallower fallback artifact', async () => {
    process.env.__NEXT_TRAILING_SLASH = 'false'
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/docs/guides/export/__fallback.txt')) {
        return new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        })
      }

      if (url.endsWith('/docs/guides/export/__fallback.meta.json')) {
        return new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        })
      }

      if (url.endsWith('/docs/guides/__fallback.txt')) {
        return new Response('payload', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      }

      return new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      })
    })

    global.fetch = fetchMock as typeof fetch

    const renderedUrl = new URL('https://example.com/docs/guides/export')
    const result = await fetchOutputExportFallbackResponse(renderedUrl)

    expect(result).not.toBeNull()
    expect(result?.renderedUrl.href).toBe(renderedUrl.href)
    expect(result?.fallbackUrl.pathname).toBe('/docs/guides/__fallback')
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.com/docs/guides/export/__fallback.txt',
      'https://example.com/docs/guides/export/__fallback.meta.json',
      'https://example.com/docs/guides/__fallback.txt',
    ])
  })

  it('prefers the trailing-slash fallback artifact when the request URL ends with /', async () => {
    delete process.env.__NEXT_TRAILING_SLASH

    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/org/umbrella/chat/thread-789/__fallback/index.txt')) {
        return new Response('flight', {
          status: 200,
          headers: { 'content-type': 'text/x-component' },
        })
      }

      return new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      })
    })

    global.fetch = fetchMock as typeof fetch

    const renderedUrl = new URL(
      'https://example.com/org/umbrella/chat/thread-789/'
    )
    const result = await fetchOutputExportFallbackResponse(renderedUrl)

    expect(result).not.toBeNull()
    expect(result?.renderedUrl.href).toBe(renderedUrl.href)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.com/org/umbrella/chat/thread-789/__fallback/index.txt',
    ])
  })

  it('uses fallback metadata to select the most specific conflicting route', async () => {
    process.env.__NEXT_TRAILING_SLASH = 'false'
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/docs/__fallback.txt')) {
        return new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        })
      }

      if (url.endsWith('/docs/__fallback.meta.json')) {
        return new Response(
          JSON.stringify({
            version: 1,
            routes: [
              {
                route: '/docs/[section]/[page]',
                fallbackPath: '/docs/__fallback/__route_0',
              },
              {
                route: '/docs/[...slug]',
                fallbackPath: '/docs/__fallback/__route_1',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      }

      if (url.endsWith('/docs/__fallback/__route_0.txt')) {
        return new Response('payload', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      }

      return new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      })
    })

    global.fetch = fetchMock as typeof fetch

    const renderedUrl = new URL('https://example.com/docs/api/reference')
    const result = await fetchOutputExportFallbackResponse(renderedUrl)

    expect(result).not.toBeNull()
    expect(result?.fallbackUrl.pathname).toBe('/docs/__fallback/__route_0')
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.com/docs/api/reference/__fallback.txt',
      'https://example.com/docs/api/reference/__fallback.meta.json',
      'https://example.com/docs/api/__fallback.txt',
      'https://example.com/docs/api/__fallback.meta.json',
      'https://example.com/docs/__fallback.txt',
      'https://example.com/docs/__fallback.meta.json',
      'https://example.com/docs/__fallback/__route_0.txt',
    ])
  })

  it('matches and fetches conflicting fallback branches under basePath', async () => {
    process.env.__NEXT_ROUTER_BASEPATH = '/base'

    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/base/docs/__fallback.meta.json')) {
        return new Response(
          JSON.stringify({
            version: 1,
            routes: [
              {
                route: '/docs/[section]/[page]',
                fallbackPath: '/docs/__fallback/__route_0',
              },
              {
                route: '/docs/[...slug]',
                fallbackPath: '/docs/__fallback/__route_1',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      }

      if (url.endsWith('/base/docs/__fallback/__route_0.txt')) {
        return new Response('payload', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      }

      return new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      })
    })

    global.fetch = fetchMock as typeof fetch

    const renderedUrl = new URL('https://example.com/base/docs/api/reference')
    const result = await fetchOutputExportFallbackResponse(renderedUrl)

    expect(result).not.toBeNull()
    expect(result?.fallbackUrl.pathname).toBe('/base/docs/__fallback/__route_0')
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.com/base/docs/api/reference/__fallback.txt',
      'https://example.com/base/docs/api/reference/__fallback.meta.json',
      'https://example.com/base/docs/api/__fallback.txt',
      'https://example.com/base/docs/api/__fallback.meta.json',
      'https://example.com/base/docs/__fallback.txt',
      'https://example.com/base/docs/__fallback.meta.json',
      'https://example.com/base/docs/__fallback/__route_0.txt',
    ])
  })

  it('caches the resolved fallback data URL for later RSC fetches', async () => {
    process.env.__NEXT_TRAILING_SLASH = 'false'
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/docs/__fallback.meta.json')) {
        return new Response(
          JSON.stringify({
            version: 1,
            routes: [
              {
                route: '/docs/[section]/[page]',
                fallbackPath: '/docs/__fallback/__route_0',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      }

      if (url.endsWith('/docs/__fallback/__route_0.txt')) {
        return new Response('payload', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      }

      return new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      })
    })

    global.fetch = fetchMock as typeof fetch

    const renderedUrl = new URL('https://example.com/docs/api/reference')
    await fetchOutputExportFallbackResponse(renderedUrl)

    expect(
      getCachedOutputExportFallbackDataUrl(
        new URL('https://example.com/docs/api/reference.txt')
      )?.href
    ).toBe('https://example.com/docs/__fallback/__route_0.txt')
    expect(
      getCachedOutputExportFallbackDataUrl(
        new URL('https://example.com/docs/api/reference/index.txt')
      )?.href
    ).toBe('https://example.com/docs/__fallback/__route_0.txt')
    expect(
      getCachedOutputExportFallbackRequestUrl(
        new URL('https://example.com/docs/api/reference/__next._head.txt')
      )?.href
    ).toBe('https://example.com/docs/__fallback/__route_0/__next._head.txt')
    expect(
      getCachedOutputExportFallbackRequestUrl(
        new URL(
          'https://example.com/docs/api/reference/__next.docs.$d$section.$d$page.txt'
        )
      )?.href
    ).toBe(
      'https://example.com/docs/__fallback/__route_0/__next.docs.$d$section.$d$page.txt'
    )
  })

  it('dedupes fallback artifact fetches across sibling routes', async () => {
    process.env.__NEXT_TRAILING_SLASH = 'false'
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/docs/__fallback.txt')) {
        return new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        })
      }

      if (url.endsWith('/docs/__fallback.meta.json')) {
        return new Response(
          JSON.stringify({
            version: 1,
            routes: [
              {
                route: '/docs/[section]/[page]',
                fallbackPath: '/docs/__fallback/__route_0',
              },
              {
                route: '/docs/[...slug]',
                fallbackPath: '/docs/__fallback/__route_1',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      }

      if (url.endsWith('/docs/__fallback/__route_0.txt')) {
        return new Response('payload', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      }

      return new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      })
    })

    global.fetch = fetchMock as typeof fetch

    await fetchOutputExportFallbackResponse(
      new URL('https://example.com/docs/api/reference')
    )
    await fetchOutputExportFallbackResponse(
      new URL('https://example.com/docs/api/guide')
    )

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.com/docs/api/reference/__fallback.txt',
      'https://example.com/docs/api/reference/__fallback.meta.json',
      'https://example.com/docs/api/__fallback.txt',
      'https://example.com/docs/api/__fallback.meta.json',
      'https://example.com/docs/__fallback.txt',
      'https://example.com/docs/__fallback.meta.json',
      'https://example.com/docs/__fallback/__route_0.txt',
      'https://example.com/docs/api/guide/__fallback.txt',
      'https://example.com/docs/api/guide/__fallback.meta.json',
    ])
  })
})
