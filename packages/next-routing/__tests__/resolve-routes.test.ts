import { resolveRoutes } from '../src/resolve-routes'
import type { ResolveRoutesParams } from '../src/types'

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

    expect(result.matchedPathname).toBe('/new-path')
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

    expect(result.matchedPathname).toBe('/third')
  })
})

describe('resolveRoutes - invokeMiddleware', () => {
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
    expect(result.matchedPathname).toBeUndefined()
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

    expect(result.matchedPathname).toBe('/rewritten')
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

  it('should apply requestHeaders from middleware', async () => {
    const newHeaders = new Headers({
      'x-custom-header': 'middleware-value',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/test'),
      invokeMiddleware: async () => ({
        requestHeaders: newHeaders,
      }),
      pathnames: ['/test'],
    })

    const result = await resolveRoutes(params)

    expect(result.resolvedHeaders?.get('x-custom-header')).toBe(
      'middleware-value'
    )
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

    expect(result.matchedPathname).toBe('/internal-api/users')
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

    expect(result.matchedPathname).toBe('/final')
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

    expect(result.matchedPathname).toBe('/404')
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

    expect(result.matchedPathname).toBe('/middle')
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

    expect(result.matchedPathname).toBe('/default')
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

    expect(result.matchedPathname).toBe('/fallback-final')
  })
})
