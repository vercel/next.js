import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  buildSwitchyardRouteTable,
  collectSwitchyardRouteTable,
  patternOf,
  type SwitchyardConfig,
  type SwitchyardFsChecker,
  type SwitchyardRouteTableInput,
} from 'next/dist/server/lib/switchyard-route-table'
import { RouteKind } from 'next/dist/server/route-kind'
import { getMiddlewareRouteMatcher } from 'next/dist/shared/lib/router/utils/middleware-route-matcher'

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
      ['/[[...slug]]', [{ rest: 'slug', min: 0 }]],
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
      '/feed/(.)[[...rest]]',
      // Brackets that aren't a whole-segment parameter.
      '/a[b]',
      '/[id]x',
      // The router reads parameter a, then the literal "[b]".
      '/x/[a][b]',
      // The router reads "[]" as a literal, not a parameter.
      '/[]/[id]',
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
      compress: true,
      useFileSystemPublicRoutes: true,
      hasMiddleware: false,
      hasInstrumentation: false,
      directOff: false,
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

    it('passes the basePath to Switchyard', () => {
      expect(
        buildSwitchyardRouteTable(input({ basePath: '/docs' }))
      ).toMatchObject({
        basePath: '/docs',
        goExact: { '/api/health': '/api/health/route' },
      })
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
      ['__NEXT_EXPERIMENTAL_SWITCHYARD_DIRECT=0', { directOff: true }],
      ['experimental.goRoutes is off', { goRoutes: false }],
      ['proxy', { hasMiddleware: true }],
      ['instrumentation', { hasInstrumentation: true }],
      ['i18n', { hasI18n: true }],
      ['headers', { headers: [{}] }],
      ['rewrites', { beforeFilesRewrites: [{}] }],
      ['rewrites', { afterFilesRewrites: [{}] }],
      ['trailingSlash', { trailingSlash: true }],
      ['redirects', { redirects: [{ internal: true }, {}] }],
      ['useFileSystemPublicRoutes', { useFileSystemPublicRoutes: false }],
      ['NEXT_PRIVATE_TEST_HEADERS', { keepsInternalHeaders: true }],
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
      onMatchHeaders: [],
      redirects: [],
      rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
      publicFolderItems: new Set(),
      appFiles: new Set(['/api/health']),
      pageFiles: new Set(),
      getDynamicRoutes: () => [],
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
