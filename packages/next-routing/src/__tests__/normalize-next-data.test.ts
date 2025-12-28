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

describe('normalizeNextData - beforeMiddleware', () => {
  it('should normalize data URL before processing beforeMiddleware', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/blog/post.json'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/blog/(.+)$',
            destination: '/api/blog/$1',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/_next/data/BUILD_ID/api/blog/post.json'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe(
      '/_next/data/BUILD_ID/api/blog/post.json'
    )
  })

  it('should normalize with basePath', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/base/_next/data/BUILD_ID/page.json'),
      basePath: '/base',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/base/page$',
            destination: '/base/api/page',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/base/_next/data/BUILD_ID/api/page.json'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe(
      '/base/_next/data/BUILD_ID/api/page.json'
    )
  })
})

describe('normalizeNextData - pathname checking', () => {
  it('should denormalize before checking pathnames after beforeFiles', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/posts/hello.json'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/_next/data/BUILD_ID/posts/hello.json'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/_next/data/BUILD_ID/posts/hello.json')
  })

  it('should work with rewrites then pathname check', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/blog.json'),
      basePath: '',
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
        shouldNormalizeNextData: true,
      },
      pathnames: ['/_next/data/BUILD_ID/posts.json'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/_next/data/BUILD_ID/posts.json')
  })
})

describe('normalizeNextData - afterFiles', () => {
  it('should normalize again before processing afterFiles', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/not-found.json'),
      basePath: '',
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
        shouldNormalizeNextData: true,
      },
      pathnames: ['/_next/data/BUILD_ID/404.json'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/_next/data/BUILD_ID/404.json')
  })

  it('should handle complex flow: normalize -> beforeFiles -> denormalize -> normalize -> afterFiles -> denormalize', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/api/users.json'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/api/users$',
            destination: '/users-data',
          },
        ],
        afterFiles: [
          {
            sourceRegex: '^/users-data$',
            destination: '/internal/users',
          },
        ],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/_next/data/BUILD_ID/internal/users.json'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe(
      '/_next/data/BUILD_ID/internal/users.json'
    )
  })
})

describe('normalizeNextData - dynamic routes', () => {
  it('should denormalize before checking dynamic routes', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/posts/123.json'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/_next/data/BUILD_ID/posts/(?<id>[^/]+)\\.json$',
            destination: '/_next/data/BUILD_ID/posts/123.json',
          },
        ],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/_next/data/BUILD_ID/posts/123.json'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/_next/data/BUILD_ID/posts/123.json')
    expect(result.routeMatches).toEqual({
      '1': '123',
      id: '123',
    })
  })

  it('should reset URL to denormalized version after dynamic route match', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/user/alice.json'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/user/(.+)$',
            destination: '/users/$1',
          },
        ],
        dynamicRoutes: [
          {
            sourceRegex:
              '^/_next/data/BUILD_ID/users/(?<username>[^/]+)\\.json$',
            destination: '/_next/data/BUILD_ID/users/alice.json',
          },
        ],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/_next/data/BUILD_ID/users/alice.json'],
    })

    const result = await resolveRoutes(params)

    // Should match with denormalized pathname
    expect(result.matchedPathname).toBe('/_next/data/BUILD_ID/users/alice.json')
    expect(result.routeMatches).toEqual({
      '1': 'alice',
      username: 'alice',
    })
  })

  it('should work with dynamic routes after afterFiles rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/blog/post-1.json'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/blog/(.+)$',
            destination: '/posts/$1',
          },
        ],
        dynamicRoutes: [
          {
            sourceRegex: '^/_next/data/BUILD_ID/posts/(?<slug>[^/]+)\\.json$',
            destination: '/_next/data/BUILD_ID/posts/post-1.json',
          },
        ],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/_next/data/BUILD_ID/posts/post-1.json'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe(
      '/_next/data/BUILD_ID/posts/post-1.json'
    )
    expect(result.routeMatches).toEqual({
      '1': 'post-1',
      slug: 'post-1',
    })
  })
})

