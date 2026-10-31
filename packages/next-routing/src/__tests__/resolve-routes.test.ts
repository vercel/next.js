import { resolveRoutes } from '../resolve-routes'
import type { ResolveRoutesParams } from '../types'

// Helper to create a ReadableStream
function createReadableStream(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.close()
    },
  })
}

// Helper to create base params
function createBaseParams(
  overrides: Partial<ResolveRoutesParams> = {}
): ResolveRoutesParams {
  return {
    url: new URL('https://example.com/'),
    buildId: 'BUILD_ID',
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

describe('resolveRoutes - beforeMiddleware', () => {
  it('should process beforeMiddleware routes and rewrite internally', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/old-path'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/old-path$',
            destination: '/new-path',
          },
        ],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/new-path'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/new-path')
    expect(result.resolvedHeaders).toBeDefined()
  })

  it('should handle redirect in beforeMiddleware with Location header', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/old'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/old$',
            destination: '/new',
            status: 301,
            headers: {
              Location: '/new',
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
    expect(result.redirect?.url.pathname).toBe('/new')
  })

  it('should stop at first matching redirect headers route', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/en/redirect-1'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/en/redirect-1(?:/)?$',
            status: 307,
            headers: {
              Location: '/somewhere/else',
            },
          },
          {
            sourceRegex: '^(?:/(en|fr|nl))/redirect-1(?:/)?$',
            status: 307,
            headers: {
              Location: '/$1/somewhere/else',
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

    expect(result.status).toBe(307)
    expect(result.redirect).toBeUndefined()
    expect(result.resolvedHeaders?.get('location')).toBe('/somewhere/else')
  })

  it('should handle external rewrite in beforeMiddleware', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/proxy'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/proxy$',
            destination: 'https://external.com/api',
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

    expect(result.externalRewrite).toBeDefined()
    expect(result.externalRewrite?.toString()).toBe('https://external.com/api')
  })

  it('should handle chained rewrites in beforeMiddleware', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/first'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/first$',
            destination: '/second',
          },
          {
            sourceRegex: '^/second$',
            destination: '/third',
          },
        ],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/third'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/third')
  })
})

describe('resolveRoutes - case sensitivity', () => {
  it('should match routes case-insensitively by default', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/rewrite-no-basePath'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/rewrite-no-basepath(?:/)?$',
            destination: 'https://example.vercel.sh/',
          },
        ],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.externalRewrite?.toString()).toBe(
      'https://example.vercel.sh/'
    )
  })

  it('should respect caseSensitive route matching when enabled', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/rewrite-no-basePath'),
      routes: {
        caseSensitive: true,
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/rewrite-no-basepath(?:/)?$',
            destination: 'https://example.vercel.sh/',
          },
        ],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.externalRewrite).toBeUndefined()
    expect(result.redirect).toBeUndefined()
  })
})

