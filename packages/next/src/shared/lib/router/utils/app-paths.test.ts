import type BaseServer from '../../../../server/base-server'
import type {
  InternalNextUrlWithParsedQuery,
  NextUrlWithParsedQuery,
} from '../../../../server/request-meta'
import {
  createPage,
  createRoute,
  createRouteOrEmpty,
  createRouteOrNull,
  ingestBrowserLocation,
  ingestNativeUrl,
  nativeUrlForWrite,
  createPages,
  createRoutes,
  createPageKeys,
  createRouteKeys,
  createPageEntries,
  createRouteEntries,
  createRouteSet,
  createRoutesResult,
  createAppPaths,
  pagesRouteToPage,
  pagesPageToRoute,
  type Page,
  type Route,
} from '../../route-types'
import { ingestClientBuildManifest } from '../../../../client/client-build-manifest'
import { ingestNextData } from '../../../../client/next-data'
import type { normalizeAppPath } from './app-paths'
import type { WorkStore } from '../../../../server/app-render/work-async-storage.external'
import type { RouteDefinition } from '../../../../server/route-definitions/route-definition'
import type { NextRouter } from '../router'
import type Router from '../router'
import type { Route as PublicRoute } from '../../../../types'
import type { ComponentProps, Context } from 'react'
import type { LinkProps } from '../../../../client/link'
import type AppLink from '../../../../client/app-dir/link'
import type {
  usePathname,
  useRouter,
} from '../../../../client/components/navigation'
import type { AppRouterInstance } from '../../app-router-context.shared-runtime'
import type { PathnameContext } from '../../hooks-client-context.shared-runtime'
import type { DocumentContext, DocumentProps, NEXT_DATA } from '../../utils'
import type { NextURL } from '../../../../server/web/next-url'
import type { normalizePagePath } from '../../page-path/normalize-page-path'
import type { denormalizePagePath } from '../../page-path/denormalize-page-path'
import type { normalizePathSep } from '../../page-path/normalize-path-sep'
import type { removeTrailingSlash } from './remove-trailing-slash'
import type { encodeURIPath } from '../../encode-uri-path'
import {
  compareAppPaths,
  normalizeRscURL,
  selectAppPageEntry,
} from './app-paths'

type Assert<Condition extends true> = Condition
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false

