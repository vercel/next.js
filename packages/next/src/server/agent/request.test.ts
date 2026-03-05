import { resolveAgentCanonicalUrl, resolveAgentRequest } from './request'

describe('resolveAgentCanonicalUrl', () => {
  it('creates canonical URL from init url and base path', () => {
    expect(
      resolveAgentCanonicalUrl(
        'https://example.com/products/123?view=full#specs',
        '/products/123'
      )
    ).toBe('https://example.com/products/123')
  })

  it('returns undefined for invalid URLs', () => {
    expect(resolveAgentCanonicalUrl('://bad-url', '/')).toBeUndefined()
  })
})

describe('resolveAgentRequest', () => {
  it('returns 404 when requested format is not enabled', async () => {
    const result = await resolveAgentRequest({
      pageModule: { agent: 'markdown' },
      format: 'json',
      params: {},
      searchParams: {},
      isDev: false,
      getHtml: async () => '<html><body><main>ignored</main></body></html>',
    })

    expect(result).toEqual({
      statusCode: 404,
      contentType: 'text',
      payload: 'Not Found',
    })
  })

  it('defaults generateAgent-only routes to markdown mode', async () => {
    const result = await resolveAgentRequest({
      pageModule: {
        async generateAgent() {
          return {
            title: 'Product',
            summary: 'Manual output',
          }
        },
      },
      format: 'markdown',
      params: { id: '1' },
      searchParams: {},
      isDev: false,
      getHtml: async () => '<html><body><main>ignored</main></body></html>',
    })

    expect(result.statusCode).toBe(200)
    expect(result.contentType).toBe('markdown')
    expect(result.payload).toContain('# Product')
    expect(result.payload).toContain('Manual output')
  })

  it('returns 500 for generateAgent failures in production mode', async () => {
    const result = await resolveAgentRequest({
      pageModule: {
        async generateAgent() {
          throw new Error('boom')
        },
      },
      format: 'markdown',
      params: {},
      searchParams: {},
      isDev: false,
      getHtml: async () => '<html><body><main>ignored</main></body></html>',
    })

    expect(result).toEqual({
      statusCode: 500,
      contentType: 'text',
      payload: 'Internal Server Error',
    })
  })

  it('rethrows generateAgent failures in development mode', async () => {
    await expect(
      resolveAgentRequest({
        pageModule: {
          async generateAgent() {
            throw new Error('boom')
          },
        },
        format: 'markdown',
        params: {},
        searchParams: {},
        isDev: true,
        getHtml: async () => '<html><body><main>ignored</main></body></html>',
      })
    ).rejects.toThrow('boom')
  })

  it('auto-converts HTML and injects canonical url for JSON output', async () => {
    const result = await resolveAgentRequest({
      pageModule: { agent: 'all' },
      format: 'json',
      params: {},
      searchParams: {},
      canonicalUrl: 'https://example.com/docs',
      fallbackTitle: '/docs',
      isDev: false,
      getHtml: async () =>
        '<html><head><title>Docs</title></head><body><main><p>Hello agent world with enough content to be meaningful.</p></main></body></html>',
    })

    expect(result.statusCode).toBe(200)
    expect(result.contentType).toBe('json')

    const parsed = JSON.parse(result.payload)
    expect(parsed.title).toBe('Docs')
    expect(parsed.canonicalUrl).toBe('https://example.com/docs')
    expect(parsed.sections?.[0]?.content).toContain('Hello agent world')
  })
})
