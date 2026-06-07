/* eslint-env jest */

import { resolveRoutes } from '../../../packages/next-routing/src/resolve-routes'
const {
  defaultConfig,
} = require('../../../packages/next/src/server/config-shared')
const {
  buildCustomRoute,
} = require('../../../packages/next/src/server/lib/router-utils/filesystem')
const {
  createNextRoutingServerState,
  mapNextRoutingResultToResolveRoutesResult,
} = require('../../../packages/next/src/server/lib/router-utils/next-routing-adapter')
const {
  getRouteMatcher,
} = require('../../../packages/next/src/shared/lib/router/utils/route-matcher')
const {
  getNamedRouteRegex,
} = require('../../../packages/next/src/shared/lib/router/utils/route-regex')

type NextConfigRuntime = any
type FilesystemDynamicRoute = any
type FsChecker = any

function createConfig(
  overrides: Partial<NextConfigRuntime> = {}
): NextConfigRuntime {
  const baseConfig = defaultConfig as unknown as NextConfigRuntime
  return {
    ...baseConfig,
    ...overrides,
    experimental: {
      ...baseConfig.experimental,
      ...overrides.experimental,
    },
  }
}

function createReadableStream(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.close()
    },
  })
}

function createDynamicRoute(page: string): FilesystemDynamicRoute {
  const routeRegex = getNamedRouteRegex(page, {
    prefixRouteKeys: true,
  })
  return {
    page,
    regex: routeRegex.re.toString(),
    namedRegex: routeRegex.namedRegex,
    routeKeys: routeRegex.routeKeys,
    match: getRouteMatcher(routeRegex),
  }
}

function createFsChecker({
  headers = [],
  redirects = [],
  rewrites = {},
  onMatchHeaders = [],
  dynamicRoutes = [],
  appFiles = [],
  pageFiles = [],
  nextDataRoutes = [],
  outputs = {},
  buildId = 'BUILD_ID',
}: {
  headers?: any[]
  redirects?: any[]
  rewrites?: Record<string, any[]>
  onMatchHeaders?: any[]
  dynamicRoutes?: FilesystemDynamicRoute[]
  appFiles?: string[]
  pageFiles?: string[]
  nextDataRoutes?: string[]
  outputs?: Record<string, { type: 'pageFile'; itemPath: string }>
  buildId?: string
} = {}) {
  const outputMap = new Map(Object.entries(outputs))

  return {
    headers,
    redirects,
    rewrites: {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
      ...rewrites,
    },
    onMatchHeaders,
    buildId,
    appFiles: new Set(appFiles),
    pageFiles: new Set(pageFiles),
    nextDataRoutes: new Set(nextDataRoutes),
    getDynamicRoutes() {
      return dynamicRoutes
    },
    async getItem(pathname: string) {
      return outputMap.get(pathname) ?? null
    },
  } as unknown as FsChecker
}

async function resolveWithNextRouting(
  state: ReturnType<typeof createNextRoutingServerState>,
  pathname: string,
  headers = new Headers()
) {
  return resolveRoutes({
    url: new URL(pathname, 'https://example.com'),
    buildId: state.buildId,
    basePath: state.basePath,
    i18n: state.i18n,
    requestBody: createReadableStream(),
    headers,
    pathnames: state.pathnames,
    routes: state.routes,
    invokeMiddleware: async () => ({}),
  })
}

