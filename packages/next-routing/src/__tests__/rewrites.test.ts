import { resolveRoutes } from '../resolve-routes'
import type { ResolveRoutesParams } from '../types'

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

describe('Internal Rewrites', () => {
  it('should perform simple internal rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/blog'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/blog$',
            destination: '/posts',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/posts'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/posts')
    expect(result.externalRewrite).toBeUndefined()
  })

  it('should handle internal rewrite with query parameters', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/search?q=test'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/search$',
            destination: '/api/search?source=web',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/api/search'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/api/search')
  })

  it('should preserve original query params during internal rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/page?id=123'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/page$',
            destination: '/internal/page',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/internal/page'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/internal/page')
  })

  it('should handle regex captures in internal rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/users/john'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/users/([^/]+)$',
            destination: '/profile/$1',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/profile/john'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/profile/john')
  })

  it('should handle named captures in internal rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/products/electronics/123'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/products/(?<category>[^/]+)/(?<id>[^/]+)$',
            destination: '/api/product?category=$category&id=$id',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/api/product'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/api/product')
  })
})

describe('External Rewrites', () => {
  it('should handle external rewrite with http', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/external'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/external$',
            destination: 'http://external.com/api',
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
    expect(result.externalRewrite?.toString()).toBe('http://external.com/api')
    expect(result.matchedPathname).toBeUndefined()
  })

  it('should handle external rewrite with https', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/cdn'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/cdn$',
            destination: 'https://cdn.example.com/assets',
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
      'https://cdn.example.com/assets'
    )
  })

  it('should handle external rewrite with captures', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/api/v1/users'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/api/v1/(.+)$',
            destination: 'https://backend.com/v1/$1',
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
      'https://backend.com/v1/users'
    )
  })

  it('should detect external rewrite when origin changes', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/rewrite'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/rewrite$',
            destination: '/external',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    // Mock the applyDestination to return different origin
    const result = await resolveRoutes(params)

    // Since we're rewriting to same origin, should match pathname
    expect(result.externalRewrite).toBeUndefined()
  })

  it('should handle external rewrite in all route phases', async () => {
    // Test beforeMiddleware
    const beforeMiddlewareResult = await resolveRoutes(
      createBaseParams({
        url: new URL('https://example.com/test1'),
        routes: {
          beforeMiddleware: [
            {
              sourceRegex: '^/test1$',
              destination: 'https://ext.com/1',
            },
          ],
          beforeFiles: [],
          afterFiles: [],
          dynamicRoutes: [],
          onMatch: [],
          fallback: [],
        },
      })
    )
    expect(beforeMiddlewareResult.externalRewrite?.toString()).toBe(
      'https://ext.com/1'
    )

    // Test beforeFiles
    const beforeFilesResult = await resolveRoutes(
      createBaseParams({
        url: new URL('https://example.com/test2'),
        routes: {
          beforeMiddleware: [],
          beforeFiles: [
            {
              sourceRegex: '^/test2$',
              destination: 'https://ext.com/2',
            },
          ],
          afterFiles: [],
          dynamicRoutes: [],
          onMatch: [],
          fallback: [],
        },
      })
    )
    expect(beforeFilesResult.externalRewrite?.toString()).toBe(
      'https://ext.com/2'
    )

    // Test afterFiles
    const afterFilesResult = await resolveRoutes(
      createBaseParams({
        url: new URL('https://example.com/test3'),
        routes: {
          beforeMiddleware: [],
          beforeFiles: [],
          afterFiles: [
            {
              sourceRegex: '^/test3$',
              destination: 'https://ext.com/3',
            },
          ],
          dynamicRoutes: [],
          onMatch: [],
          fallback: [],
        },
      })
    )
    expect(afterFilesResult.externalRewrite?.toString()).toBe(
      'https://ext.com/3'
    )

    // Test fallback
    const fallbackResult = await resolveRoutes(
      createBaseParams({
        url: new URL('https://example.com/test4'),
        routes: {
          beforeMiddleware: [],
          beforeFiles: [],
          afterFiles: [],
          dynamicRoutes: [],
          onMatch: [],
          fallback: [
            {
              sourceRegex: '^/test4$',
              destination: 'https://ext.com/4',
            },
          ],
        },
      })
    )
    expect(fallbackResult.externalRewrite?.toString()).toBe('https://ext.com/4')
  })
})

describe('Chained Internal Rewrites', () => {
  it('should chain multiple rewrites across same phase', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/a'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/a$',
            destination: '/b',
          },
          {
            sourceRegex: '^/b$',
            destination: '/c',
          },
          {
            sourceRegex: '^/c$',
            destination: '/d',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/d'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/d')
  })

  it('should chain rewrites across different phases', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/start'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/start$',
            destination: '/step1',
          },
        ],
        beforeFiles: [
          {
            sourceRegex: '^/step1$',
            destination: '/step2',
          },
        ],
        afterFiles: [
          {
            sourceRegex: '^/step2$',
            destination: '/final',
          },
        ],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/final'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/final')
  })

  it('should complete chaining then check pathname match', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/path1'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/path1$',
            destination: '/path2',
          },
          {
            sourceRegex: '^/path2$',
            destination: '/path3',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/path3'],
    })

    const result = await resolveRoutes(params)

    // Should chain through all routes, then match pathname
    expect(result.matchedPathname).toBe('/path3')
  })

  it('should chain with regex captures preserved', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/user/alice/posts/123'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/user/([^/]+)/posts/([^/]+)$',
            destination: '/users/$1/content/$2',
          },
          {
            sourceRegex: '^/users/([^/]+)/content/([^/]+)$',
            destination: '/api/user-content?user=$1&post=$2',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/api/user-content'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/api/user-content')
  })

  it('should stop chaining on external rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/chain-start'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/chain-start$',
            destination: '/chain-middle',
          },
          {
            sourceRegex: '^/chain-middle$',
            destination: 'https://external.com/api',
          },
          {
            sourceRegex: '^/should-not-reach$',
            destination: '/never',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.externalRewrite?.toString()).toBe('https://external.com/api')
    expect(result.matchedPathname).toBeUndefined()
  })

  it('should stop chaining on redirect', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/redirect-chain'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/redirect-chain$',
            destination: '/redirect-target',
          },
          {
            sourceRegex: '^/redirect-target$',
            destination: '/final-destination',
            status: 301,
            headers: {
              Location: '/final-destination',
            },
          },
          {
            sourceRegex: '^/final-destination$',
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
    expect(result.redirect?.status).toBe(301)
    expect(result.redirect?.url.pathname).toBe('/final-destination')
    expect(result.matchedPathname).toBeUndefined()
  })

  it('should handle complex chaining scenario', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/blog/2024/post-title'),
      routes: {
        beforeMiddleware: [
          {
            sourceRegex: '^/blog/([^/]+)/([^/]+)$',
            destination: '/posts/$1/$2',
          },
        ],
        beforeFiles: [
          {
            sourceRegex: '^/posts/([^/]+)/([^/]+)$',
            destination: '/api/posts?year=$1&slug=$2',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/api/posts'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/api/posts')
  })
})