// Erased compile-time coverage: neither brand can silently enter the other
// representation, while public URL inputs continue to accept plain strings.
export type PageRouteTypeAssertions = [
  Assert<Page extends string ? true : false>,
  Assert<Route extends string ? true : false>,
  Assert<string extends Page ? false : true>,
  Assert<string extends Route ? false : true>,
  Assert<Page extends Route ? false : true>,
  Assert<Route extends Page ? false : true>,
  Assert<Equal<ReturnType<typeof createPage>, Page>>,
  Assert<Equal<ReturnType<typeof nativeUrlForWrite>, URL>>,
  Assert<Equal<ReturnType<typeof createRouteOrEmpty>, Route | ''>>,
  Assert<Equal<ReturnType<typeof createRouteOrNull>, Route | null>>,
  Assert<Equal<ReturnType<typeof ingestBrowserLocation<null>>, null>>,
  Assert<
    Equal<ReturnType<typeof ingestBrowserLocation<Location>>['pathname'], Route>
  >,
  Assert<Equal<ReturnType<typeof createRoute>, Route>>,
  Assert<string extends Parameters<typeof createPage>[0] ? true : false>,
  Assert<string extends Parameters<typeof createRoute>[0] ? true : false>,
  Assert<Page extends Parameters<typeof createPage>[0] ? false : true>,
  Assert<Route extends Parameters<typeof createPage>[0] ? false : true>,
  Assert<Page extends Parameters<typeof createRoute>[0] ? false : true>,
  Assert<Route extends Parameters<typeof createRoute>[0] ? false : true>,
  Assert<Equal<Parameters<typeof pagesRouteToPage>[0], Route>>,
  Assert<Equal<ReturnType<typeof pagesRouteToPage>, Page>>,
  Assert<Equal<Parameters<typeof pagesPageToRoute>[0], Page>>,
  Assert<Equal<ReturnType<typeof pagesPageToRoute>, Route>>,
  Assert<Equal<Parameters<typeof normalizeAppPath>[0], Page>>,
  Assert<Equal<ReturnType<typeof normalizeAppPath>, Route>>,
  Assert<Equal<Parameters<typeof normalizePagePath>[0], Page>>,
  Assert<Equal<ReturnType<typeof normalizePagePath>, Page>>,
  Assert<Equal<Parameters<typeof denormalizePagePath>[0], Page>>,
  Assert<Equal<ReturnType<typeof denormalizePagePath>, Page>>,
  Assert<Equal<Parameters<typeof selectAppPageEntry>[0], Route>>,
  Assert<Equal<Parameters<typeof selectAppPageEntry>[1], readonly Page[]>>,
  Assert<Equal<ReturnType<typeof selectAppPageEntry>, Page>>,
  Assert<
    Equal<
      typeof removeTrailingSlash,
      {
        (value: Page): Page
        (value: Route): Route
        (value: string): string
      }
    >
  >,
  Assert<
    Equal<
      typeof normalizePathSep,
      {
        (value: Page): Page
        (value: Route): Route
        (value: string): string
      }
    >
  >,
  Assert<
    Equal<
      typeof encodeURIPath,
      {
        (value: Route): Route
        (value: string): string
      }
    >
  >,
  Assert<Equal<RouteDefinition['page'], Page>>,
  Assert<Equal<RouteDefinition['pathname'], Route>>,
  Assert<Equal<WorkStore['page'], Page>>,
  Assert<Equal<WorkStore['route'], Route>>,
  Assert<string extends Parameters<NextRouter['push']>[0] ? true : false>,
  Assert<string extends Parameters<NextRouter['replace']>[0] ? true : false>,
  Assert<string extends Parameters<NextRouter['prefetch']>[0] ? true : false>,
  Assert<string extends PublicRoute ? true : false>,
  Assert<string extends LinkProps['href'] ? true : false>,
  Assert<string extends NonNullable<LinkProps['as']> ? true : false>,
  Assert<string extends ComponentProps<typeof AppLink>['href'] ? true : false>,
  Assert<
    string extends Parameters<AppRouterInstance['push']>[0] ? true : false
  >,
  Assert<
    string extends Parameters<AppRouterInstance['replace']>[0] ? true : false
  >,
  Assert<
    string extends Parameters<AppRouterInstance['prefetch']>[0] ? true : false
  >,
  Assert<Equal<ReturnType<typeof useRouter>, AppRouterInstance>>,
  Assert<Equal<ReturnType<typeof usePathname>, string>>,
  Assert<Equal<typeof PathnameContext, Context<string | null>>>,
  Assert<Equal<NextRouter['pathname'], string>>,
  Assert<Equal<Router['pathname'], string>>,
  // next/router also exports the concrete Router, including mutable members
  // and transitively reachable loaders, not just the NextRouter method pick.
  Assert<Equal<Router['route'], string>>,
  Assert<string extends keyof Router['components'] ? true : false>,
  Assert<Equal<Router['components']['/foo'], Router['components'][string]>>,
  Assert<
    Equal<
      NonNullable<Router['components'][keyof Router['components']]['route']>,
      string
    >
  >,
  Assert<Equal<Parameters<Router['fetchComponent']>[0], string>>,
  Assert<Equal<Parameters<Router['handleRouteInfoError']>[1], string>>,
  Assert<Equal<Parameters<Router['getRouteInfo']>[0]['route'], string>>,
  Assert<Equal<Parameters<Router['getRouteInfo']>[0]['pathname'], string>>,
  Assert<Equal<Parameters<Router['pageLoader']['_isSsg']>[0], string>>,
  Assert<Equal<Parameters<Router['pageLoader']['loadPage']>[0], string>>,
  Assert<Equal<Parameters<Router['pageLoader']['prefetch']>[0], string>>,
  Assert<
    Equal<Awaited<ReturnType<Router['pageLoader']['getPageList']>>, string[]>
  >,
  Assert<
    Equal<
      Parameters<Router['pageLoader']['routeLoader']['whenEntrypoint']>[0],
      string
    >
  >,
  Assert<
    Equal<
      Parameters<Router['pageLoader']['routeLoader']['onEntrypoint']>[0],
      string
    >
  >,
  Assert<
    Equal<
      Parameters<Router['pageLoader']['routeLoader']['loadRoute']>[0],
      string
    >
  >,
  Assert<
    Equal<
      Parameters<Router['pageLoader']['routeLoader']['prefetch']>[0],
      string
    >
  >,
  // Ambient framework globals are also visible in consumer type programs.
  Assert<
    Equal<Window['__DEV_PAGES_MANIFEST'], { pages: string[] } | undefined>
  >,
  Assert<Equal<Window['__SSG_MANIFEST'], Set<string> | undefined>>,
  Assert<
    Equal<Window['__BUILD_MANIFEST'], Record<string, string[]> | undefined>
  >,
  Assert<
    Equal<
      Window['__TURBOPACK_PAGE_BOOTSTRAP'],
      Record<string, unknown> | undefined
    >
  >,
  Assert<Equal<NextURL['pathname'], string>>,
  Assert<Equal<DocumentContext['pathname'], string>>,
  Assert<Equal<DocumentProps['dangerousAsPath'], string>>,
  Assert<Equal<DocumentProps['__NEXT_DATA__']['page'], string>>,
  Assert<Equal<NEXT_DATA['page'], string>>,
  Assert<Equal<NextUrlWithParsedQuery['pathname'], string | null>>,
  Assert<Equal<InternalNextUrlWithParsedQuery['pathname'], Route | null>>,
  Assert<string extends Parameters<BaseServer['render']>[2] ? true : false>,
  Assert<
    string extends NonNullable<Parameters<BaseServer['render']>[4]>['pathname']
      ? true
      : false
  >,
  Assert<
    string extends Parameters<BaseServer['renderToHTML']>[2] ? true : false
  >,
  Assert<
    string extends Parameters<BaseServer['renderError']>[3] ? true : false
  >,
  Assert<
    string extends Parameters<BaseServer['renderErrorToHTML']>[3] ? true : false
  >,
]

