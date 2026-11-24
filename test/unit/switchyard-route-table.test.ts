import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  buildSwitchyardRouteTable,
  collectSwitchyardRouteTable,
  type SwitchyardConfig,
  type SwitchyardFsChecker,
  type SwitchyardRouteTableInput,
} from 'next/dist/server/lib/switchyard-route-table'
import { RouteKind } from 'next/dist/server/route-kind'
import { getMiddlewareRouteMatcher } from 'next/dist/shared/lib/router/utils/middleware-route-matcher'

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
      ['useFileSystemPublicRoutes', { useFileSystemPublicRoutes: false }],
      ['NEXT_PRIVATE_TEST_HEADERS', { keepsInternalHeaders: true }],
      ['no route.go routes', { appRoute: () => undefined }],
    ])('gives no direct routes because of %s', (reason, overrides) => {
      expect(buildSwitchyardRouteTable(input(overrides))).toEqual({
        contract: { version: 1 },
        reason,
      })
    })
  })
  // collectSwitchyardRouteTable reads the router's own data; these check the
  // parts that aren't a plain copy.
  describe('collectSwitchyardRouteTable', () => {
    let dir: string
    // Tests may run with NEXT_PRIVATE_TEST_HEADERS set; start each without
    // it and put the original back afterwards.
    const testHeaders = process.env.NEXT_PRIVATE_TEST_HEADERS
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchyard-route-table-'))
      delete process.env.NEXT_PRIVATE_TEST_HEADERS
    })
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true })
      if (testHeaders === undefined) {
        delete process.env.NEXT_PRIVATE_TEST_HEADERS
      } else {
        process.env.NEXT_PRIVATE_TEST_HEADERS = testHeaders
      }
    })

    const config: SwitchyardConfig = {
      distDir: '.next',
      basePath: '',
      i18n: null,
      trailingSlash: false,
      compress: false,
      useFileSystemPublicRoutes: true,
      experimental: { goRoutes: true },
    }
    const fsChecker = (
      overrides: Partial<SwitchyardFsChecker> = {}
    ): SwitchyardFsChecker => ({
      // The router's matcher when the app has no proxy.
      getMiddlewareMatchers: () => () => false,
      headers: [],
      redirects: [],
      rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
      publicFolderItems: new Set(),
      appFiles: new Set(['/api/health']),
      pageFiles: new Set(),
      getRouteDefinition: (_type, pathname) => ({
        kind: RouteKind.APP_ROUTE_GO,
        bundlePath: '',
        filename: '',
        page: `${pathname}/route`,
        pathname,
      }),
      ...overrides,
    })
    const collect = (overrides?: Partial<SwitchyardFsChecker>) =>
      collectSwitchyardRouteTable({
        dir,
        config,
        fsChecker: fsChecker(overrides),
      })

    it("builds the table from the router's routes", () => {
      expect(collect()).toMatchObject({
        goExact: { '/api/health': '/api/health/route' },
      })
    })

    it('sees a proxy as the router does', () => {
      const matcher = getMiddlewareRouteMatcher([
        { regexp: '^/.*$', originalSource: '/:path*' },
      ])
      expect(collect({ getMiddlewareMatchers: () => matcher })).toEqual({
        contract: { version: 1 },
        reason: 'proxy',
      })
    })

    it('finds the instrumentation hook in the server output', () => {
      fs.mkdirSync(path.join(dir, '.next', 'server'), { recursive: true })
      fs.writeFileSync(
        path.join(dir, '.next', 'server', 'instrumentation.js'),
        ''
      )
      expect(collect()).toEqual({
        contract: { version: 1 },
        reason: 'instrumentation',
      })
    })

    it('reads NEXT_PRIVATE_TEST_HEADERS', () => {
      process.env.NEXT_PRIVATE_TEST_HEADERS = '1'
      expect(collect()).toEqual({
        contract: { version: 1 },
        reason: 'NEXT_PRIVATE_TEST_HEADERS',
      })
    })
  })
})
