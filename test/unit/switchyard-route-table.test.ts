import {
  buildSwitchyardRouteTable,
  type SwitchyardRouteTableInput,
} from 'next/dist/server/lib/switchyard-route-table'
import { RouteKind } from 'next/dist/server/route-kind'

// The route table Node sends Switchyard: which exact paths are route.go
// routes, and no direct routes at all when a rule Node runs before routing
// could apply.
describe('switchyard-route-table', () => {
  describe('buildSwitchyardRouteTable', () => {
    const goPages: Record<string, string> = {
      '/api/health': '/api/health/route',
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
      redirects: [{ internal: true }],
      beforeFilesRewrites: [],
      afterFilesRewrites: [],
      publicFiles: ['/favicon.ico'],
      appFiles: ['/', '/api/health', '/api/users/new'],
      pageFiles: ['/legacy'],
      appRoute: (pathname) =>
        goPages[pathname]
          ? { kind: RouteKind.APP_ROUTE_GO, page: goPages[pathname] }
          : { kind: RouteKind.APP_PAGE, page: `${pathname}/page` },
      ...overrides,
    })

    it("splits Node's routes into Node's and route.go's", () => {
      const table = buildSwitchyardRouteTable(input())
      expect(table).toMatchObject({
        contract: { version: 1 },
        nodeExact: ['/', '/api/users/new', '/favicon.ico', '/legacy'],
        goExact: { '/api/health': '/api/health/route' },
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
      ['no route.go routes', { appRoute: () => undefined }],
    ])('gives no direct routes because of %s', (reason, overrides) => {
      expect(buildSwitchyardRouteTable(input(overrides))).toEqual({
        contract: { version: 1 },
        reason,
      })
    })
  })
})