describe('resolveRoutes - invokeMiddleware', () => {
  it('should skip invokeMiddleware when middleware matchers are empty', async () => {
    const middlewareMock = jest.fn().mockResolvedValue({})

    const params = createBaseParams({
      url: new URL('https://example.com/no-matchers'),
      pathnames: ['/no-matchers'],
      invokeMiddleware: middlewareMock,
      routes: {
        beforeMiddleware: [],
        middlewareMatchers: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(middlewareMock).not.toHaveBeenCalled()
    expect(result.resolvedPathname).toBe('/no-matchers')
  })

  it('should skip invokeMiddleware when middleware matchers do not match', async () => {
    const middlewareMock = jest.fn().mockResolvedValue({})

    const params = createBaseParams({
      url: new URL('https://example.com/no-match'),
      pathnames: ['/no-match'],
      invokeMiddleware: middlewareMock,
      routes: {
        beforeMiddleware: [],
        middlewareMatchers: [
          {
            sourceRegex: '^/middleware-only$',
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

    expect(middlewareMock).not.toHaveBeenCalled()
    expect(result.resolvedPathname).toBe('/no-match')
  })

  it('should call invokeMiddleware when a middleware matcher matches', async () => {
    const middlewareMock = jest.fn().mockResolvedValue({})

    const params = createBaseParams({
      url: new URL('https://example.com/middleware-only'),
      pathnames: ['/middleware-only'],
      invokeMiddleware: middlewareMock,
      routes: {
        beforeMiddleware: [],
        middlewareMatchers: [
          {
            sourceRegex: '^/middleware-only$',
          },
        ],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    await resolveRoutes(params)

    expect(middlewareMock).toHaveBeenCalledTimes(1)
  })

  it('should call invokeMiddleware when a middleware matcher matches decoded pathname', async () => {
    const middlewareMock = jest.fn().mockResolvedValue({})

    const params = createBaseParams({
      url: new URL('https://example.com/vercel%20copy.svg'),
      pathnames: ['/vercel copy.svg'],
      invokeMiddleware: middlewareMock,
      routes: {
        beforeMiddleware: [],
        middlewareMatchers: [
          {
            sourceRegex: '^/vercel copy\\.svg$',
          },
        ],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    await resolveRoutes(params)

    expect(middlewareMock).toHaveBeenCalledTimes(1)
  })

  it('should skip invokeMiddleware when pathname decoding fails and encoded pathname does not match', async () => {
    const middlewareMock = jest.fn().mockResolvedValue({})

    const params = createBaseParams({
      url: new URL('https://example.com/%E0%A4%A'),
      pathnames: ['/%E0%A4%A'],
      invokeMiddleware: middlewareMock,
      routes: {
        beforeMiddleware: [],
        middlewareMatchers: [
          {
            sourceRegex: '^/decoded-only$',
          },
        ],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    await resolveRoutes(params)

    expect(middlewareMock).not.toHaveBeenCalled()
  })

  it('should evaluate has conditions in middleware matchers', async () => {
    const middlewareMock = jest.fn().mockResolvedValue({})

    const params = createBaseParams({
      url: new URL('https://example.com/has-header'),
      pathnames: ['/has-header'],
      headers: new Headers({
        'x-test': 'enabled',
      }),
      invokeMiddleware: middlewareMock,
      routes: {
        beforeMiddleware: [],
        middlewareMatchers: [
          {
            sourceRegex: '^/has-header$',
            has: [
              {
                type: 'header',
                key: 'x-test',
                value: 'enabled',
              },
            ],
          },
        ],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    await resolveRoutes(params)

    expect(middlewareMock).toHaveBeenCalledTimes(1)
  })

  it('should call invokeMiddleware with current URL and headers', async () => {
    const middlewareMock = jest.fn().mockResolvedValue({})

    const params = createBaseParams({
      url: new URL('https://example.com/test'),
      invokeMiddleware: middlewareMock,
    })

    await resolveRoutes(params)

    expect(middlewareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.any(URL),
        headers: expect.any(Headers),
        requestBody: expect.any(ReadableStream),
      })
    )
  })

  it('should stop routing when middleware returns bodySent', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/test'),
      invokeMiddleware: async () => ({ bodySent: true }),
      pathnames: ['/test'],
    })

    const result = await resolveRoutes(params)

    expect(result.middlewareResponded).toBe(true)
    expect(result.resolvedPathname).toBeUndefined()
  })

  it('should handle middleware redirect', async () => {
    const redirectUrl = new URL('https://example.com/redirected')
    const params = createBaseParams({
      url: new URL('https://example.com/test'),
      invokeMiddleware: async () => ({
        redirect: {
          url: redirectUrl,
          status: 302,
        },
      }),
    })

    const result = await resolveRoutes(params)

    expect(result.status).toBe(302)
    expect(result.resolvedHeaders?.get('Location')).toBe(
      'https://example.com/redirected'
    )
  })

  it('should handle middleware rewrite (internal)', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/test'),
      invokeMiddleware: async () => ({
        rewrite: new URL('https://example.com/rewritten'),
      }),
      pathnames: ['/rewritten'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/rewritten')
  })

  it('should handle middleware external rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/test'),
      invokeMiddleware: async () => ({
        rewrite: new URL('https://external.com/api'),
      }),
    })

    const result = await resolveRoutes(params)

    expect(result.externalRewrite).toBeDefined()
    expect(result.externalRewrite?.toString()).toBe('https://external.com/api')
  })

  it('should use requestHeaders from middleware for downstream routing without returning them', async () => {
    const middlewareRequestHeaders = new Headers({
      'x-custom-header': 'middleware-value',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/test'),
      invokeMiddleware: async () => ({
        requestHeaders: middlewareRequestHeaders,
      }),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/test$',
            destination: '/internal',
            has: [
              {
                type: 'header',
                key: 'x-custom-header',
                value: 'middleware-value',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/internal'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/internal')
    expect(result.resolvedHeaders?.get('x-custom-header')).toBeNull()
  })

  it('should return middleware responseHeaders without leaking request headers', async () => {
    const middlewareRequestHeaders = new Headers({
      'x-internal-header': 'middleware-only',
    })
    const middlewareResponseHeaders = new Headers({
      'x-response-header': 'response-value',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/test'),
      headers: new Headers({
        authorization: 'Bearer secret',
      }),
      invokeMiddleware: async () => ({
        requestHeaders: middlewareRequestHeaders,
        responseHeaders: middlewareResponseHeaders,
      }),
      pathnames: ['/test'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/test')
    expect(result.resolvedHeaders?.get('x-response-header')).toBe(
      'response-value'
    )
    expect(result.resolvedHeaders?.get('x-internal-header')).toBeNull()
    expect(result.resolvedHeaders?.get('authorization')).toBeNull()
  })

  it('should not return initial request headers in resolvedHeaders', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/test'),
      headers: new Headers({
        authorization: 'Bearer secret',
        'x-request-id': 'req-123',
      }),
      pathnames: ['/test'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/test')
    expect(result.resolvedHeaders?.get('authorization')).toBeNull()
    expect(result.resolvedHeaders?.get('x-request-id')).toBeNull()
  })
})

describe('resolveRoutes - beforeFiles', () => {
  it('should process beforeFiles routes after middleware', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/api/users'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/api/users$',
            destination: '/internal-api/users',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/internal-api/users'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/internal-api/users')
  })

  it('should handle redirect in beforeFiles', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/api/old'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/api/old$',
            destination: '/api/new',
            status: 308,
            headers: {
              Location: '/api/new',
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
    expect(result.redirect?.url.pathname).toBe('/api/new')
  })

  it('should handle external rewrite in beforeFiles', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/external'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/external$',
            destination: 'https://api.external.com/data',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.externalRewrite).toBeDefined()
    expect(result.externalRewrite?.toString()).toBe(
      'https://api.external.com/data'
    )
  })

  it('should chain rewrites in beforeFiles', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/step1'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/step1$',
            destination: '/step2',
          },
          {
            sourceRegex: '^/step2$',
            destination: '/step3',
          },
          {
            sourceRegex: '^/step3$',
            destination: '/final',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/final'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/final')
  })
})

describe('resolveRoutes - afterFiles', () => {
  it('should process afterFiles routes when no pathname matches', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/not-found'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/not-found$',
            destination: '/404',
          },
        ],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/404'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/404')
  })

  it('should handle redirect in afterFiles', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/moved'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/moved$',
            destination: 'https://newdomain.com/page',
            status: 301,
            headers: {
              Location: 'https://newdomain.com/page',
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
    expect(result.redirect?.status).toBe(301)
    expect(result.redirect?.url.toString()).toBe('https://newdomain.com/page')
  })

  it('should handle external rewrite in afterFiles', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/proxy-after'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/proxy-after$',
            destination: 'https://backend.com/api',
          },
        ],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.externalRewrite).toBeDefined()
    expect(result.externalRewrite?.toString()).toBe('https://backend.com/api')
  })

  it('should check pathnames after each afterFiles rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/start'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/start$',
            destination: '/middle',
          },
        ],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/middle'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/middle')
  })
})