// This function is never executed: the repository type check verifies both
// rejection diagnostics and inferred positive result types without unsafe calls.
export function checkConstructorTypes(
  raw: string,
  page: Page,
  route: Route,
  nextUrl: NextURL
) {
  nextUrl.pathname = raw
  const rawPage: Page = createPage(raw)
  const rawRoute: Route = createRoute(raw)
  const prefixedPage: Page = createPage(`/index${page}`)
  const prefixedRoute: Route = createRoute(`/prefix${route}`)
  const interpolated: Route | '' = createRouteOrEmpty(raw)
  void interpolated
  // @ts-expect-error the sentinel boundary must not admit an existing Page
  createRouteOrEmpty(page)
  // @ts-expect-error the sentinel boundary must not admit an existing Route
  createRouteOrEmpty(route)
  const nullablePath: Route | null = createRouteOrNull(raw)
  const nullPath: Route | null = createRouteOrNull(null)
  void nullablePath
  void nullPath
  // @ts-expect-error the nullable boundary must reject existing Page inputs
  createRouteOrNull(page)
  // @ts-expect-error the nullable boundary must reject existing Route inputs
  createRouteOrNull(route)
  // @ts-expect-error explicit nullable widening must not admit an existing Route
  createRouteOrNull<string | null>(route)
  function forwardNullable<Value extends string | null>(value: Value) {
    // @ts-expect-error a generic nullable string could be instantiated as either brand
    return createRouteOrNull(value)
  }
  void forwardNullable
  const browserLocation = ingestBrowserLocation(window.location)
  const browserPath: Route = browserLocation.pathname
  const browserOrigin: string = browserLocation.origin
  const nullLocation: null = ingestBrowserLocation(null)
  const nullableLocation: (Location & { pathname: Route }) | null =
    ingestBrowserLocation(Math.random() ? window.location : null)
  void browserPath
  void browserOrigin
  void nullLocation
  void nullableLocation
  const browserWithPayload: Location & { readonly payload: Page } = {
    ...window.location,
    payload: page,
  }
  const browserMetadata = ingestBrowserLocation(browserWithPayload)
  const browserPayload: Page = browserMetadata.payload
  void browserPayload
  // @ts-expect-error browser ingestion must retain readonly non-pathname payloads
  browserMetadata.payload = page
  // @ts-expect-error an already branded browser pathname must be used directly
  ingestBrowserLocation(browserLocation)
  const pageLocation: Location & { pathname: Page } = {
    ...window.location,
    pathname: page,
  }
  // @ts-expect-error browser ingestion must not reinterpret an existing module identifier
  ingestBrowserLocation(pageLocation)
  // @ts-expect-error explicit browser type widening cannot hide a known brand
  ingestBrowserLocation<Location>(browserLocation)
  // @ts-expect-error arbitrary unknown data is not a browser Location
  ingestBrowserLocation(raw)
  function forwardBrowserLocation<Value extends Location | null>(value: Value) {
    // @ts-expect-error a generic browser pathname could already have a brand
    return ingestBrowserLocation(value)
  }
  void forwardBrowserLocation
  const readonlyBrowser: Readonly<Location> = window.location
  const readonlyBrowserResult = ingestBrowserLocation(readonlyBrowser)
  // @ts-expect-error retain readonly browser pathname modifiers
  readonlyBrowserResult.pathname = route
  const readonlyUrl: Readonly<URL> = new URL('https://example.test/path')
  const readonlyUrlResult = ingestNativeUrl(readonlyUrl)
  // @ts-expect-error retain readonly native URL pathname modifiers
  readonlyUrlResult.pathname = route
  const nativeUrl = ingestNativeUrl(new URL('https://example.test/path'))
  const nativePathname: Route = nativeUrl.pathname
  void nativePathname
  // @ts-expect-error a previously branded native pathname should be used directly
  ingestNativeUrl(nativeUrl)
  // @ts-expect-error arbitrary unknown data is not a native URL parser result
  ingestNativeUrl(raw)
  const nonKeyModules: Page[] = [page]
  const clientManifest = ingestClientBuildManifest({
    '/example': nonKeyModules,
    sortedPages: [raw],
  })
  const preservedClientPayload: Page = clientManifest[route][0]
  const clientPattern: Route = clientManifest.sortedPages[0]
  void preservedClientPayload
  void clientPattern
  // @ts-expect-error previously branded manifest keys are not raw global data
  ingestClientBuildManifest({ [page]: [raw] } as Record<Page, string[]>)
  // @ts-expect-error previously branded URL keys are not reconstructed
  ingestClientBuildManifest({ [route]: [raw] } as Record<Route, string[]>)
  // @ts-expect-error sorted manifest Page members cannot become URL patterns
  ingestClientBuildManifest({ sortedPages: [page] })
  // @ts-expect-error sorted manifest Route members should be used directly
  ingestClientBuildManifest({ sortedPages: [route] })
  const readonlyClientManifest: {
    readonly '/example': string[]
    readonly sortedPages: string[]
  } = { '/example': [raw], sortedPages: [raw] }
  // @ts-expect-error native schema ingestion must not expose readonly records as writable
  ingestClientBuildManifest(readonlyClientManifest)
  // @ts-expect-error arbitrary unknown data is not the legacy client-manifest producer
  ingestClientBuildManifest(raw)
  const rawNextData = {
    props: { module: page },
    page: raw,
    query: {},
    buildId: 'build',
  }
  const readonlyNextData: Readonly<NEXT_DATA & { readonly extra: Page }> = {
    ...rawNextData,
    extra: page,
  }
  const nextData = ingestNextData(readonlyNextData)
  const nextDataPattern: Route = nextData.page
  const nextDataExtra: Page = nextData.extra
  void nextDataPattern
  void nextDataExtra
  // @ts-expect-error hydration ingestion must retain readonly page modifiers
  nextData.page = route
  // @ts-expect-error hydration ingestion must retain readonly payload modifiers
  nextData.extra = page
  // @ts-expect-error hydration data with an existing Route must be used directly
  ingestNextData({ ...rawNextData, page: route })
  // @ts-expect-error hydration cannot reinterpret a known Page as a URL pattern
  ingestNextData({ ...rawNextData, page })
  // @ts-expect-error explicit hydration schema widening cannot admit an existing Page
  ingestNextData<NEXT_DATA>({ ...rawNextData, page })
  // @ts-expect-error explicit hydration schema widening cannot admit an existing Route
  ingestNextData<NEXT_DATA>({ ...rawNextData, page: route })
  // @ts-expect-error arbitrary data is not the hydration producer schema
  ingestNextData(raw)
  function forwardNextData<Value extends NEXT_DATA>(value: Value) {
    // @ts-expect-error generic hydration forwarding might contain a branded page field
    return ingestNextData(value)
  }
  void forwardNextData
  const parsedNextData: NEXT_DATA & { page: Route } = ingestNextData<NEXT_DATA>(
    JSON.parse('{}')
  )
  void parsedNextData
  // @ts-expect-error untyped JSON needs the actual hydration schema, not inferred arbitrary fields
  const unspecifiedNextData: NEXT_DATA & { page: Route } = ingestNextData(
    JSON.parse('{}')
  )
  void unspecifiedNextData
  const pages: Page[] = createPages([raw])
  const routes: Route[] = createRoutes([raw])
  const readonlyPages: readonly [Page, Page] = createPages([raw, raw] as const)
  const readonlyRoutes: readonly [Route, Route] = createRoutes([
    raw,
    raw,
  ] as const)

  const payload = { count: 1 }
  const pageKeys: Record<Page, typeof payload> = createPageKeys({
    [raw]: payload,
  })
  const routeKeys: Record<Route, typeof payload> = createRouteKeys({
    [raw]: payload,
  })
  const readonlyKeys = { '/example': payload } as const
  const mixedKeys: { readonly '/a': typeof payload; '/b': typeof payload } = {
    '/a': payload,
    '/b': payload,
  }
  const entries: [string, typeof payload][] = [[raw, payload]]
  const pageEntries: [Page, typeof payload][] = createPageEntries(entries)
  const routeEntries: [Route, typeof payload][] = createRouteEntries(entries)
  const readonlyEntries: readonly [readonly [Route, typeof payload]] =
    createRouteEntries([[raw, payload]] as const)
  const preservedMember: readonly [readonly [Route, Page]] = createRouteEntries(
    [[raw, page]] as const
  )
  const routeSet: Set<Route> = createRouteSet(new Set([raw]))
  const rawReadonlySet: ReadonlySet<string> = new Set([raw])
  const readonlyRouteSet: ReadonlySet<Route> = createRouteSet(rawReadonlySet)
  const promisedRoutes: Promise<Route[]> = createRoutesResult(
    Promise.resolve([raw])
  )
  const appPaths: Record<Route, Page[]> = createAppPaths({ [raw]: [raw] })
  const rawTuple: [string, string] = [raw, raw]
  const inferredPagesTuple = createPages(rawTuple)
  const inferredReadonlyRoutes = createRoutes([raw] as const)
  const inferredReadonlyEntries = createRouteEntries([[raw, page]] as const)
  const inferredReadonlySet = createRouteSet(rawReadonlySet)
  const inferredReadonlyPromise = createRoutesResult(
    Promise.resolve([raw] as const)
  )
  const inferredAppPaths = createAppPaths({ '/example': [raw] as const })
  inferredAppPaths[route] = [page]
  // @ts-expect-error readonly App member sequences must not become writable
  inferredAppPaths[route][0] = page
  const brandedPathKeys: Record<Route, string[]> = { [route]: [raw] }

  // @ts-expect-error readonly entry/sequence modifiers are preserved
  readonlyEntries[0][0] = route
  // @ts-expect-error readonly records cannot lose modifiers via opaque key remapping
  createRouteKeys(readonlyKeys)
  // @ts-expect-error readonly records cannot lose modifiers via opaque key remapping
  createPageKeys(readonlyKeys)
  // @ts-expect-error mixed key modifiers cannot become a uniform branded index signature
  createRouteKeys(mixedKeys)
  // @ts-expect-error mixed key modifiers cannot become a uniform branded index signature
  createPageKeys(mixedKeys)
  // @ts-expect-error readonly App-path table keys must not become writable
  createAppPaths({ '/example': [raw] } as const)
  // @ts-expect-error readonly sets must not acquire mutable methods
  readonlyRouteSet.add(route)
  // @ts-expect-error same-brand record keys must not be reconstructed
  createPageKeys(pageKeys)
  // @ts-expect-error opposite-brand record keys must not be reconstructed
  createRouteKeys(pageKeys)
  // @ts-expect-error same-brand record keys must not be reconstructed
  createRouteKeys(routeKeys)
  // @ts-expect-error opposite-brand record keys must not be reconstructed
  createPageKeys(routeKeys)
  // @ts-expect-error same-brand entry keys must not be reconstructed
  createPageEntries(pageEntries)
  // @ts-expect-error opposite-brand entry keys must not be reconstructed
  createRouteEntries(pageEntries)
  // @ts-expect-error opposite-brand entry keys must not be reconstructed
  createPageEntries(routeEntries)
  // @ts-expect-error same-brand entry keys must not be reconstructed
  createRouteEntries(routeEntries)
  // @ts-expect-error same-brand set members must not be reconstructed
  createRouteSet(routeSet)
  // @ts-expect-error opposite-brand set members must not be reconstructed
  createRouteSet(new Set([page]))
  // @ts-expect-error known Promise result members must not be reconstructed
  createRoutesResult(promisedRoutes)
  // @ts-expect-error known immediate result members must not be reconstructed
  createRoutesResult(routes)
  // @ts-expect-error App paths cannot hide previously branded members
  createAppPaths({ [raw]: pages })
  // @ts-expect-error App paths cannot hide previously branded keys
  createAppPaths(brandedPathKeys)
  // @ts-expect-error a string-keyed table with Route members is not raw App paths
  createAppPaths({ [raw]: routes })

  const constructorAlias = createRoute
  // @ts-expect-error inferred function aliases retain the input guard
  constructorAlias(page)

  // @ts-expect-error existing Page inputs must not be reconstructed
  createPage(page)
  // @ts-expect-error Page is not an unbranded Route input
  createRoute(page)
  // @ts-expect-error Route is not an unbranded Page input
  createPage(route)
  // @ts-expect-error existing Route inputs must not be reconstructed
  createRoute(route)
  // @ts-expect-error explicit widening of the type argument cannot admit Page
  createRoute<string>(page)
  // @ts-expect-error arrays must reject existing Page members
  createRoutes([page])
  // @ts-expect-error arrays must reject existing Route members
  createPages([route])
  // @ts-expect-error same-brand sequences should be used directly
  createRoutes(routes)
  // @ts-expect-error same-brand sequences should be used directly
  createPages(pages)

  function forward<Value extends string>(value: Value) {
    // @ts-expect-error a generic string could later be instantiated as Page/Route
    return createRoute(value)
  }
  function forwardPage<Value extends Page>(value: Value) {
    // @ts-expect-error a branded generic cannot enter the raw constructor
    return createRoute(value)
  }
  function forwardRoutes<Value extends string>(value: Value[]) {
    // @ts-expect-error array inference cannot hide branded members
    return createRoutes(value)
  }
  function forwardKeys<Value extends object>(value: Value) {
    // @ts-expect-error unresolved generic keys cannot conceal existing brands
    return createRouteKeys(value)
  }
  function forwardEntries<Value extends string>(value: [Value, number][]) {
    // @ts-expect-error entry-key inference cannot conceal existing brands
    return createRouteEntries(value)
  }
  function forwardSet<Value extends string>(value: Set<Value>) {
    // @ts-expect-error set-member inference cannot conceal existing brands
    return createRouteSet(value)
  }
  function forwardResult<Value extends string>(value: Promise<Value[]>) {
    // @ts-expect-error Promise-member inference cannot conceal existing brands
    return createRoutesResult(value)
  }
  return {
    clientManifest,
    inferredPagesTuple,
    inferredReadonlyRoutes,
    inferredReadonlyEntries,
    inferredReadonlySet,
    inferredReadonlyPromise,
    inferredAppPaths,
    rawPage,
    rawRoute,
    prefixedPage,
    prefixedRoute,
    pages,
    routes,
    readonlyPages,
    readonlyRoutes,
    forward,
    forwardPage,
    forwardRoutes,
    forwardKeys,
    forwardEntries,
    forwardSet,
    forwardResult,
    pageKeys,
    routeKeys,
    pageEntries,
    routeEntries,
    readonlyEntries,
    routeSet,
    readonlyRouteSet,
    promisedRoutes,
    appPaths,
    preservedMember,
  }
}

