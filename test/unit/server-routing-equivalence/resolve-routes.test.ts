/* eslint-env jest */

import type { IncomingHttpHeaders } from 'http'

const {
  NEXT_REWRITTEN_PATH_HEADER,
  NEXT_REWRITTEN_QUERY_HEADER,
  RSC_HEADER,
} = require('../../../packages/next/src/client/components/app-router-headers')
const {
  defaultConfig,
} = require('../../../packages/next/src/server/config-shared')
const {
  createRequestResponseMocks,
} = require('../../../packages/next/src/server/lib/mock-request')
const {
  buildCustomRoute,
} = require('../../../packages/next/src/server/lib/router-utils/filesystem')
const {
  getResolveRoutes,
} = require('../../../packages/next/src/server/lib/router-utils/resolve-routes')
const {
  getRequestMeta,
} = require('../../../packages/next/src/server/request-meta')
const {
  getRouteMatcher,
} = require('../../../packages/next/src/shared/lib/router/utils/route-matcher')
const {
  getNamedRouteRegex,
} = require('../../../packages/next/src/shared/lib/router/utils/route-regex')

type NextConfigRuntime = any
type FilesystemDynamicRoute = any
type FsOutput = any
type FsChecker = any
type ResolveRoutesOptions = any

type FsCheckerOverrides = {
  headers?: any[]
  redirects?: any[]
  rewrites?: Record<string, any[]>
  outputs?: Record<string, FsOutput>
  dynamicRoutes?: FilesystemDynamicRoute[]
  onMatchHeaders?: any[]
  exportPathMapRoutes?: any
  middlewareMatcher?: any
  handleLocale?: (pathname: string) => { pathname: string; locale?: string }
  buildId?: string
}

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

