import {
  buildSwitchyardRouteTable,
  patternOf,
  type SwitchyardRouteTableInput,
} from 'next/dist/server/lib/switchyard-route-table'
import { RouteKind } from 'next/dist/server/route-kind'

// The route table Node sends Switchyard: page paths
// become the segment lists Switchyard matches, and an app gets no direct
// routes when a rule Node runs before routing could apply.
describe('switchyard-route-table', () => {
  describe('patternOf', () => {
    it.each([
      ['/', []],
      ['/api/users', ['api', 'users']],
      ['/api/users/[id]', ['api', 'users', { param: 'id' }]],
      ['/docs/[...path]', ['docs', { rest: 'path', min: 1 }]],
      ['/docs/[[...path]]', ['docs', { rest: 'path', min: 0 }]],
      ['/[lang]/[...path]', [{ param: 'lang' }, { rest: 'path', min: 1 }]],
    ])('reads %s', (page, pattern) => {
      expect(patternOf(page)).toEqual(pattern)
    })

    it.each([
      // A catch-all can only end a pattern.
      '/docs/[...path]/edit',
      '/docs/[[...path]]/edit',
      // Interception routes.
      '/feed/(.)[id]',
      '/feed/(..)photo/[id]',
      // Brackets that aren't a whole-segment parameter.
      '/a[b]',
      '/[id]x',
    ])('refuses %s', (page) => {
      expect(patternOf(page)).toBeUndefined()
    })
  })

  describe('buildSwitchyardRouteTable', () => {
    const goPages: Record<string, string> = {
      '/api/health': '/api/health/route',
      '/api/users/[id]': '/api/users/[id]/route',
    }
    const input = (
      overrides: Partial<SwitchyardRouteTableInput> = {}
    ): SwitchyardRouteTableInput => ({
      goRoutes: true,
      basePath: '',
      hasI18n: false,
      trailingSlash: false,
      compress: false,
      useFileSystemPublicRoutes: true,
      hasMiddleware: false,
      hasInstrumentation: false,
      keepsInternalHeaders: false,
      headers: [],
      onMatchHeaders: [],
      redirects: [{ internal: true }],
      beforeFilesRewrites: [],
      afterFilesRewrites: [],
      publicFiles: ['/favicon.ico'],
      appFiles: ['/', '/api/health', '/api/users/new'],
      pageFiles: ['/legacy'],
      dynamicRoutes: [
        { page: '/_next/data/[...path]', dataRouteRegex: '^/_next/data' },
        { page: '/api/users/[id]' },
        { page: '/blog/[slug]' },
      ],
      appRoute: (pathname) =>
        goPages[pathname]
          ? { kind: RouteKind.APP_ROUTE_GO, page: goPages[pathname] }
          : { kind: RouteKind.APP_PAGE, page: `${pathname}/page` },
      internalHeaders: ['x-matched-path'],
      maxHeaderBytes: 16384,
      ...overrides,
    })

    it("splits Node's routes into Node's and route.go's, in Node's order", () => {
      const table = buildSwitchyardRouteTable(input())
      expect(table).toMatchObject({
        contract: { version: 1 },
        nodeExact: ['/', '/api/users/new', '/favicon.ico', '/legacy'],
        goExact: { '/api/health': '/api/health/route' },
        dynamic: [
          {
            path: ['api', 'users', { param: 'id' }],
            go: '/api/users/[id]/route',
          },
          { path: ['blog', { param: 'slug' }] },
        ],
      })
    })

    it.each<[string, Partial<SwitchyardRouteTableInput>]>([
      ['experimental.goRoutes is off', { goRoutes: false }],
      ['proxy', { hasMiddleware: true }],
      ['instrumentation', { hasInstrumentation: true }],
      ['i18n', { hasI18n: true }],
      ['headers', { headers: [{}] }],
      ['rewrites', { beforeFilesRewrites: [{}] }],
      ['rewrites', { afterFilesRewrites: [{}] }],
      ['trailingSlash', { trailingSlash: true }],
      ['redirects', { redirects: [{ internal: true }, {}] }],
      ['basePath', { basePath: '/shop' }],
      ['compress', { compress: true }],
      [
        'unsupported route pattern /feed/(.)[id]',
        { dynamicRoutes: [{ page: '/feed/(.)[id]' }] },
      ],
      ['no route.go routes', { appRoute: () => undefined }],
    ])('gives no direct routes because of %s', (reason, overrides) => {
      expect(buildSwitchyardRouteTable(input(overrides))).toEqual({
        contract: { version: 1 },
        reason,
      })
    })

    it('sends requests with a header a header rule reads to Node', () => {
      const table = buildSwitchyardRouteTable(
        input({
          onMatchHeaders: [
            { source: '/:path*', has: [{ type: 'header', key: 'RSC' }] },
            { source: '/_next/data/(.*)' },
          ],
        })
      )
      expect(table).toMatchObject({ nodeRequestHeaders: ['rsc'] })
    })
  })
})