describe('resolveRoutes - fallback', () => {
  it('should process fallback routes when nothing else matches', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/unknown'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/unknown$',
            destination: '/default',
          },
        ],
      },
      pathnames: ['/default'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/default')
  })

  it('should handle redirect in fallback', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/catch-all'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/catch-all$',
            destination: '/home',
            status: 302,
            headers: {
              Location: '/home',
            },
          },
        ],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.redirect).toBeDefined()
    expect(result.redirect?.status).toBe(302)
    expect(result.redirect?.url.pathname).toBe('/home')
  })

  it('should handle external rewrite in fallback', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/fallback-external'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/fallback-external$',
            destination: 'https://cdn.example.com/asset',
          },
        ],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.externalRewrite).toBeDefined()
    expect(result.externalRewrite?.toString()).toBe(
      'https://cdn.example.com/asset'
    )
  })

  it('should chain rewrites in fallback', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/fallback-chain'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/fallback-chain$',
            destination: '/fallback-intermediate',
          },
          {
            sourceRegex: '^/fallback-intermediate$',
            destination: '/fallback-final',
          },
        ],
      },
      pathnames: ['/fallback-final'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/fallback-final')
  })
})

describe('resolveRoutes - routes without destination', () => {
  it('should process routes with headers only', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/headers-only'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/headers-only$',
            headers: {
              'x-custom-header': 'value',
            },
          },
        ],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/headers-only'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedHeaders?.get('x-custom-header')).toBe('value')
    expect(result.resolvedPathname).toBe('/headers-only')
  })

  it('should process routes with status only', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/status-only'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/status-only$',
            status: 418,
          },
        ],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/status-only'],
    })

    const result = await resolveRoutes(params)

    expect(result.status).toBe(418)
    expect(result.resolvedPathname).toBe('/status-only')
  })

  it('should process multiple routes without destination in sequence', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/multi'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/multi$',
            headers: {
              'x-header-1': '1',
            },
          },
          {
            sourceRegex: '^/multi$',
            headers: {
              'x-header-2': '2',
            },
            status: 200,
          },
        ],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/multi'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedHeaders?.get('x-header-1')).toBe('1')
    expect(result.resolvedHeaders?.get('x-header-2')).toBe('2')
    expect(result.status).toBe(200)
    expect(result.resolvedPathname).toBe('/multi')
  })
})

