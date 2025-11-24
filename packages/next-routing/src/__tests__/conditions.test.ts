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

describe('Has conditions', () => {
  it('should match route with header condition', async () => {
    const headers = new Headers({
      'x-user-role': 'admin',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/dashboard'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/dashboard$',
            destination: '/admin-dashboard',
            has: [
              {
                type: 'header',
                key: 'x-user-role',
                value: 'admin',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/admin-dashboard'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/admin-dashboard')
  })

  it('should match route with cookie condition', async () => {
    const headers = new Headers({
      cookie: 'session=abc123; theme=dark',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/page'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/page$',
            destination: '/dark-theme-page',
            has: [
              {
                type: 'cookie',
                key: 'theme',
                value: 'dark',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/dark-theme-page'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/dark-theme-page')
  })

  it('should match route with query condition', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/page?preview=true'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/page$',
            destination: '/preview-page',
            has: [
              {
                type: 'query',
                key: 'preview',
                value: 'true',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/preview-page'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/preview-page')
  })

  it('should match route with host condition', async () => {
    const params = createBaseParams({
      url: new URL('https://subdomain.example.com/'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/$',
            destination: '/subdomain-home',
            has: [
              {
                type: 'host',
                value: 'subdomain.example.com',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/subdomain-home'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/subdomain-home')
  })

  it('should match when has condition checks key existence only', async () => {
    const headers = new Headers({
      'x-feature-flag': 'enabled',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/feature'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/feature$',
            destination: '/feature-enabled',
            has: [
              {
                type: 'header',
                key: 'x-feature-flag',
                // No value - just check existence
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/feature-enabled'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/feature-enabled')
  })

  it('should match with regex pattern in has condition', async () => {
    const headers = new Headers({
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/$',
            destination: '/mobile',
            has: [
              {
                type: 'header',
                key: 'user-agent',
                value: '.*iPhone.*',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/mobile'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/mobile')
  })

  it('should require ALL has conditions to match', async () => {
    const headers = new Headers({
      'x-user-role': 'admin',
      'x-feature': 'beta',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/feature'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/feature$',
            destination: '/admin-beta-feature',
            has: [
              {
                type: 'header',
                key: 'x-user-role',
                value: 'admin',
              },
              {
                type: 'header',
                key: 'x-feature',
                value: 'beta',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/admin-beta-feature'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/admin-beta-feature')
  })

  it('should NOT match when one has condition fails', async () => {
    const headers = new Headers({
      'x-user-role': 'admin',
      // Missing x-feature header
    })

    const params = createBaseParams({
      url: new URL('https://example.com/feature'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/feature$',
            destination: '/admin-beta-feature',
            has: [
              {
                type: 'header',
                key: 'x-user-role',
                value: 'admin',
              },
              {
                type: 'header',
                key: 'x-feature',
                value: 'beta',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/feature'],
    })

    const result = await resolveRoutes(params)

    // Should not match the route, so stays at /feature
    expect(result.matchedPathname).toBe('/feature')
  })
})

describe('Missing conditions', () => {
  it('should match when missing condition is not present', async () => {
    const headers = new Headers({
      'x-feature': 'enabled',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/page'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/page$',
            destination: '/no-debug-page',
            missing: [
              {
                type: 'header',
                key: 'x-debug',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/no-debug-page'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/no-debug-page')
  })

  it('should NOT match when missing condition is present', async () => {
    const headers = new Headers({
      'x-debug': 'true',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/page'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/page$',
            destination: '/no-debug-page',
            missing: [
              {
                type: 'header',
                key: 'x-debug',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/page'],
    })

    const result = await resolveRoutes(params)

    // Route should not match, stays at /page
    expect(result.matchedPathname).toBe('/page')
  })

  it('should match when missing cookie is not present', async () => {
    const headers = new Headers({
      cookie: 'session=abc123',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/page'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/page$',
            destination: '/no-tracking',
            missing: [
              {
                type: 'cookie',
                key: 'tracking',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/no-tracking'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/no-tracking')
  })

  it('should match when missing query is not present', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/page?foo=bar'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/page$',
            destination: '/no-preview',
            missing: [
              {
                type: 'query',
                key: 'preview',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/no-preview'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/no-preview')
  })

  it('should require ALL missing conditions to be absent', async () => {
    const headers = new Headers({
      'x-feature': 'enabled',
      // No x-debug or x-admin headers
    })

    const params = createBaseParams({
      url: new URL('https://example.com/page'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/page$',
            destination: '/standard-page',
            missing: [
              {
                type: 'header',
                key: 'x-debug',
              },
              {
                type: 'header',
                key: 'x-admin',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/standard-page'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/standard-page')
  })
})

describe('Combined has and missing conditions', () => {
  it('should match when has is satisfied and missing is absent', async () => {
    const headers = new Headers({
      'x-user-role': 'member',
      // No x-admin header
    })

    const params = createBaseParams({
      url: new URL('https://example.com/content'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/content$',
            destination: '/member-content',
            has: [
              {
                type: 'header',
                key: 'x-user-role',
                value: 'member',
              },
            ],
            missing: [
              {
                type: 'header',
                key: 'x-admin',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/member-content'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/member-content')
  })

  it('should NOT match when has is satisfied but missing is present', async () => {
    const headers = new Headers({
      'x-user-role': 'member',
      'x-admin': 'true',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/content'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/content$',
            destination: '/member-content',
            has: [
              {
                type: 'header',
                key: 'x-user-role',
                value: 'member',
              },
            ],
            missing: [
              {
                type: 'header',
                key: 'x-admin',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/content'],
    })

    const result = await resolveRoutes(params)

    // Should not match, stays at /content
    expect(result.matchedPathname).toBe('/content')
  })

  it('should NOT match when has fails even if missing is satisfied', async () => {
    const headers = new Headers({
      'x-user-role': 'guest',
      // No x-admin header
    })

    const params = createBaseParams({
      url: new URL('https://example.com/content'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [
          {
            sourceRegex: '^/content$',
            destination: '/member-content',
            has: [
              {
                type: 'header',
                key: 'x-user-role',
                value: 'member',
              },
            ],
            missing: [
              {
                type: 'header',
                key: 'x-admin',
              },
            ],
          },
        ],
        afterFiles: [],
        dynamicRoutes: [],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/content'],
    })

    const result = await resolveRoutes(params)

    // Should not match, stays at /content
    expect(result.matchedPathname).toBe('/content')
  })
})

describe('Dynamic routes', () => {
  it('should match dynamic route and extract params', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/posts/123'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/posts/([^/]+)$',
            destination: '/post',
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/posts/123'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/posts/123')
    expect(result.routeMatches).toEqual({
      '1': '123',
    })
  })

  it('should match dynamic route with named groups', async () => {
    const params = createBaseParams({
      url: new URL('https://example.com/users/alice/posts/456'),
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/users/(?<username>[^/]+)/posts/(?<postId>[^/]+)$',
            destination: '/user-post',
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/users/alice/posts/456'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/users/alice/posts/456')
    expect(result.routeMatches).toEqual({
      '1': 'alice',
      '2': '456',
      username: 'alice',
      postId: '456',
    })
  })

  it('should check has/missing conditions on dynamic routes', async () => {
    const headers = new Headers({
      'x-authenticated': 'true',
    })

    const params = createBaseParams({
      url: new URL('https://example.com/profile/john'),
      headers,
      routes: {
        beforeMiddleware: [],
        beforeFiles: [],
        afterFiles: [],
        dynamicRoutes: [
          {
            sourceRegex: '^/profile/([^/]+)$',
            destination: '/user-profile',
            has: [
              {
                type: 'header',
                key: 'x-authenticated',
                value: 'true',
              },
            ],
          },
        ],
        onMatch: [],
        fallback: [],
      },
      pathnames: ['/profile/john'],
    })

    const result = await resolveRoutes(params)

    expect(result.matchedPathname).toBe('/profile/john')
    expect(result.routeMatches).toEqual({
      '1': 'john',
    })
  })
})
