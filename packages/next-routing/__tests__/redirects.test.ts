import { resolveRoutes } from '../src/resolve-routes'
import type { ResolveRoutesParams } from '../src/types'

function createReadableStream(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.close()
    },
  })
}

function createBaseParams(
  overrides: Partial<ResolveRoutesParams> = {}
): ResolveRoutesParams {
  return {
    url: new URL('https://example.com/'),
    basePath: '',
    requestBody: createReadableStream(),
    headers: new Headers(),
    pathnames: [],
    routes: {
      beforeMiddleware: [],
      beforeFiles: [],
      afterFiles: [],
      dynamicRoutes: [],
      onMatch: [],
      fallback: [],
    },
    invokeMiddleware: async () => ({}),
    ...overrides,
  }
}

describe('Redirects with Location header', () => {
  it('should handle 301 permanent redirect', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/old'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/old$',
            destination: '/new',
            status: 301,
            headers: {
              Location: '/new',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.status).toBe(301)
    expect(result.redirect?.url.pathname).toBe('/new')
    expect(result.matchedPathname).toBeUndefined()
    expect(result.externalRewrite).toBeUndefined()
  })

  it('should handle 302 temporary redirect', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/temp'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/temp$',
            destination: '/temporary',
            status: 302,
            headers: {
              Location: '/temporary',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.status).toBe(302)
    expect(result.redirect?.url.pathname).toBe('/temporary')
  })

  it('should handle 307 temporary redirect', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/api/v1'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/api/v1$',
            destination: '/api/v2',
            status: 307,
            headers: {
              Location: '/api/v2',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.status).toBe(307)
    expect(result.redirect?.url.pathname).toBe('/api/v2')
  })

  it('should handle 308 permanent redirect', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/legacy'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/legacy$',
            destination: '/modern',
            status: 308,
            headers: {
              Location: '/modern',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.status).toBe(308)
    expect(result.redirect?.url.pathname).toBe('/modern')
  })

  it('should handle external redirect with Location header', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/external'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/external$',
            destination: 'https://newdomain.com/page',
            status: 301,
            headers: {
              Location: 'https://newdomain.com/page',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.status).toBe(301)
    expect(result.redirect?.url.toString()).toBe('https://newdomain.com/page')
  })

  it('should handle redirect with regex captures', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/users/123'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/users/([^/]+)$',
            destination: '/profile/$1',
            status: 301,
            headers: {
              Location: '/profile/$1',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.url.pathname).toBe('/profile/123')
  })

  it('should handle redirect with named captures', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/blog/2024/my-post'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/blog/(?<year>[^/]+)/(?<slug>[^/]+)$',
            destination: '/$year/posts/$slug',
            status: 301,
            headers: {
              Location: '/$year/posts/$slug',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.url.pathname).toBe('/2024/posts/my-post')
  })
})

describe('Redirects with Refresh header', () => {
  it('should handle redirect with Refresh header', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/refresh'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/refresh$',
            destination: '/refreshed',
            status: 302,
            headers: {
              Refresh: '0; url=/refreshed',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.status).toBe(302)
    expect(result.redirect?.url.pathname).toBe('/refreshed')
  })

  it('should prioritize redirect over rewrite when status is 3xx', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/priority-test'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/priority-test$',
            destination: '/target',
            status: 301,
            headers: {
              Location: '/target',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/target'],
    })

    const result = await resolveRoutes(params)

    // Should return redirect, not matchedPathname
    expect(result.redirect).toBeDefined()
    expect(result.matchedPathname).toBeUndefined()
  })
})

describe('Redirects in different route phases', () => {
  it('should handle redirect in beforeMiddleware', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/early-redirect'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/early-redirect$',
            destination: '/redirected',
            status: 301,
            headers: {
              Location: '/redirected',
            },
          },
        ],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.status).toBe(301)
  })

  it('should handle redirect in beforeFiles', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/before-files-redirect'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/before-files-redirect$',
            destination: '/redirected',
            status: 302,
            headers: {
              Location: '/redirected',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.status).toBe(302)
  })

  it('should handle redirect in afterFiles', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/after-files-redirect'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/after-files-redirect$',
            destination: '/redirected',
            status: 307,
            headers: {
              Location: '/redirected',
            },
          },
        ],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.status).toBe(307)
  })

  it('should handle redirect in fallback', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/fallback-redirect'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/fallback-redirect$',
            destination: '/redirected',
            status: 308,
            headers: {
              Location: '/redirected',
            },
          },
        ],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.status).toBe(308)
  })
})

describe('Redirect edge cases', () => {
  it('should NOT redirect when status is 200 even with Location header', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/not-redirect'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/not-redirect$',
            destination: '/target',
            status: 200,
            headers: {
              Location: '/target',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/target'],
    })

    const result = await resolveRoutes(params)

    // Should not redirect, should rewrite instead
    expect(result.redirect).toBeUndefined()
    expect(result.matchedPathname).toBe('/target')
  })

  it('should NOT redirect when status is 3xx but no Location/Refresh header', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/no-location'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/no-location$',
            destination: '/target',
            status: 301,
            headers: {
              'X-Custom': 'value',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/target'],
    })

    const result = await resolveRoutes(params)

    // Should not redirect without Location or Refresh header
    expect(result.redirect).toBeUndefined()
    expect(result.matchedPathname).toBe('/target')
  })

  it('should stop processing routes after redirect', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/stop-after-redirect'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/stop-after-redirect$',
            destination: '/redirected',
            status: 301,
            headers: {
              Location: '/redirected',
            },
          },
          {
            sourceRegex: '^/redirected$',
            destination: '/should-not-reach',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.url.pathname).toBe('/redirected')
    expect(result.matchedPathname).toBeUndefined()
  })

  it('should handle case-insensitive Location header check', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/case-test'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/case-test$',
            destination: '/target',
            status: 301,
            headers: {
              location: '/target', // lowercase
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.status).toBe(301)
  })

  it('should handle redirect with query parameters', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/search?q=test'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/search$',
            destination: '/find?q=test&source=redirect',
            status: 302,
            headers: {
              Location: '/find?q=test&source=redirect',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.url.pathname).toBe('/find')
    expect(result.redirect?.url.search).toContain('q=test')
  })
})

describe('Redirect priority and precedence', () => {
  it('should execute redirect in beforeMiddleware before other routes', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/test'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/test$',
            destination: '/early',
            status: 301,
            headers: {
              Location: '/early',
            },
          },
        ],
        beforeFiles: [
          {
            sourceRegex: '^/test$',
            destination: '/late',
            status: 302,
            headers: {
              Location: '/late',
            },
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect?.url.pathname).toBe('/early')
    expect(result.redirect?.status).toBe(301)
  })

  it('should not process middleware if beforeMiddleware redirects', async () => {
    const middlewareMock = jest.fn().mockResolvedValue({})

    const params = createBaseParams({
      url: new URL('https://example.com/redirect-early'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/redirect-early$',
            destination: '/redirected',
            status: 301,
            headers: {
              Location: '/redirected',
            },
          },
        ],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      invokeMiddleware: middlewareMock,
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(middlewareMock).not.toHaveBeenCalled()
  })
})
