import { isNextRouterError } from '../../client/components/is-next-router-error'
import { notFound } from '../../client/components/not-found'
import { redirect } from '../../client/components/redirect'
import {
  negotiateAgentFormat,
  resolveAgentCanonicalUrl,
  resolveAgentRequest,
} from './request'

describe('resolveAgentCanonicalUrl', () => {
  it('creates canonical URL from init url by stripping search and hash', () => {
    expect(
      resolveAgentCanonicalUrl(
        'https://example.com/products/123?view=full#specs'
      )
    ).toBe('https://example.com/products/123')
  })

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

describe('negotiateAgentFormat', () => {
  it('prefers markdown when it outranks html', () => {
    expect(negotiateAgentFormat('text/markdown', 'html')).toBe('markdown')
    expect(
      negotiateAgentFormat('text/markdown;q=1, text/html;q=0.5', 'html')
    ).toBe('markdown')
  })

  it('prefers json when it outranks html', () => {
    expect(negotiateAgentFormat('application/json', 'html')).toBe('json')
  })

  it('keeps the default representation when it ties or wins', () => {
    expect(negotiateAgentFormat('text/html, text/markdown', 'html')).toBeNull()
    expect(
      negotiateAgentFormat('application/json;q=1, text/*;q=1', 'html')
    ).toBeNull()
  })

  it('ignores broad wildcards when no explicit agent format is requested', () => {
    expect(negotiateAgentFormat('*/*', 'html')).toBeNull()
    expect(negotiateAgentFormat('text/*', 'html')).toBeNull()
  })

  it('breaks equal agent ties in favor of json', () => {
    expect(
      negotiateAgentFormat('application/json;q=1, text/markdown;q=1', 'html')
    ).toBe('json')
  })
})

describe('resolveAgentRequest', () => {
  it('returns 406 when requested format is not enabled', async () => {
    const result = await resolveAgentRequest({
      pageModule: { agent: 'markdown' },
      format: 'json',
      params: {},
      searchParams: {},
      isDev: false,
      getHtml: async () => '<html><body><main>ignored</main></body></html>',
    })

    expect(result).toEqual({
      statusCode: 406,
      contentType: 'text',
      payload: 'Not Acceptable',
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

  it('rethrows redirect errors from generateAgent in production mode', async () => {
    let caught: unknown

    try {
      await resolveAgentRequest({
        pageModule: {
          async generateAgent() {
            redirect('/docs')
          },
        },
        format: 'markdown',
        params: {},
        searchParams: {},
        isDev: false,
        getHtml: async () => '<html><body><main>ignored</main></body></html>',
      })
    } catch (error) {
      caught = error
    }

    expect(isNextRouterError(caught)).toBe(true)
  })

  it('rethrows notFound errors from generateAgent in production mode', async () => {
    let caught: unknown

    try {
      await resolveAgentRequest({
        pageModule: {
          async generateAgent() {
            notFound()
          },
        },
        format: 'markdown',
        params: {},
        searchParams: {},
        isDev: false,
        getHtml: async () => '<html><body><main>ignored</main></body></html>',
      })
    } catch (error) {
      caught = error
    }

    expect(isNextRouterError(caught)).toBe(true)
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