export type ConstructorInferredResultAssertions = [
  Assert<
    Equal<
      ReturnType<typeof checkConstructorTypes>['clientManifest'][Route][number],
      Page
    >
  >,
  Assert<
    Equal<
      ReturnType<
        typeof checkConstructorTypes
      >['clientManifest']['sortedPages'][number],
      Route
    >
  >,
  Assert<
    Equal<
      ReturnType<typeof checkConstructorTypes>['inferredPagesTuple'],
      [Page, Page]
    >
  >,
  Assert<
    Equal<
      ReturnType<typeof checkConstructorTypes>['inferredReadonlyRoutes'],
      readonly [Route]
    >
  >,
  Assert<
    Equal<
      ReturnType<typeof checkConstructorTypes>['inferredReadonlyEntries'],
      readonly [readonly [Route, Page]]
    >
  >,
  Assert<
    Equal<
      ReturnType<typeof checkConstructorTypes>['inferredReadonlySet'],
      ReadonlySet<Route>
    >
  >,
  Assert<
    Equal<
      ReturnType<typeof checkConstructorTypes>['inferredReadonlyPromise'],
      Promise<readonly [Route]>
    >
  >,
  // Opaque-key remapping and Record produce distinct mapped-type identities.
  // Check the actual key/value roles, both assignability directions and writes.
  Assert<
    Equal<
      keyof ReturnType<typeof checkConstructorTypes>['inferredAppPaths'],
      Route
    >
  >,
  Assert<
    Equal<
      ReturnType<typeof checkConstructorTypes>['inferredAppPaths'][Route],
      readonly [Page]
    >
  >,
  Assert<
    ReturnType<typeof checkConstructorTypes>['inferredAppPaths'] extends Record<
      Route,
      readonly [Page]
    >
      ? true
      : false
  >,
  Assert<
    Record<Route, readonly [Page]> extends ReturnType<
      typeof checkConstructorTypes
    >['inferredAppPaths']
      ? true
      : false
  >,
]

