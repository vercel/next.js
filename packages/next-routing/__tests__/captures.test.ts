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

describe('Regex Captures in Destination', () => {
  it('should replace $1 with first regex capture', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/blog/my-post'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/blog/([^/]+)$',
            destination: '/posts/$1',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/posts/my-post'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/posts/my-post')
  })

  it('should replace multiple numbered captures $1, $2, $3', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/2024/01/post-title'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/([^/]+)/([^/]+)/([^/]+)$',
            destination: '/archive/$1/$2/$3',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/archive/2024/01/post-title'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/archive/2024/01/post-title')
  })

  it('should replace named captures in destination', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/users/alice/posts/123'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/users/(?<username>[^/]+)/posts/(?<postId>[^/]+)$',
            destination: '/u/$username/p/$postId',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/u/alice/p/123'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/u/alice/p/123')
  })

  it('should mix numbered and named captures', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/api/v1/users/john'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/api/([^/]+)/users/(?<username>[^/]+)$',
            destination: '/internal/$1/user/$username',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/internal/v1/user/john'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/internal/v1/user/john')
  })

  it('should use captures in query parameters', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/product/electronics/123'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/product/(?<category>[^/]+)/(?<id>[^/]+)$',
            destination: '/api/products?category=$category&id=$id',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/api/products'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/api/products')
  })

  it('should replace captures in external rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/cdn/images/photo.jpg'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/cdn/(.+)$',
            destination: 'https://cdn.example.com/$1',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.externalRewrite?.toString()).toBe(
      'https://cdn.example.com/images/photo.jpg'
    )
  })

  it('should replace captures in redirect destination', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/old/page-123'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/old/(.+)$',
            destination: '/new/$1',
            status: 301,
            headers: {
              Location: '/new/$1',
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
    expect(result.redirect?.url.pathname).toBe('/new/page-123')
  })
})

describe('Has Condition Captures in Destination', () => {
  it('should use header value in destination when has matches', async () => {
    const headers = new Headers({
      'x-user-id': '12345',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/profile'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/profile$',
            destination: '/users/$xuserid/profile',
            has: [
              {
                type: 'header',
                key: 'x-user-id',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/users/12345/profile'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/users/12345/profile')
  })

  it('should use cookie value in destination', async () => {
    const headers = new Headers({
      cookie: 'session=abc123xyz; theme=dark',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/dashboard'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/dashboard$',
            destination: '/sessions/$session/dashboard',
            has: [
              {
                type: 'cookie',
                key: 'session',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/sessions/abc123xyz/dashboard'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/sessions/abc123xyz/dashboard')
  })

  it('should use query parameter value in destination', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/search?q=nextjs'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/search$',
            destination: '/results/$q',
            has: [
              {
                type: 'query',
                key: 'q',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/results/nextjs'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/results/nextjs')
  })

  it('should combine regex captures and has captures', async () => {
    const headers = new Headers({
      'x-tenant': 'acme',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/api/users/123'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/api/users/([^/]+)$',
            destination: '/tenants/$xtenant/users/$1',
            has: [
              {
                type: 'header',
                key: 'x-tenant',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/tenants/acme/users/123'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/tenants/acme/users/123')
  })

  it('should combine named regex captures and has captures', async () => {
    const headers = new Headers({
      'x-api-version': 'v2',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/products/electronics'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/products/(?<category>[^/]+)$',
            destination: '/api/$xapiversion/products/$category',
            has: [
              {
                type: 'header',
                key: 'x-api-version',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/api/v2/products/electronics'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/api/v2/products/electronics')
  })

  it('should use multiple has captures in destination', async () => {
    const headers = new Headers({
      'x-tenant': 'acme',
      'x-region': 'us-west',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/data'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/data$',
            destination: '/regions/$xregion/tenants/$xtenant/data',
            has: [
              {
                type: 'header',
                key: 'x-tenant',
              },
              {
                type: 'header',
                key: 'x-region',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/regions/us-west/tenants/acme/data'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/regions/us-west/tenants/acme/data')
  })

  it('should use has captures with regex pattern match', async () => {
    const headers = new Headers({
      'x-locale': 'en-US',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/page'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/page$',
            destination: '/localized/$xlocale/page',
            has: [
              {
                type: 'header',
                key: 'x-locale',
                value: '^[a-z]{2}-[A-Z]{2}$',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/localized/en-US/page'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/localized/en-US/page')
  })

  it('should use has captures in query string', async () => {
    const headers = new Headers({
      'x-user-id': '999',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/dashboard'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/dashboard$',
            destination: '/internal/dashboard?userId=$xuserid',
            has: [
              {
                type: 'header',
                key: 'x-user-id',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/internal/dashboard'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/internal/dashboard')
  })

  it('should use has captures in external rewrite', async () => {
    const headers = new Headers({
      'x-backend-id': 'server-1',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/api/data'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/api/data$',
            destination: 'https://$xbackendid.example.com/data',
            has: [
              {
                type: 'header',
                key: 'x-backend-id',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
    })

    const result = await resolveRoutes(params)

    expect(result.externalRewrite?.toString()).toBe(
      'https://server-1.example.com/data'
    )
  })

  it('should use has captures in redirect', async () => {
    const headers = new Headers({
      'x-language': 'es',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/home'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/home$',
            destination: '/$xlanguage/home',
            status: 302,
            headers: {
              Location: '/$xlanguage/home',
            },
            has: [
              {
                type: 'header',
                key: 'x-language',
              },
            ],
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
    expect(result.redirect?.url.pathname).toBe('/es/home')
  })
})

describe('Complex Capture Scenarios', () => {
  it('should handle deeply nested capture replacements', async () => {
    const headers = new Headers({
      'x-org': 'myorg',
      cookie: 'user=john',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/projects/backend/issues/42'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex:
              '^/projects/(?<project>[^/]+)/issues/(?<issueId>[^/]+)$',
            destination:
              '/orgs/$xorg/users/$user/projects/$project/issues/$issueId',
            has: [
              {
                type: 'header',
                key: 'x-org',
              },
              {
                type: 'cookie',
                key: 'user',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/orgs/myorg/users/john/projects/backend/issues/42'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe(
      '/orgs/myorg/users/john/projects/backend/issues/42'
    )
  })

  it('should handle same variable name multiple times in destination', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/mirror/test'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/mirror/([^/]+)$',
            destination: '/a/$1/b/$1/c/$1',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/a/test/b/test/c/test'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/a/test/b/test/c/test')
  })

  it('should handle capture with special characters', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/files/my-file.test.js'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/files/(.+)$',
            destination: '/storage/$1',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/storage/my-file.test.js'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/storage/my-file.test.js')
  })

  it('should not replace undefined captures', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/test'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/test$',
            destination: '/result/$1/$2', // $1 and $2 don't exist
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/result/$1/$2'], // Should remain as literal $1/$2
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/result/$1/$2')
  })

  it('should handle captures across chained rewrites', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/v1/users/alice'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/v1/users/([^/]+)$',
            destination: '/api/users/$1',
          },
          {
            sourceRegex: '^/api/users/([^/]+)$',
            destination: '/internal/user-service/$1',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/internal/user-service/alice'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/internal/user-service/alice')
  })
})