describe('resolveRoutes - dynamic routes', () => {
  it('should match dynamic route and return template pathname', async () => {
    // This tests the case where a URL like /dynamic/page should match
    // a dynamic route with template /dynamic/[slug]
    const params = createBaseParams({
      url: new URL('https://example.com/dynamic/page'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^[/]?/dynamic/(?<nxtPslug>[^/]+?)(?:/)?$',
            destination: '/dynamic/[slug]?nxtPslug=$nxtPslug',
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/dynamic/[slug]'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/dynamic/[slug]')
    expect(result.routeMatches).toEqual({
      '1': 'page',
      nxtPslug: 'page',
    })
  })

  it('should prefer exact static resolvedPathname when both concrete and dynamic pathnames exist', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/blog/post-1'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/blog/(?<nxtPslug>[^/]+?)$',
            destination: '/blog/[slug]?nxtPslug=$nxtPslug',
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/blog/[slug]', '/blog/post-1'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/blog/post-1')
    expect(result.routeMatches).toBeUndefined()
    expect(result.invocationTarget).toEqual({
      pathname: '/blog/post-1',
      query: {},
    })
  })

  it('should replace missing optional dynamic placeholders with empty values', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/catch-all-optional'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex:
              '^[/]?/catch-all-optional(?:/(?<nxtPslug>.+?))?(?:/)?$',
            destination: '/catch-all-optional/[[...slug]]?nxtPslug=$nxtPslug',
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/catch-all-optional/[[...slug]]'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/catch-all-optional/[[...slug]]')
    expect(result.routeMatches).toEqual({})
    expect(result.resolvedQuery).toEqual({
      nxtPslug: '',
    })
    expect(result.invocationTarget).toEqual({
      pathname: '/catch-all-optional',
      query: {
        nxtPslug: '',
      },
    })
  })

  it('should match dynamic route with multiple segments', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/posts/2024/my-article'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^[/]?/posts/(?<year>[^/]+?)/(?<slug>[^/]+?)(?:/)?$',
            destination: '/posts/[year]/[slug]?year=$year&slug=$slug',
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/posts/[year]/[slug]'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/posts/[year]/[slug]')
    expect(result.routeMatches).toEqual({
      '1': '2024',
      '2': 'my-article',
      year: '2024',
      slug: 'my-article',
    })
  })

  it('should match catch-all dynamic route', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/docs/getting-started/installation'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^[/]?/docs/(?<path>.+?)(?:/)?$',
            destination: '/docs/[...path]?path=$path',
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/docs/[...path]'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/docs/[...path]')
    expect(result.routeMatches).toEqual({
      '1': 'getting-started/installation',
      path: 'getting-started/installation',
    })
  })

  it('should not match dynamic route when pathname template is not in pathnames list', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/dynamic/page'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^[/]?/dynamic/(?<nxtPslug>[^/]+?)(?:/)?$',
            destination: '/dynamic/[slug]?nxtPslug=$nxtPslug',
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/other-page'], // /dynamic/[slug] is not in the list
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBeUndefined()
  })

  it('should apply onMatch headers for dynamic routes', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/api/users'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^[/]?/api/(?<resource>[^/]+?)(?:/)?$',
            destination: '/api/[resource]?resource=$resource',
          },
        ],
        onMatch: [
          {
            sourceRegex: '.*',
            headers: {
              'x-matched': 'true',
            },
          },
        ],
        fallback: [],
      },
      pathnames: ['/api/[resource]'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/api/[resource]')
    expect(result.resolvedHeaders?.get('x-matched')).toBe('true')
  })

  it('should apply onMatch headers using merged destination query for dynamic routes', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/blog/post-1?draft=1'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/blog/(?<slug>[^/]+?)$',
            destination: '/blog/[slug]?slug=$slug',
          },
        ],
        onMatch: [
          {
            sourceRegex: '^/blog/post-1$',
            has: [
              {
                type: 'query',
                key: 'slug',
                value: 'post-1',
              },
            ],
            headers: {
              'x-slug-match': 'true',
            },
          },
        ],
        fallback: [],
      },
      pathnames: ['/blog/[slug]'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/blog/[slug]')
    expect(result.resolvedHeaders?.get('x-slug-match')).toBe('true')
    expect(result.resolvedQuery).toEqual({
      draft: '1',
      slug: 'post-1',
    })
  })

  it('should expose resolved query and invocation target for rewrite matches', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/rewrite-source?existing=1'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/rewrite-source$',
            destination: '/rewrite-target?added=2',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/rewrite-target'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/rewrite-target')
    expect(result.resolvedQuery).toEqual({
      existing: '1',
      added: '2',
    })
    expect(result.invocationTarget).toEqual({
      pathname: '/rewrite-target',
      query: {
        existing: '1',
        added: '2',
      },
    })
  })

  it('should expose concrete invocation target for dynamic route matches', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/blog/post-1?draft=1'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/blog/(?<slug>[^/]+?)$',
            destination: '/blog/[slug]?slug=$slug',
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/blog/[slug]'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedPathname).toBe('/blog/[slug]')
    expect(result.resolvedQuery).toEqual({
      draft: '1',
      slug: 'post-1',
    })
    expect(result.invocationTarget).toEqual({
      pathname: '/blog/post-1',
      query: {
        draft: '1',
        slug: 'post-1',
      },
    })
  })
})