describe('Page/Route construction boundaries', () => {
  it('preserves text without validation or normalization', () => {
    for (const raw of [
      '',
      '/(group)/@slot/example/page',
      '/a/../b//',
      '/foo?x=1',
    ]) {
      expect(createPage(raw)).toBe(raw)
      expect(createRoute(raw)).toBe(raw)
      expect(createRouteOrEmpty(raw)).toBe(raw)
      expect(createRouteOrNull(raw)).toBe(raw)
    }
    expect(createRouteOrNull(null)).toBeNull()
  })

  it('retains browser Location identity and its null SSR sentinel without reading accessors', () => {
    let accesses = 0
    const payload = { count: 1 }
    const native: Location & { readonly payload: typeof payload } = {
      ancestorOrigins: {
        length: 0,
        item: () => null,
        contains: () => false,
        [Symbol.iterator]: () => [].values(),
      },
      hash: '',
      host: 'example.test',
      hostname: 'example.test',
      href: 'https://example.test/path',
      origin: 'https://example.test',
      get pathname(): string {
        accesses++
        throw new Error('boundary must not read browser accessors')
      },
      port: '',
      protocol: 'https:',
      search: '',
      assign: () => {},
      reload: () => {},
      replace: () => {},
      toString: () => 'https://example.test/path',
      payload,
    }
    const ingested = ingestBrowserLocation(native)
    expect(ingested).toBe(native)
    expect(ingested.payload).toBe(payload)
    expect(accesses).toBe(0)
    Object.freeze(native)
    expect(ingestBrowserLocation(native)).toBe(native)
    expect(ingestBrowserLocation(null)).toBeNull()
  })

  it('retains the native URL object and parsing accessors', () => {
    const native = Object.assign(new URL('https://example.test/a/../b?x=1'), {
      payload: { count: 1 },
    })
    const parsed = ingestNativeUrl(native)
    expect(parsed).toBe(native)
    expect(parsed.payload).toBe(native.payload)
    expect(parsed.pathname).toBe('/b')
    // The native writable view accepts raw input; its getter exposes parsed text.
    expect(nativeUrlForWrite(parsed)).toBe(native)
    nativeUrlForWrite(parsed).pathname = '/a b?#'
    expect(parsed.pathname).toBe('/a%20b%3F%23')
    expect(parsed.search).toBe('?x=1')
    Object.defineProperty(native, 'pathname', {
      get() {
        throw new Error('boundary must not invoke native accessors')
      },
    })
    expect(ingestNativeUrl(native)).toBe(native)
  })

  it('retains client manifest identity, metadata and payloads without reading them', () => {
    const files = ['static/chunks/example.js']
    const sortedPages = ['/example']
    const manifest = { '/example': files, sortedPages }
    const metadata = { beforeFiles: [], afterFiles: [], fallback: [] }
    Object.assign(manifest, { __rewrites: metadata })
    const ingested = ingestClientBuildManifest(manifest)
    expect(ingested).toBe(manifest)
    expect(ingested[createRoute('/example')]).toBe(files)
    expect(ingested.sortedPages).toBe(sortedPages)
    expect(ingested.__rewrites).toBe(metadata)
    Object.freeze(manifest)
    expect(ingestClientBuildManifest(manifest)).toBe(manifest)
    Object.defineProperty(sortedPages, 0, {
      get() {
        throw new Error('boundary must not inspect sorted pages')
      },
    })
    expect(ingestClientBuildManifest(manifest)).toBe(manifest)
    const getters = { '/example': files, sortedPages }
    Object.defineProperty(getters, 'sortedPages', {
      get() {
        throw new Error('boundary must not inspect schema fields')
      },
    })
    expect(ingestClientBuildManifest(getters)).toBe(getters)
  })

  it('retains Pages hydration JSON, readonly payloads and accessors unchanged', () => {
    const parsed: NEXT_DATA = JSON.parse(
      '{"page":"/blog/[slug]","props":{"nested":["unchanged"]},"query":{},"buildId":"build"}'
    )
    const props = parsed.props
    const ingested = ingestNextData(parsed)
    expect(ingested).toBe(parsed)
    expect(ingested.page).toBe('/blog/[slug]')
    expect(ingested.props).toBe(props)
    Object.freeze(parsed)
    expect(ingestNextData(parsed)).toBe(parsed)
    const getterData = {
      ...parsed,
      get page(): string {
        throw new Error('hydration boundary must not read fields')
      },
    }
    expect(ingestNextData(getterData)).toBe(getterData)
    let evaluations = 0
    const read = () => {
      evaluations++
      return parsed
    }
    expect(ingestNextData(read())).toBe(parsed)
    expect(evaluations).toBe(1)
  })

  it('preserves mutable, readonly and frozen sequence references', () => {
    const pages = ['/(group)/example/page', '/example/route']
    const routes = ['/example', '/[id]']
    const readonly = ['/example', '/[id]'] as const
    const frozen = Object.freeze(['/example'])
    expect(createPages(pages)).toBe(pages)
    expect(createRoutes(routes)).toBe(routes)
    expect(createPages(readonly)).toBe(readonly)
    expect(createRoutes(readonly)).toBe(readonly)
    expect(createPages(frozen)).toBe(frozen)
    expect(createRoutes(frozen)).toBe(frozen)
    expect(pages).toEqual(['/(group)/example/page', '/example/route'])
    expect(routes).toEqual(['/example', '/[id]'])
    expect(Object.isFrozen(frozen)).toBe(true)
  })

  it('evaluates an argument once and does not access sequence elements', () => {
    let evaluations = 0
    const raw = () => {
      evaluations++
      return '/example'
    }
    expect(createRoute(raw())).toBe('/example')
    expect(evaluations).toBe(1)
    const pages = ['/example/page']
    Object.defineProperty(pages, 0, {
      get() {
        throw new Error('must not iterate')
      },
    })
    expect(createPages(pages)).toBe(pages)
  })

  it('preserves key-only records, entries and their non-key payloads', () => {
    const payload = { nested: ['unchanged'] }
    const record = { '/example': payload }
    Object.freeze(record)
    const frozen = record
    const entries: [string, typeof payload][] = [['/example', payload]]
    const readonlyEntries = [['/example', payload]] as const
    expect(createPageKeys(record)).toBe(record)
    expect(createRouteKeys(record)).toBe(record)
    expect(createPageKeys(frozen)).toBe(frozen)
    expect(createRouteKeys(frozen)).toBe(frozen)
    expect(createPageEntries(entries)).toBe(entries)
    expect(createRouteEntries(entries)).toBe(entries)
    expect(createPageEntries(readonlyEntries)).toBe(readonlyEntries)
    expect(createRouteEntries(readonlyEntries)).toBe(readonlyEntries)
    expect(entries[0][1]).toBe(payload)
    expect(record['/example']).toBe(payload)
    expect(Object.isFrozen(record)).toBe(true)
    const getters = { '/example': payload }
    Object.defineProperty(getters, '/example', {
      get() {
        throw new Error('must not read values')
      },
    })
    expect(createPageKeys(getters)).toBe(getters)
    expect(createRouteKeys(getters)).toBe(getters)
  })

  it('preserves sets without iterating or mutating them', () => {
    const values = new Set(['/example', '/[id]'])
    expect(createRouteSet(values)).toBe(values)
    expect([...values]).toEqual(['/example', '/[id]'])
    Object.defineProperty(values, Symbol.iterator, {
      get() {
        throw new Error('must not iterate')
      },
    })
    expect(createRouteSet(values)).toBe(values)
  })

  it('preserves immediate results and Promise identity before resolution', async () => {
    const values = ['/example', '/[id]']
    const promised = Promise.resolve(values)
    expect(createRoutesResult(values)).toBe(values)
    const result = createRoutesResult(promised)
    expect(result).toBe(promised)
    expect(await result).toBe(values)
  })

  it('preserves App paths tables and member sequences without visiting them', () => {
    const pages = ['/(group)/example/page', '/example/route']
    const paths = { '/example': pages }
    expect(createAppPaths(paths)).toBe(paths)
    expect(paths['/example']).toBe(pages)
    const frozen = { '/example': Object.freeze(pages) }
    Object.freeze(frozen)
    expect(createAppPaths(frozen)).toBe(frozen)
    const getters: Record<string, string[]> = { '/example': [] }
    Object.defineProperty(getters, '/example', {
      get() {
        throw new Error('must not read pages')
      },
    })
    expect(createAppPaths(getters)).toBe(getters)
  })

  it('preserves proven Pages module-key/URL text across explicit bridges', () => {
    const page = createPage('/products/[id]')
    const route = createRoute('/products/[id]')
    expect(pagesPageToRoute(page)).toBe(page)
    expect(pagesRouteToPage(route)).toBe(route)
  })
})

