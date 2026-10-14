import type BaseServer from '../../../../server/base-server'
import type {
  InternalNextUrlWithParsedQuery,
  NextUrlWithParsedQuery,
} from '../../../../server/request-meta'
import type { Page, Route } from '../../route-types'
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

describe('selectAppPageEntry', () => {
  it('prefers the direct children page over an expanded catch-all slot', () => {
    const appPaths = (
      ['/@slot/[...catchAll]/page', '/foo/page'] as Page[]
    ).sort(compareAppPaths)

    expect(selectAppPageEntry('/foo' as Route, appPaths)).toBe('/foo/page')
  })

  it('prefers the direct children page over a direct parallel slot', () => {
    const appPaths = (
      ['/[...catchAll]/page', '/@slot/[...catchAll]/page'] as Page[]
    ).sort(compareAppPaths)

    expect(selectAppPageEntry('/[...catchAll]' as Route, appPaths)).toBe(
      '/[...catchAll]/page'
    )
  })

  it('prefers the direct children page regardless of input order', () => {
    const appPaths = [
      '/parallel/nested-2/page',
      '/parallel/(new)/@baz/nested-2/page',
    ] as Page[]

    expect(selectAppPageEntry('/parallel/nested-2' as Route, appPaths)).toBe(
      '/parallel/nested-2/page'
    )
    expect(
      selectAppPageEntry('/parallel/nested-2' as Route, [...appPaths].reverse())
    ).toBe('/parallel/nested-2/page')
  })

  it('deterministically selects an entry for a slot-only route', () => {
    const appPaths = ['/@alpha/foo/page', '/@beta/foo/page'] as Page[]

    expect(selectAppPageEntry('/foo' as Route, appPaths)).toBe(
      '/@beta/foo/page'
    )
    expect(selectAppPageEntry('/foo' as Route, [...appPaths].reverse())).toBe(
      '/@beta/foo/page'
    )
  })

  it('matches escaped underscore entries to decoded pathnames', () => {
    expect(
      selectAppPageEntry('/_shop' as Route, ['/%5Fshop/page'] as Page[])
    ).toBe('/%5Fshop/page')
  })

  it('rejects a route with no direct app path', () => {
    const appPaths = [
      '/[...catchAll]/page',
      '/@slot/[...catchAll]/page',
    ] as Page[]

    expect(() => selectAppPageEntry('/unrelated' as Route, appPaths)).toThrow(
      'Invariant: no direct app page entry found for /unrelated'
    )
  })
})

describe('compareAppPaths', () => {
  it('sorts parallel slots before the children page', () => {
    expect(
      (['/[...catchAll]/page', '/@slot/[...catchAll]/page'] as Page[]).sort(
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
