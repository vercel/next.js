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

describe('Dynamic Routes After afterFiles Rewrites', () => {
  it('should check dynamic routes after first afterFiles rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/blog/my-post'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/blog/([^/]+)$',
            destination: '/posts/$1',
          },
        ],
        dynamicRoutes: [
          {
            sourceRegex: '^/posts/(?<slug>[^/]+)$',
            destination: '/posts/my-post', // Destination matches pathname
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/posts/my-post'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/posts/my-post')
    expect(result.routeMatches).toEqual({
      '1': 'my-post',
      slug: 'my-post',
    })
  })

  it('should check dynamic routes after second afterFiles rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/content/article'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/content/(.+)$',
            destination: '/internal/$1',
          },
          {
            sourceRegex: '^/internal/(.+)$',
            destination: '/posts/$1',
          },
        ],
        dynamicRoutes: [
          {
            sourceRegex: '^/posts/(?<slug>[^/]+)$',
            destination: '/posts/article', // Destination matches pathname
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/posts/article'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/posts/article')
    expect(result.routeMatches).toEqual({
      '1': 'article',
      slug: 'article',
    })
  })

  it('should check dynamic routes after each afterFiles rewrite individually', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/step1/test'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/step1/(.+)$',
            destination: '/step2/$1',
          },
          {
            sourceRegex: '^/step2/(.+)$',
            destination: '/users/$1', // This matches dynamic route
          },
          {
            sourceRegex: '^/users/(.+)$',
            destination: '/final/$1', // Should not reach here
          },
        ],
        dynamicRoutes: [
          {
            sourceRegex: '^/users/(?<username>[^/]+)$',
            destination: '/users/test', // Destination matches pathname
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/users/test'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/users/test')
    expect(result.routeMatches).toEqual({
      '1': 'test',
      username: 'test',
    })
  })

  it('should continue to next afterFiles route if dynamic route does not match', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/blog/post'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/blog/(.+)$',
            destination: '/content/$1',
          },
          {
            sourceRegex: '^/content/(.+)$',
            destination: '/posts/$1',
          },
        ],
        dynamicRoutes: [
          {
            sourceRegex: '^/users/(?<username>[^/]+)$', // Won't match /content/post
            destination: '/users/someuser',
          },
          {
            sourceRegex: '^/posts/(?<slug>[^/]+)$', // Will match /posts/post
            destination: '/posts/post', // Destination matches pathname
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/posts/post'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/posts/post')
    expect(result.routeMatches).toEqual({
      '1': 'post',
      slug: 'post',
    })
  })

  it('should check dynamic routes with has conditions after afterFiles', async () => {
    const headers = new Headers({
      'x-user-id': '123',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/profile'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/profile$',
            destination: '/users/profile',
          },
        ],
        dynamicRoutes: [
          {
            sourceRegex: '^/users/(?<page>[^/]+)$',
            destination: '/users/profile', // Destination matches pathname
            has: [
              {
                type: 'header',
                key: 'x-user-id',
              },
            ],
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/users/profile'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/users/profile')
    expect(result.routeMatches).toEqual({
      '1': 'profile',
      page: 'profile',
    })
  })
})

describe('Dynamic Routes After fallback Rewrites', () => {
  it('should check dynamic routes after first fallback rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/unknown/page'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/catch-all/(?<path>.+)$',
            destination: '/catch-all/page', // Destination matches pathname
          },
        ],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/unknown/(.+)$',
            destination: '/catch-all/$1',
          },
        ],
      },
      pathnames: ['/catch-all/page'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/catch-all/page')
    expect(result.routeMatches).toEqual({
      '1': 'page',
      path: 'page',
    })
  })

  it('should check dynamic routes after second fallback rewrite', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/not-found'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/error/(?<code>[^/]+)$',
            destination: '/error/404', // Destination matches pathname
          },
        ],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/not-found$',
            destination: '/404',
          },
          {
            sourceRegex: '^/404$',
            destination: '/error/404',
          },
        ],
      },
      pathnames: ['/error/404'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/error/404')
    expect(result.routeMatches).toEqual({
      '1': '404',
      code: '404',
    })
  })

  it('should check dynamic routes after each fallback rewrite individually', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/missing'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/fallback/(?<type>[^/]+)$',
            destination: '/fallback/404', // Destination matches pathname
          },
        ],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/missing$',
            destination: '/fallback/404',
          },
          {
            sourceRegex: '^/fallback/(.+)$',
            destination: '/final/$1', // Should not reach here
          },
        ],
      },
      pathnames: ['/fallback/404'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/fallback/404')
    expect(result.routeMatches).toEqual({
      '1': '404',
      type: '404',
    })
  })

  it('should continue to next fallback route if dynamic route does not match', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/unknown'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/error/(?<code>[^/]+)$', // Won't match intermediate paths
            destination: '/error/500', // Destination matches pathname
          },
        ],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/unknown$',
            destination: '/temp',
          },
          {
            sourceRegex: '^/temp$',
            destination: '/error/500',
          },
        ],
      },
      pathnames: ['/error/500'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/error/500')
    expect(result.routeMatches).toEqual({
      '1': '500',
      code: '500',
    })
  })

  it('should prioritize dynamic route match over continuing fallback chain', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/start'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/users/(?<id>[^/]+)$',
            destination: '/users/123', // Destination matches pathname
          },
        ],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/start$',
            destination: '/users/123', // Matches dynamic route
          },
          {
            sourceRegex: '^/users/(.+)$',
            destination: '/should-not-reach', // Should not process this
          },
        ],
      },
      pathnames: ['/users/123'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/users/123')
    expect(result.routeMatches).toEqual({
      '1': '123',
      id: '123',
    })
  })
})

describe('Mixed afterFiles and fallback with Dynamic Routes', () => {
  it('should not check dynamic routes twice if already matched in afterFiles', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/content/article'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/content/(.+)$',
            destination: '/posts/$1',
          },
        ],
        dynamicRoutes: [
          {
            sourceRegex: '^/posts/(?<slug>[^/]+)$',
            destination: '/posts/article', // Destination matches pathname
          },
        ],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/posts/(.+)$',
            destination: '/should-not-reach',
          },
        ],
      },
      pathnames: ['/posts/article'],
    })

    const result = await resolveRoutes(params)

    // Should match in afterFiles -> dynamic routes, not reach fallback
    expect(result.matchedPathname).toBe('/posts/article')
    expect(result.routeMatches).toEqual({
      '1': 'article',
      slug: 'article',
    })
  })

  it('should reach fallback if afterFiles does not result in match', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/test'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [
          {
            sourceRegex: '^/test$',
            destination: '/intermediate',
          },
        ],
        dynamicRoutes: [
          {
            sourceRegex: '^/posts/(?<slug>[^/]+)$',
            destination: '/posts/fallback', // Destination matches pathname
          },
        ],
        onMatch: [],
        fallback: [
          {
            sourceRegex: '^/intermediate$',
            destination: '/posts/fallback',
          },
        ],
      },
      pathnames: ['/posts/fallback'],
    })

    const result = await resolveRoutes(params)

    // Should go through: test -> intermediate (no match) -> fallback -> posts/fallback (dynamic match)
    expect(result.matchedPathname).toBe('/posts/fallback')
    expect(result.routeMatches).toEqual({
      '1': 'fallback',
      slug: 'fallback',
    })
  })
})