describe('next routing server adapter', () => {
  it('translates live header routes into @next/routing beforeMiddleware routes', async () => {
    const fsChecker = createFsChecker({
      headers: [
        buildCustomRoute('header', {
          source: '/docs/:slug',
          headers: [{ key: 'x-doc-slug', value: ':slug' }],
        }),
      ],
      pageFiles: ['/docs/intro'],
    })

    const state = createNextRoutingServerState(fsChecker, createConfig())
    const result = await resolveWithNextRouting(state, '/docs/intro')

    expect(result.resolvedPathname).toBe('/docs/intro')
    expect(result.resolvedHeaders?.get('x-doc-slug')).toBe('intro')
  })

  it('translates live redirect routes into @next/routing redirect headers', async () => {
    const fsChecker = createFsChecker({
      redirects: [
        buildCustomRoute('redirect', {
          source: '/old/:slug',
          destination: '/new/:slug',
          permanent: true,
        }),
      ],
    })

    const state = createNextRoutingServerState(fsChecker, createConfig())
    const result = await resolveWithNextRouting(state, '/old/post?from=1')

    expect(result.status).toBe(308)
    expect(result.resolvedHeaders?.get('location')).toBe('/new/post?from=1')
  })

  it('translates live beforeFiles rewrites into @next/routing rewrite routes', async () => {
    const fsChecker = createFsChecker({
      rewrites: {
        beforeFiles: [
          buildCustomRoute('before_files_rewrite', {
            source: '/docs/:slug',
            destination: '/page/:slug',
          }),
        ],
      },
      pageFiles: ['/page/intro'],
    })

    const state = createNextRoutingServerState(fsChecker, createConfig())
    const result = await resolveWithNextRouting(state, '/docs/intro?draft=1')

    expect(result.resolvedPathname).toBe('/page/intro')
    expect(result.invocationTarget).toEqual({
      pathname: '/page/intro',
      query: {
        draft: '1',
      },
    })
  })

  it('translates live afterFiles and fallback external rewrites', async () => {
    const fsChecker = createFsChecker({
      rewrites: {
        afterFiles: [
          buildCustomRoute('rewrite', {
            source: '/proxy',
            destination: 'https://backend.example.test/api',
          }),
        ],
        fallback: [
          buildCustomRoute('rewrite', {
            source: '/fallback-proxy',
            destination: 'https://fallback.example.test/api',
          }),
        ],
      },
    })

    const state = createNextRoutingServerState(fsChecker, createConfig())
    const afterFilesResult = await resolveWithNextRouting(state, '/proxy')
    const fallbackResult = await resolveWithNextRouting(
      state,
      '/fallback-proxy'
    )

    expect(afterFilesResult.externalRewrite?.toString()).toBe(
      'https://backend.example.test/api'
    )
    expect(fallbackResult.externalRewrite?.toString()).toBe(
      'https://fallback.example.test/api'
    )
  })

  it('translates filesystem dynamic routes with invocation query params', async () => {
    const dynamicRoute = createDynamicRoute('/blog/[slug]')
    const fsChecker = createFsChecker({
      dynamicRoutes: [dynamicRoute],
      pageFiles: ['/blog/[slug]'],
    })

    const state = createNextRoutingServerState(fsChecker, createConfig())
    const result = await resolveWithNextRouting(state, '/blog/hello?draft=1')

    expect(result.resolvedPathname).toBe('/blog/[slug]')
    expect(result.invocationTarget).toEqual({
      pathname: '/blog/hello',
      query: {
        draft: '1',
        nxtPslug: 'hello',
      },
    })
  })

  it('collects pathnames from route outputs and skips invoked outputs', () => {
    const fsChecker = createFsChecker({
      appFiles: ['/app'],
      pageFiles: ['/page'],
      nextDataRoutes: ['/data-page'],
      dynamicRoutes: [createDynamicRoute('/blog/[slug]')],
    })

    const state = createNextRoutingServerState(fsChecker, createConfig(), {
      additionalPathnames: ['/public.txt', '/app'],
      invokedOutputs: new Set(['/page']),
    })

    expect(state.pathnames).toEqual([
      '/app',
      '/data-page',
      '/blog/[slug]',
      '/public.txt',
    ])
  })

  it('keeps custom routes out of minimal mode routing input', () => {
    const fsChecker = createFsChecker({
      headers: [
        buildCustomRoute('header', {
          source: '/minimal',
          headers: [{ key: 'x-minimal', value: 'ignored' }],
        }),
      ],
      redirects: [
        buildCustomRoute('redirect', {
          source: '/minimal',
          destination: '/redirected',
          permanent: false,
        }),
      ],
      rewrites: {
        beforeFiles: [
          buildCustomRoute('before_files_rewrite', {
            source: '/minimal',
            destination: '/rewritten',
          }),
        ],
        fallback: [
          buildCustomRoute('rewrite', {
            source: '/minimal-fallback',
            destination: '/fallback',
          }),
        ],
      },
      dynamicRoutes: [createDynamicRoute('/dynamic/[slug]')],
    })

    const state = createNextRoutingServerState(fsChecker, createConfig(), {
      minimalMode: true,
    })

    expect(state.routes.beforeMiddleware).toEqual([])
    expect(state.routes.beforeFiles).toEqual([])
    expect(state.routes.afterFiles).toEqual([])
    expect(state.routes.fallback).toEqual([])
    expect(state.routes.dynamicRoutes).toHaveLength(1)
  })

  it('translates onMatch headers for resolved outputs', async () => {
    const fsChecker = createFsChecker({
      onMatchHeaders: [
        buildCustomRoute('header', {
          source: '/asset',
          headers: [
            { key: 'cache-control', value: 'public, max-age=31536000' },
          ],
        }),
      ],
      pageFiles: ['/asset'],
    })

    const state = createNextRoutingServerState(fsChecker, createConfig())
    const result = await resolveWithNextRouting(state, '/asset')

    expect(result.resolvedPathname).toBe('/asset')
    expect(result.resolvedHeaders?.get('cache-control')).toBe(
      'public, max-age=31536000'
    )
  })

  it('maps @next/routing resolved outputs to live resolver results', async () => {
    const matchedOutput = { type: 'pageFile' as const, itemPath: '/page' }
    const fsChecker = createFsChecker({
      outputs: {
        '/page': matchedOutput,
      },
    })

    const result = await mapNextRoutingResultToResolveRoutesResult({
      result: {
        resolvedPathname: '/page',
        invocationTarget: {
          pathname: '/page',
          query: {
            draft: '1',
          },
        },
        resolvedHeaders: new Headers({
          'x-route': 'matched',
        }),
      },
      fsChecker,
      initUrl: new URL('https://example.com/source?draft=1'),
      requestUrl: '/source?draft=1',
    })

    expect(result).toMatchObject({
      finished: true,
      matchedOutput,
      resHeaders: {
        'x-route': 'matched',
      },
    })
    expect(result.parsedUrl.pathname).toBe('/page')
    expect(result.parsedUrl.query).toEqual({ draft: '1' })
  })

  it('maps @next/routing no-match results without finishing', async () => {
    const fsChecker = createFsChecker()

    const result = await mapNextRoutingResultToResolveRoutesResult({
      result: {
        resolvedHeaders: new Headers(),
      },
      fsChecker,
      initUrl: new URL('https://example.com/missing'),
      requestUrl: '/missing',
    })

    expect(result.finished).toBe(false)
    expect(result.matchedOutput).toBeNull()
    expect(result.parsedUrl.pathname).toBe('/missing')
  })

  it('maps @next/routing redirect results to live redirect results', async () => {
    const fsChecker = createFsChecker()

    const result = await mapNextRoutingResultToResolveRoutesResult({
      result: {
        redirect: {
          url: new URL('https://example.com/new?from=1'),
          status: 308,
        },
      },
      fsChecker,
      initUrl: new URL('https://example.com/old?from=1'),
      requestUrl: '/old?from=1',
    })

    expect(result.finished).toBe(true)
    expect(result.statusCode).toBe(308)
    expect(result.resHeaders).toBeNull()
    expect(result.parsedUrl.pathname).toBe('/new')
    expect(result.parsedUrl.search).toBe('from=1')
  })

  it('maps @next/routing status plus location headers as redirects', async () => {
    const fsChecker = createFsChecker()

    const result = await mapNextRoutingResultToResolveRoutesResult({
      result: {
        status: 307,
        resolvedHeaders: new Headers({
          location: '/temporary?from=1',
        }),
      },
      fsChecker,
      initUrl: new URL('https://example.com/old?from=1'),
      requestUrl: '/old?from=1',
    })

    expect(result.finished).toBe(true)
    expect(result.statusCode).toBe(307)
    expect(result.resHeaders).toBeNull()
    expect(result.parsedUrl.pathname).toBe('/temporary')
    expect(result.parsedUrl.search).toBe('from=1')
  })

  it('maps @next/routing external rewrites to finished live results', async () => {
    const fsChecker = createFsChecker()

    const result = await mapNextRoutingResultToResolveRoutesResult({
      result: {
        externalRewrite: new URL('https://backend.example.test/api'),
        resolvedHeaders: new Headers({
          'x-proxy': '1',
        }),
      },
      fsChecker,
      initUrl: new URL('https://example.com/proxy'),
      requestUrl: '/proxy',
    })

    expect(result.finished).toBe(true)
    expect(result.resHeaders).toEqual({ 'x-proxy': '1' })
    expect(result.parsedUrl.protocol).toBe('https:')
    expect(result.parsedUrl.hostname).toBe('backend.example.test')
    expect(result.parsedUrl.pathname).toBe('/api')
  })
})
