import {
  addOutputExportDataSuffix,
  fetchOutputExportDataResponse,
  fetchOutputExportFallbackResponse,
  getOutputExportFallbackCandidates,
} from './output-export-fallback'

describe('output export fallback helpers', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('discovers fallback candidates from deepest static prefix to root', () => {
    expect(getOutputExportFallbackCandidates('/org/acme/chat/123')).toEqual([
      '/org/acme/chat/__fallback',
      '/org/acme/__fallback',
      '/org/__fallback',
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

  it('walks parent prefixes until a fallback payload is found', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/org/acme/chat/__fallback.txt')) {
        return new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        })
      }

      if (url.endsWith('/org/acme/chat/__fallback/index.txt')) {
        return new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        })
      }

      if (url.endsWith('/org/acme/__fallback.txt')) {
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
      'https://example.com/org/acme/chat/__fallback.txt',
      'https://example.com/org/acme/chat/__fallback/index.txt',
      'https://example.com/org/acme/__fallback.txt',
    ])
  })
})