describe('normalizeNextData - fallback routes', () => {
  it('should handle normalization with fallback routes', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/unknown.json'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/unknown$',
            destination: '/404',
          },
        ],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/_next/data/BUILD_ID/404.json'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/_next/data/BUILD_ID/404.json')
  })
})

describe('normalizeNextData - without normalization', () => {
  it('should work normally when normalizeNextData is not provided', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/blog/post'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/blog/(.+)$',
            destination: '/posts/$1',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/posts/post'],
      // normalizeNextData not provided
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/posts/post')
  })

  it('should not normalize when normalizeNextData is undefined', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/page.json'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/_next/data/BUILD_ID/page\\.json$',
            destination: '/api/page',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: undefined,
      },
      pathnames: ['/api/page'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/api/page')
  })

  it('should not normalize URLs that are not data URLs', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/regular/path'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/regular/path'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/regular/path')
  })

  it('should not apply normalization to non-data URLs even with rewrites', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/blog/post'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/blog/(.+)$',
            destination: '/posts/$1',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/posts/post'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/posts/post')
  })

  it('should not normalize if rewrite creates a data URL pattern from non-data URL', async () => {
    // Edge case: original URL is NOT a data URL, but rewrite creates path that looks like one
    const params = createBaseParams({
      url: new URL('https://example.com/redirect-to-data'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/redirect-to-data$',
            destination: '/_next/data/BUILD_ID/some/path.json',
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/_next/data/BUILD_ID/some/path.json'],
    })

    const result = await resolveRoutes(params)

    // Should NOT normalize because original URL was not a data URL
    expect(result.matchedPathname).toBe('/_next/data/BUILD_ID/some/path.json')
  })

  it('should not normalize in afterFiles if original URL was not a data URL', async () => {
    // Edge case: rewrite in beforeFiles creates data URL pattern,
    // then afterFiles tries to rewrite again - should NOT normalize before afterFiles
    const params = createBaseParams({
      url: new URL('https://example.com/api/data'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/api/data$',
            destination: '/_next/data/BUILD_ID/raw.json',
          },
        ],
        afterFiles: [
          {
            sourceRegex: '^/_next/data/BUILD_ID/raw\\.json$',
            destination: '/processed.json',
          },
        ],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/processed.json'],
    })

    const result = await resolveRoutes(params)

    // Should match because afterFiles rewrite should work on the unrewritten data URL path
    expect(result.matchedPathname).toBe('/processed.json')
  })

  it('should not normalize data URLs with different buildId', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/DIFFERENT_ID/page.json'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/_next/data/DIFFERENT_ID/page.json'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/_next/data/DIFFERENT_ID/page.json')
  })

  it('should handle data URL without .json extension', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/page'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/_next/data/BUILD_ID/page.json'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/_next/data/BUILD_ID/page.json')
  })

  it('should resolve to _next/data pathname when both exist and URL is a data URL', async () => {
    // When both normalized and denormalized paths exist, data URL should match denormalized
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/posts.json'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/posts', '/_next/data/BUILD_ID/posts.json'], // Both exist
    })

    const result = await resolveRoutes(params)

    // Should match the denormalized path
    expect(result.matchedPathname).toBe('/_next/data/BUILD_ID/posts.json')
  })

  it('should resolve to normalized pathname when both exist and URL is NOT a data URL', async () => {
    // When both normalized and denormalized paths exist, regular URL should match normalized
    const params = createBaseParams({
      url: new URL('https://example.com/posts'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/posts', '/_next/data/BUILD_ID/posts.json'], // Both exist
    })

    const result = await resolveRoutes(params)

    // Should match the normalized path
    expect(result.matchedPathname).toBe('/posts')
  })

  it('should resolve to _next/data pathname after rewrite when both exist and original URL is data URL', async () => {
    // After rewrite, should still use denormalized pathname check
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/blog.json'),
      basePath: '',
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
        shouldNormalizeNextData: true,
      },
      pathnames: ['/posts', '/_next/data/BUILD_ID/posts.json'], // Both exist
    })

    const result = await resolveRoutes(params)

    // Should match the denormalized path
    expect(result.matchedPathname).toBe('/_next/data/BUILD_ID/posts.json')
  })

  it('should resolve to normalized pathname after rewrite when both exist and original URL is NOT data URL', async () => {
    // After rewrite, regular URL should still use normalized pathname check
    const params = createBaseParams({
      url: new URL('https://example.com/blog'),
      basePath: '',
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
        shouldNormalizeNextData: true,
      },
      pathnames: ['/posts', '/_next/data/BUILD_ID/posts.json'], // Both exist
    })

    const result = await resolveRoutes(params)

    // Should match the normalized path
    expect(result.matchedPathname).toBe('/posts')
  })

  it('should resolve to _next/data pathname after afterFiles rewrite when original URL is data URL', async () => {
    // afterFiles phase should also denormalize for data URLs
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/notfound.json'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/notfound$',
            destination: '/404',
          },
        ],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/404', '/_next/data/BUILD_ID/404.json'], // Both exist
    })

    const result = await resolveRoutes(params)

    // Should match the denormalized path
    expect(result.matchedPathname).toBe('/_next/data/BUILD_ID/404.json')
  })

  it('should resolve to normalized pathname after afterFiles rewrite when original URL is NOT data URL', async () => {
    // afterFiles phase should use normalized check for regular URLs
    const params = createBaseParams({
      url: new URL('https://example.com/notfound'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/notfound$',
            destination: '/404',
          },
        ],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/404', '/_next/data/BUILD_ID/404.json'], // Both exist
    })

    const result = await resolveRoutes(params)

    // Should match the normalized path
    expect(result.matchedPathname).toBe('/404')
  })

  it('should resolve to _next/data pathname with dynamic routes when both exist and original URL is data URL', async () => {
    // Dynamic routes with data URLs
    const params = createBaseParams({
      url: new URL('https://example.com/_next/data/BUILD_ID/posts/hello.json'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/_next/data/BUILD_ID/posts/(?<slug>[^/]+)\\.json$',
            destination: '/_next/data/BUILD_ID/posts/hello.json',
          },
          {
            sourceRegex: '^/posts/(?<slug>[^/]+)$',
            destination: '/posts/hello',
          },
        ],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/posts/hello', '/_next/data/BUILD_ID/posts/hello.json'], // Both exist
    })

    const result = await resolveRoutes(params)

    // Should match the denormalized path with the first dynamic route
    expect(result.matchedPathname).toBe('/_next/data/BUILD_ID/posts/hello.json')
    expect(result.routeMatches).toEqual({
      '1': 'hello',
      slug: 'hello',
    })
  })

  it('should resolve to normalized pathname with dynamic routes when both exist and original URL is NOT data URL', async () => {
    // Dynamic routes with regular URLs
    const params = createBaseParams({
      url: new URL('https://example.com/posts/hello'),
      basePath: '',
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/_next/data/BUILD_ID/posts/(?<slug>[^/]+)\\.json$',
            destination: '/_next/data/BUILD_ID/posts/hello.json',
          },
          {
            sourceRegex: '^/posts/(?<slug>[^/]+)$',
            destination: '/posts/hello',
          },
        ],
        onMatch: [],
        fallback: [],
        shouldNormalizeNextData: true,
      },
      pathnames: ['/posts/hello', '/_next/data/BUILD_ID/posts/hello.json'], // Both exist
    })

    const result = await resolveRoutes(params)

    // Should match the normalized path with the second dynamic route
    expect(result.matchedPathname).toBe('/posts/hello')
    expect(result.routeMatches).toEqual({
      '1': 'hello',
      slug: 'hello',
    })
  })
})
