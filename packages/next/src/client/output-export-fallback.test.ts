import {
  addOutputExportDataSuffix,
  fetchOutputExportDataResponse,
  fetchOutputExportFallbackResponse,
  getOutputExportFallbackCandidates,
  stripOutputExportDataSuffix,
} from './output-export-fallback'

describe('output export fallback helpers', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('discovers fallback candidates from shallowest static prefix to root', () => {
    expect(getOutputExportFallbackCandidates('/org/acme/chat/123')).toEqual([
      '/org/__fallback',
      '/org/acme/__fallback',
      '/org/acme/chat/__fallback',
      '/org/acme/chat/123/__fallback',
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

  it('walks prefixes from the root until a fallback payload is found', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/org/__fallback.txt')) {
        return new Response('payload', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      }

      if (url.endsWith('/org/__fallback/index.txt')) {
        return new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/html' },
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
      'https://example.com/org/__fallback.meta.json',
      'https://example.com/org/__fallback.txt',
    ])
  })

  it('uses fallback metadata to select the most specific conflicting route', async () => {
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
      'https://example.com/docs/__fallback.meta.json',
      'https://example.com/docs/__fallback/__route_0.txt',
    ])
  })
})