describe('selectAppPageEntry', () => {
  it('prefers the direct children page over an expanded catch-all slot', () => {
    const appPaths = createPages([
      '/@slot/[...catchAll]/page',
      '/foo/page',
    ]).sort(compareAppPaths)

    expect(selectAppPageEntry(createRoute('/foo'), appPaths)).toBe('/foo/page')
  })

  it('prefers the direct children page over a direct parallel slot', () => {
    const appPaths = createPages([
      '/[...catchAll]/page',
      '/@slot/[...catchAll]/page',
    ]).sort(compareAppPaths)

    expect(selectAppPageEntry(createRoute('/[...catchAll]'), appPaths)).toBe(
      '/[...catchAll]/page'
    )
  })

  it('prefers the direct children page regardless of input order', () => {
    const appPaths = createPages([
      '/parallel/nested-2/page',
      '/parallel/(new)/@baz/nested-2/page',
    ])

    expect(
      selectAppPageEntry(createRoute('/parallel/nested-2'), appPaths)
    ).toBe('/parallel/nested-2/page')
    expect(
      selectAppPageEntry(
        createRoute('/parallel/nested-2'),
        [...appPaths].reverse()
      )
    ).toBe('/parallel/nested-2/page')
  })

  it('deterministically selects an entry for a slot-only route', () => {
    const appPaths = createPages(['/@alpha/foo/page', '/@beta/foo/page'])

    expect(selectAppPageEntry(createRoute('/foo'), appPaths)).toBe(
      '/@beta/foo/page'
    )
    expect(
      selectAppPageEntry(createRoute('/foo'), [...appPaths].reverse())
    ).toBe('/@beta/foo/page')
  })

  it('matches escaped underscore entries to decoded pathnames', () => {
    expect(
      selectAppPageEntry(createRoute('/_shop'), createPages(['/%5Fshop/page']))
    ).toBe('/%5Fshop/page')
  })

  it('rejects a route with no direct app path', () => {
    const appPaths = createPages([
      '/[...catchAll]/page',
      '/@slot/[...catchAll]/page',
    ])

    expect(() =>
      selectAppPageEntry(createRoute('/unrelated'), appPaths)
    ).toThrow('Invariant: no direct app page entry found for /unrelated')
  })
})

describe('compareAppPaths', () => {
  it('sorts parallel slots before the children page', () => {
    expect(
      createPages(['/[...catchAll]/page', '/@slot/[...catchAll]/page']).sort(
        compareAppPaths
      )
    ).toEqual(['/@slot/[...catchAll]/page', '/[...catchAll]/page'])
  })
})

describe('normalizeRscPath', () => {
  it('should normalize url with .rsc', () => {
    expect(normalizeRscURL('/test.rsc')).toBe('/test')
  })
  it('should normalize url with .rsc and searchparams', () => {
    expect(normalizeRscURL('/test.rsc?abc=def')).toBe('/test?abc=def')
  })
})