function createOutput(
  itemPath: string,
  type: string = 'pageFile',
  extra: Record<string, any> = {}
): FsOutput {
  return { type, itemPath, ...extra }
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

function createMiddlewareMatcher(
  predicate: (pathname: string) => boolean = () => true
) {
  return function middlewareMatcher(pathname: string) {
    return predicate(pathname)
  }
}

function createFsChecker({
  headers = [],
  redirects = [],
  rewrites = {},
  outputs = {},
  dynamicRoutes = [],
  onMatchHeaders = [],
  exportPathMapRoutes,
  middlewareMatcher,
  handleLocale = (pathname: string) => ({ pathname, locale: undefined }),
  buildId = 'BUILD_ID',
}: FsCheckerOverrides = {}) {
  const outputMap = new Map(Object.entries(outputs))
  const getItem = jest.fn(async (pathname: string) => {
    return outputMap.get(pathname) ?? null
  })

  const fsChecker = {
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
    handleLocale,
    appFiles: new Set<string>(),
    pageFiles: new Set<string>(),
    staticMetadataFiles: new Map<string, string>(),
    dynamicRoutes,
    nextDataRoutes: new Set<string>(),
    exportPathMapRoutes,
    devVirtualFsItems: new Set<string>(),
    previewProps: {
      previewModeId: 'preview-id',
      previewModeSigningKey: 'preview-signing-key',
      previewModeEncryptionKey: 'preview-encryption-key',
    },
    middlewareMatcher,
    ensureCallback() {},
    getItem,
    getDynamicRoutes() {
      return dynamicRoutes
    },
    getMiddlewareMatchers() {
      return middlewareMatcher
    },
  } as unknown as FsChecker

  return {
    fsChecker,
    getItem,
  }
}

async function resolveLiveRoute({
  url,
  headers,
  config = createConfig(),
  fsChecker,
  opts = {},
  renderServerOpts = {
    dir: '/app',
    port: 3000,
    dev: false,
    hostname: 'localhost',
    onDevServerCleanup: undefined,
    serverFields: {},
    experimentalTestProxy: false,
    experimentalHttpsServer: false,
    distDir: '.next',
    experimentalFeatures: [],
    cacheComponents: false,
  },
  isUpgradeReq = false,
  invokedOutputs,
  middlewareResponse,
  middlewareError,
  ensureMiddleware = jest.fn(async () => {}),
}: {
  url: string
  headers?: IncomingHttpHeaders
  config?: NextConfigRuntime
  fsChecker: FsChecker
  opts?: Partial<ResolveRoutesOptions>
  renderServerOpts?: any
  isUpgradeReq?: boolean
  invokedOutputs?: Set<string>
  middlewareResponse?: Response
  middlewareError?: unknown
  ensureMiddleware?: (url?: string) => Promise<void>
}) {
  const { req, res } = createRequestResponseMocks({
    url,
    headers,
  })
  const requestHandler = jest.fn(async () => {
    if (middlewareError) {
      throw middlewareError
    }
    if (middlewareResponse) {
      const middlewareResult = new Error('middleware response') as Error & {
        result: { response: Response }
      }
      middlewareResult.result = { response: middlewareResponse }
      throw middlewareResult
    }
  })
  const renderServer = {
    initialize: jest.fn(async () => ({ requestHandler })),
    clearModuleContext: jest.fn(),
    propagateServerField: jest.fn(),
    getServerField: jest.fn(),
  } as any

  const resolveRoutes = getResolveRoutes(
    fsChecker,
    config,
    {
      dir: '/app',
      dev: false,
      hostname: 'localhost',
      onDevServerCleanup: undefined,
      port: 3000,
      ...opts,
    },
    renderServer,
    renderServerOpts,
    ensureMiddleware
  )

  const result = await resolveRoutes({
    req,
    res,
    isUpgradeReq,
    signal: new AbortController().signal,
    invokedOutputs,
  })

  return {
    result,
    req,
    res,
    renderServer,
    requestHandler,
    ensureMiddleware,
  }
}

describe('live server route resolver contract', () => {
  it('normalizes repeated slashes before route matching', async () => {
    const { fsChecker, getItem } = createFsChecker()

    const { result } = await resolveLiveRoute({
      url: '/docs//intro?from=test',
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.statusCode).toBe(308)
    expect(result.parsedUrl.pathname).toBe('/docs/intro')
    expect(result.parsedUrl.query).toEqual({ from: 'test' })
    expect(getItem).not.toHaveBeenCalled()
  })

  it('records the request metadata used by later server phases', async () => {
    const { fsChecker } = createFsChecker()

    const { req } = await resolveLiveRoute({
      url: '/meta?x=1',
      headers: {
        'x-forwarded-proto': 'https',
      },
      fsChecker,
    })

    expect(getRequestMeta(req, 'initURL')).toBe(
      'https://localhost:3000/meta?x=1'
    )
    expect(getRequestMeta(req, 'initQuery')).toEqual({ x: '1' })
    expect(getRequestMeta(req, 'initProtocol')).toBe('https')
    expect(getRequestMeta(req, 'clonableBody')).toBeDefined()
  })

  it('does not attach clonable request bodies for upgrade requests', async () => {
    const { fsChecker } = createFsChecker()

    const { req } = await resolveLiveRoute({
      url: '/_next/webpack-hmr',
      fsChecker,
      isUpgradeReq: true,
    })

    expect(getRequestMeta(req, 'initURL')).toBe(
      'http://localhost:3000/_next/webpack-hmr'
    )
    expect(getRequestMeta(req, 'clonableBody')).toBeUndefined()
  })

  it('keeps custom headers when resolving a filesystem output', async () => {
    const matchedOutput = createOutput('/with-header')
    const { fsChecker, getItem } = createFsChecker({
      headers: [
        buildCustomRoute('header', {
          source: '/with-header',
          headers: [
            { key: 'x-route-header', value: 'yes' },
            { key: 'set-cookie', value: 'one=1' },
            { key: 'set-cookie', value: 'two=2' },
          ],
        }),
      ],
      outputs: {
        '/with-header': matchedOutput,
      },
    })

    const { result } = await resolveLiveRoute({
      url: '/with-header',
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.matchedOutput).toBe(matchedOutput)
    expect(result.resHeaders).toEqual({
      'x-route-header': 'yes',
      'set-cookie': ['one=1', 'two=2'],
    })
    expect(getItem).toHaveBeenCalledWith('/with-header')
  })

  it('applies has and missing predicates before custom route params', async () => {
    const { fsChecker } = createFsChecker({
      headers: [
        buildCustomRoute('header', {
          source: '/conditional',
          has: [
            {
              type: 'header',
              key: 'x-auth',
              value: '(?<token>allowed)',
            },
          ],
          missing: [{ type: 'query', key: 'skip' }],
          headers: [{ key: 'x-token', value: ':token' }],
        }),
      ],
    })

    const { result: positive } = await resolveLiveRoute({
      url: '/conditional',
      headers: {
        'x-auth': 'allowed',
      },
      fsChecker,
    })
    const { result: negative } = await resolveLiveRoute({
      url: '/conditional?skip=1',
      headers: {
        'x-auth': 'allowed',
      },
      fsChecker,
    })

    expect(positive.resHeaders).toEqual({ 'x-token': 'allowed' })
    expect(negative.resHeaders).toEqual({})
  })

  it('returns redirect responses with normalized destinations', async () => {
    const { fsChecker } = createFsChecker({
      redirects: [
        buildCustomRoute('redirect', {
          source: '/old/:slug',
          destination: '/new//:slug',
          permanent: true,
        }),
      ],
    })

    const { result } = await resolveLiveRoute({
      url: '/old/post?keep=1',
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.statusCode).toBe(308)
    expect(result.resHeaders).toBeNull()
    expect(result.parsedUrl.pathname).toBe('/new/post')
    expect(result.parsedUrl.search).toBe('keep=1')
  })

  it('keeps direct static outputs even when page filesystem routes are disabled', async () => {
    const publicOutput = createOutput('/robots.txt', 'publicFolder')
    const pageOutput = createOutput('/page')
    const config = createConfig({ useFileSystemPublicRoutes: false })
    const { fsChecker } = createFsChecker({
      outputs: {
        '/robots.txt': publicOutput,
        '/page': pageOutput,
      },
    })

    const { result: publicResult } = await resolveLiveRoute({
      url: '/robots.txt',
      config,
      fsChecker,
    })
    const { result: pageResult } = await resolveLiveRoute({
      url: '/page',
      config,
      fsChecker,
    })

    expect(publicResult.finished).toBe(true)
    expect(publicResult.matchedOutput).toBe(publicOutput)
    expect(pageResult.finished).toBe(false)
    expect(pageResult.matchedOutput).toBeNull()
  })

  it('resolves beforeFiles rewrites before checking filesystem outputs', async () => {
    const matchedOutput = createOutput('/page/intro')
    const { fsChecker } = createFsChecker({
      rewrites: {
        beforeFiles: [
          buildCustomRoute('before_files_rewrite', {
            source: '/docs/:slug',
            destination: '/page/:slug',
          }),
        ],
      },
      outputs: {
        '/page/intro': matchedOutput,
      },
    })

    const { result } = await resolveLiveRoute({
      url: '/docs/intro?draft=1',
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.matchedOutput).toBe(matchedOutput)
    expect(result.parsedUrl.pathname).toBe('/page/intro')
    expect(result.parsedUrl.query).toEqual({
      draft: '1',
    })
  })

  it('prefers direct filesystem outputs over afterFiles rewrites', async () => {
    const directOutput = createOutput('/legacy')
    const rewrittenOutput = createOutput('/modern')
    const { fsChecker } = createFsChecker({
      rewrites: {
        afterFiles: [
          buildCustomRoute('rewrite', {
            source: '/legacy',
            destination: '/modern',
          }),
        ],
      },
      outputs: {
        '/legacy': directOutput,
        '/modern': rewrittenOutput,
      },
    })

    const { result } = await resolveLiveRoute({
      url: '/legacy',
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.parsedUrl.pathname).toBe('/legacy')
    expect(result.matchedOutput).toBe(directOutput)
  })

  it('resolves afterFiles rewrites when the original pathname is missing', async () => {
    const matchedOutput = createOutput('/modern')
    const { fsChecker } = createFsChecker({
      rewrites: {
        afterFiles: [
          buildCustomRoute('rewrite', {
            source: '/legacy',
            destination: '/modern',
          }),
        ],
      },
      outputs: {
        '/modern': matchedOutput,
      },
    })

    const { result } = await resolveLiveRoute({
      url: '/legacy',
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.parsedUrl.pathname).toBe('/modern')
    expect(result.matchedOutput).toBe(matchedOutput)
  })

  it('resolves fallback rewrites after dynamic and filesystem misses', async () => {
    const matchedOutput = createOutput('/fallback')
    const { fsChecker } = createFsChecker({
      rewrites: {
        fallback: [
          buildCustomRoute('rewrite', {
            source: '/missing',
            destination: '/fallback',
          }),
        ],
      },
      outputs: {
        '/fallback': matchedOutput,
      },
    })

    const { result } = await resolveLiveRoute({
      url: '/missing',
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.parsedUrl.pathname).toBe('/fallback')
    expect(result.matchedOutput).toBe(matchedOutput)
  })

  it('returns immediately for external rewrites', async () => {
    const { fsChecker } = createFsChecker({
      rewrites: {
        afterFiles: [
          buildCustomRoute('rewrite', {
            source: '/proxy',
            destination: 'https://example.com/proxy',
          }),
        ],
      },
    })

    const { result } = await resolveLiveRoute({
      url: '/proxy',
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.resHeaders).toBeNull()
    expect(result.parsedUrl.protocol).toBe('https:')
    expect(result.parsedUrl.hostname).toBe('example.com')
    expect(result.parsedUrl.pathname).toBe('/proxy')
  })

  it('sets rewritten RSC headers for internal rewrites', async () => {
    const matchedOutput = createOutput('/target')
    const { fsChecker } = createFsChecker({
      rewrites: {
        beforeFiles: [
          buildCustomRoute('before_files_rewrite', {
            source: '/rsc',
            destination: '/target?x=1',
          }),
        ],
      },
      outputs: {
        '/target': matchedOutput,
      },
    })

    const { result, res } = await resolveLiveRoute({
      url: '/rsc',
      headers: {
        [RSC_HEADER]: '1',
      },
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.matchedOutput).toBe(matchedOutput)
    expect(res.getHeader(NEXT_REWRITTEN_PATH_HEADER)).toBe('/target')
    expect(res.getHeader(NEXT_REWRITTEN_QUERY_HEADER)).toBe('x=1')
  })

  it('matches dynamic routes through the filesystem checker', async () => {
    const matchedOutput = createOutput('/blog/[slug]')
    const dynamicRoute = createDynamicRoute('/blog/[slug]')
    const { fsChecker, getItem } = createFsChecker({
      dynamicRoutes: [dynamicRoute],
      outputs: {
        '/blog/[slug]': matchedOutput,
      },
    })

    const { result } = await resolveLiveRoute({
      url: '/blog/hello',
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.matchedOutput).toBe(matchedOutput)
    expect(result.parsedUrl.pathname).toBe('/blog/hello')
    expect(getItem).toHaveBeenCalledWith('/blog/[slug]')
  })

  it('checks dynamic route outputs with the configured basePath', async () => {
    const matchedOutput = createOutput('/docs/blog/[slug]')
    const dynamicRoute = createDynamicRoute('/blog/[slug]')
    const config = createConfig({ basePath: '/docs' })
    const { fsChecker, getItem } = createFsChecker({
      dynamicRoutes: [dynamicRoute],
      outputs: {
        '/docs/blog/[slug]': matchedOutput,
      },
    })

    const { result } = await resolveLiveRoute({
      url: '/docs/blog/hello',
      config,
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.matchedOutput).toBe(matchedOutput)
    expect(getItem).toHaveBeenCalledWith('/docs/blog/[slug]')
  })

  it('prefixes the default locale for i18n filesystem lookup', async () => {
    const matchedOutput = createOutput('/en/about', 'pageFile', {
      locale: 'en',
    })
    const config = createConfig({
      i18n: {
        locales: ['en', 'fr'],
        defaultLocale: 'en',
      },
    })
    const { fsChecker } = createFsChecker({
      outputs: {
        '/en/about': matchedOutput,
      },
    })

    const { result, req } = await resolveLiveRoute({
      url: '/about',
      config,
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.parsedUrl.pathname).toBe('/en/about')
    expect(result.matchedOutput).toBe(matchedOutput)
    expect(getRequestMeta(req, 'defaultLocale')).toBe('en')
    expect(getRequestMeta(req, 'locale')).toBe('en')
  })

  it('preserves detected i18n locales for localized filesystem lookup', async () => {
    const matchedOutput = createOutput('/fr/about', 'pageFile', {
      locale: 'fr',
    })
    const config = createConfig({
      i18n: {
        locales: ['en', 'fr'],
        defaultLocale: 'en',
      },
    })
    const { fsChecker } = createFsChecker({
      outputs: {
        '/fr/about': matchedOutput,
      },
    })

    const { result, req } = await resolveLiveRoute({
      url: '/fr/about',
      config,
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.parsedUrl.pathname).toBe('/fr/about')
    expect(result.matchedOutput).toBe(matchedOutput)
    expect(getRequestMeta(req, 'locale')).toBe('fr')
  })

  it('normalizes _next/data requests before middleware and dynamic lookup', async () => {
    const matchedOutput = createOutput('/blog/[slug]')
    const dynamicRoute = createDynamicRoute('/blog/[slug]')
    const { fsChecker } = createFsChecker({
      dynamicRoutes: [dynamicRoute],
      middlewareMatcher: createMiddlewareMatcher(() => false),
      outputs: {
        '/blog/[slug]': matchedOutput,
      },
    })

    const { result, req } = await resolveLiveRoute({
      url: '/_next/data/BUILD_ID/blog/hello.json',
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.parsedUrl.pathname).toBe('/blog/hello')
    expect(result.matchedOutput).toBe(matchedOutput)
    expect(getRequestMeta(req, 'isNextDataReq')).toBe(true)
    expect(req.headers['x-nextjs-data']).toBe('1')
  })

  it('runs exportPathMap routes at the beforeFiles boundary', async () => {
    const matchedOutput = createOutput('/mapped')
    const { fsChecker } = createFsChecker({
      exportPathMapRoutes: [
        buildCustomRoute('rewrite', {
          source: '/exported',
          destination: '/mapped',
        }),
      ],
      outputs: {
        '/mapped': matchedOutput,
      },
    })

    const { result } = await resolveLiveRoute({
      url: '/exported',
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.parsedUrl.pathname).toBe('/mapped')
    expect(result.matchedOutput).toBe(matchedOutput)
  })

  it('applies onMatchHeaders after resolving an output', async () => {
    const matchedOutput = createOutput('/asset', 'nextStaticFolder')
    const { fsChecker } = createFsChecker({
      onMatchHeaders: [
        buildCustomRoute('header', {
          source: '/asset',
          headers: [
            { key: 'cache-control', value: 'public, max-age=31536000' },
          ],
        }),
      ],
      outputs: {
        '/asset': matchedOutput,
      },
    })

    const { result } = await resolveLiveRoute({
      url: '/asset',
      fsChecker,
    })

    expect(result.finished).toBe(true)
    expect(result.matchedOutput).toBe(matchedOutput)
    expect(result.resHeaders).toEqual({
      'cache-control': 'public, max-age=31536000',
    })
  })

  it('skips outputs that are already being invoked', async () => {
    const matchedOutput = createOutput('/again')
    const { fsChecker } = createFsChecker({
      outputs: {
        '/again': matchedOutput,
      },
    })

    const { result } = await resolveLiveRoute({
      url: '/again',
      fsChecker,
      invokedOutputs: new Set(['/again']),
    })

    expect(result.finished).toBe(false)
    expect(result.matchedOutput).toBeNull()
  })

  it('keeps minimal mode to filesystem checks only', async () => {
    const matchedOutput = createOutput('/minimal')
    const { fsChecker } = createFsChecker({
      headers: [
        buildCustomRoute('header', {
          source: '/minimal',
          headers: [{ key: 'x-minimal-header', value: 'ignored' }],
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
      },
      middlewareMatcher: createMiddlewareMatcher(() => true),
      outputs: {
        '/minimal': matchedOutput,
        '/rewritten': createOutput('/rewritten'),
      },
    })

    const { result, renderServer } = await resolveLiveRoute({
      url: '/minimal',
      fsChecker,
      opts: { minimalMode: true },
    })

    expect(result.finished).toBe(true)
    expect(result.statusCode).toBeUndefined()
    expect(result.parsedUrl.pathname).toBe('/minimal')
    expect(result.matchedOutput).toBe(matchedOutput)
    expect(result.resHeaders).toEqual({})
    expect(renderServer.initialize).not.toHaveBeenCalled()
  })

  it('turns middleware redirects into relative locations', async () => {
    const { fsChecker } = createFsChecker({
      middlewareMatcher: createMiddlewareMatcher(() => true),
    })
    const ensureMiddleware = jest.fn(async () => {})

    const { result, requestHandler } = await resolveLiveRoute({
      url: '/from',
      fsChecker,
      middlewareResponse: new Response(null, {
        status: 307,
        headers: {
          location: 'http://localhost:3000/login',
        },
      }),
      ensureMiddleware,
    })

    expect(ensureMiddleware).toHaveBeenCalledWith('/from')
    expect(requestHandler).toHaveBeenCalled()
    expect(result.finished).toBe(true)
    expect(result.statusCode).toBe(307)
    expect(result.resHeaders).toEqual({ location: '/login' })
    expect(result.parsedUrl.pathname).toBe('/login')
  })

  it('continues route resolution after internal middleware rewrites', async () => {
    const matchedOutput = createOutput('/rewritten')
    const { fsChecker } = createFsChecker({
      middlewareMatcher: createMiddlewareMatcher(() => true),
      outputs: {
        '/rewritten': matchedOutput,
      },
    })

    const { result, req } = await resolveLiveRoute({
      url: '/from',
      fsChecker,
      middlewareResponse: new Response(null, {
        headers: {
          'x-middleware-rewrite': 'http://localhost:3000/rewritten?m=1',
          'x-visible': 'visible',
        },
      }),
    })

    expect(result.finished).toBe(true)
    expect(result.parsedUrl.pathname).toBe('/rewritten')
    expect(result.parsedUrl.query).toEqual({ m: '1' })
    expect(result.matchedOutput).toBe(matchedOutput)
    expect(result.resHeaders).toEqual({
      'x-middleware-rewrite': '/rewritten?m=1',
      'x-visible': 'visible',
    })
    expect(req.headers['x-visible']).toBe('visible')
  })

  it('returns immediately for external middleware rewrites', async () => {
    const { fsChecker } = createFsChecker({
      middlewareMatcher: createMiddlewareMatcher(() => true),
    })

    const { result } = await resolveLiveRoute({
      url: '/from',
      fsChecker,
      middlewareResponse: new Response(null, {
        headers: {
          'x-middleware-rewrite': 'https://external.test/path',
        },
      }),
    })

    expect(result.finished).toBe(true)
    expect(result.resHeaders).toEqual({
      'x-middleware-rewrite': 'https://external.test/path',
    })
    expect(result.parsedUrl.protocol).toBe('https:')
    expect(result.parsedUrl.hostname).toBe('external.test')
    expect(result.parsedUrl.pathname).toBe('/path')
  })

  it('passes through non-redirect middleware Location responses', async () => {
    const { fsChecker } = createFsChecker({
      middlewareMatcher: createMiddlewareMatcher(() => true),
    })

    const { result } = await resolveLiveRoute({
      url: '/from',
      fsChecker,
      middlewareResponse: new Response('created', {
        status: 201,
        headers: {
          location: '/created',
        },
      }),
    })

    expect(result.finished).toBe(true)
    expect(result.statusCode).toBe(201)
    expect(result.bodyStream).toBeDefined()
    expect(result.resHeaders).toEqual({
      'content-type': 'text/plain;charset=UTF-8',
      location: '/created',
    })
    expect(result.parsedUrl.pathname).toBe('/from')
  })

  it('finishes middleware responses that request a refresh', async () => {
    const { fsChecker } = createFsChecker({
      middlewareMatcher: createMiddlewareMatcher(() => true),
    })

    const { result } = await resolveLiveRoute({
      url: '/from',
      fsChecker,
      middlewareResponse: new Response(null, {
        status: 204,
      }),
    })

    expect(result.finished).toBe(true)
    expect(result.statusCode).toBe(204)
    expect(result.bodyStream).toBeDefined()
    expect(result.resHeaders).toEqual({})
  })

  it('applies middleware request header overrides without exposing set-cookie', async () => {
    const { fsChecker } = createFsChecker({
      middlewareMatcher: createMiddlewareMatcher(() => true),
    })

    const { result, req } = await resolveLiveRoute({
      url: '/from',
      headers: {
        'x-keep': 'old',
        'x-remove': 'remove',
      },
      fsChecker,
      middlewareResponse: new Response(null, {
        headers: {
          'x-middleware-next': '1',
          'x-middleware-override-headers': 'x-keep,x-added',
          'x-middleware-request-x-keep': 'new',
          'x-middleware-request-x-added': 'yes',
          'x-middleware-set-cookie': 'middleware=1',
          'x-visible': 'visible',
        },
      }),
    })

    expect(result.finished).toBe(false)
    expect(result.resHeaders).toEqual({ 'x-visible': 'visible' })
    expect(req.headers['x-keep']).toBe('new')
    expect(req.headers['x-added']).toBe('yes')
    expect(req.headers['x-remove']).toBeUndefined()
    expect(req.headers['x-middleware-set-cookie']).toBe('middleware=1')
    expect(result.resHeaders?.['x-middleware-set-cookie']).toBeUndefined()
  })
})
