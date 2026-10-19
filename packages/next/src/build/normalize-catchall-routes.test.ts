import {
  createAppPaths,
  createPage,
  createPages,
  createRoute,
  createRoutes,
  pagesPageToRoute,
  pagesRouteToPage,
  type Page,
  type Route,
} from '../shared/lib/route-types'
import {
  findIncompatibleParallelRouteSlots,
  normalizeCatchAllRoutes,
} from './normalize-catchall-routes'

describe('build Page/Route boundaries', () => {
  it('keeps constructor guards and collection shapes', () => {
    // Type-only probes are compiled by the official repository check, not run.
    const checkTypes = () => {
      const page = createPage('/(group)/@slot/page')
      const route = createRoute('/[slug]')
      type PageAlias = Page
      type RouteAlias = Route
      const pageAlias: PageAlias = page
      const routeAlias: RouteAlias = route
      const pages: readonly [Page, Page] = createPages([
        '/page',
        '/route',
      ] as const)
      const routes: readonly [Route, Route] = createRoutes([
        '/',
        '/[slug]',
      ] as const)
      const mutablePages = createPages(['/page'])
      const mutableRoutes = createRoutes(['/'])
      mutablePages.push(page)
      mutableRoutes.push(route)
      const mutableTuple: [string, string] = ['/page', '/route']
      const tuple: [Page, Page] = createPages(mutableTuple)
      const appPaths = createAppPaths({
        '/': ['/page', '/@slot/page'] as const,
      })
      const root = createRoute('/')
      const appTuple: readonly [Page, Page] = appPaths[root]
      appPaths[root] = pages
      const bridgedPage: Page = pagesRouteToPage(route)
      const bridgedRoute: Route = pagesPageToRoute(createPage('/[slug]'))
      void [tuple, routes, appTuple, bridgedPage, bridgedRoute]

      // @ts-expect-error -- Page and Route remain mutually incompatible.
      const wrongPage: Page = route
      // @ts-expect-error -- Page and Route remain mutually incompatible.
      const wrongRoute: Route = page
      void [wrongPage, wrongRoute]
      // @ts-expect-error -- Raw construction rejects an existing same-role alias.
      createPage(pageAlias)
      // @ts-expect-error -- Raw construction rejects an existing opposite role.
      createPage(routeAlias)
      // @ts-expect-error -- Raw construction rejects an existing opposite role.
      createRoute(pageAlias)
      // @ts-expect-error -- Raw construction rejects an existing same-role alias.
      createRoute(routeAlias)
      // @ts-expect-error -- Explicit generic widening cannot erase the input brand.
      createPage<string>(page)
      // @ts-expect-error -- Explicit generic widening cannot erase the input brand.
      createRoute<string>(route)
      // @ts-expect-error -- Collection construction rejects known Page members.
      createPages([pageAlias])
      // @ts-expect-error -- Collection construction rejects known Route members.
      createPages([routeAlias])
      // @ts-expect-error -- Collection construction rejects known Page members.
      createRoutes([pageAlias])
      // @ts-expect-error -- Collection construction rejects known Route members.
      createRoutes([routeAlias])
      // @ts-expect-error -- Explicit array widening cannot erase known members.
      createPages<string[]>([page])
      // @ts-expect-error -- Explicit array widening cannot erase known members.
      createRoutes<string[]>([route])
      // @ts-expect-error -- Readonly tuples must not become mutable.
      pages.push(page)
      // @ts-expect-error -- Readonly tuples must not become mutable.
      routes[0] = route
      // @ts-expect-error -- App-path member tuple readonly shape is retained.
      appPaths[root][0] = page
      // @ts-expect-error -- The Pages-only bridges have directional inputs.
      pagesRouteToPage(page)
      // @ts-expect-error -- The Pages-only bridges have directional inputs.
      pagesPageToRoute(route)

      const pageKeys: Record<Page, string[]> = {}
      const routeKeys: Record<Route, string[]> = {}
      // @ts-expect-error -- App-path construction rejects known module keys.
      createAppPaths(pageKeys)
      // @ts-expect-error -- App-path construction rejects known URL keys.
      createAppPaths(routeKeys)
      // @ts-expect-error -- App-path construction rejects known module members.
      createAppPaths({ '/': [page] })
      // @ts-expect-error -- App-path construction rejects known URL members.
      createAppPaths({ '/': [route] })
      const readonlyRecord = { '/': ['/page'] } as const
      const mixedRecord: { readonly '/': string[]; '/other': string[] } = {
        '/': ['/page'],
        '/other': ['/other/page'],
      }
      // @ts-expect-error -- Key remapping must not erase readonly records.
      createAppPaths(readonlyRecord)
      // @ts-expect-error -- Mixed readonly records must also be rejected.
      createAppPaths(mixedRecord)

      function forwardScalar<Value extends string>(value: Value) {
        // @ts-expect-error -- A generic string may already carry either brand.
        createPage(value)
        // @ts-expect-error -- A generic string may already carry either brand.
        createRoute(value)
      }
      function forwardSequence<Value extends readonly string[]>(value: Value) {
        // @ts-expect-error -- Generic sequences may already contain brands.
        createPages(value)
        // @ts-expect-error -- Generic sequences may already contain brands.
        createRoutes(value)
      }
      function forwardRecord<Value extends Record<string, readonly string[]>>(
        value: Value
      ) {
        // @ts-expect-error -- Generic records may be readonly or contain brands.
        createAppPaths(value)
      }
      void [forwardScalar, forwardSequence, forwardRecord]
    }
    expect(typeof checkTypes).toBe('function')
  })

  it('preserves text, frozen sequences, records and evaluation counts', () => {
    const rawPage = '/(group)/@slot/[slug]/page'
    const rawRoute = '/[slug]'
    const page = createPage(rawPage)
    const route = createRoute(rawRoute)
    expect(page).toBe(rawPage)
    expect(route).toBe(rawRoute)
    // These two identifiers belong to the Pages router, where the spellings
    // agree. App IDs above are tested only as constructor identity inputs.
    expect(pagesPageToRoute(createPage(rawRoute))).toBe(rawRoute)
    expect(pagesRouteToPage(route)).toBe(rawRoute)

    const frozenPages = Object.freeze(['/page', '/@slot/page'] as const)
    const frozenRoutes = Object.freeze(['/', '/[slug]'] as const)
    expect(createPages(frozenPages)).toBe(frozenPages)
    expect(createRoutes(frozenRoutes)).toBe(frozenRoutes)
    expect(Object.isFrozen(createPages(frozenPages))).toBe(true)
    expect(Object.isFrozen(createRoutes(frozenRoutes))).toBe(true)

    let reads = 0
    let members = frozenPages
    const table = {
      get '/'() {
        reads++
        return members
      },
      set '/'(value: typeof frozenPages) {
        members = value
      },
    }
    const appPaths = createAppPaths(table)
    expect(appPaths).toBe(table)
    expect(reads).toBe(0)
    expect(appPaths[createRoute('/')]).toBe(frozenPages)
    expect(reads).toBe(1)

    let evaluations = 0
    const evaluate = () => {
      evaluations++
      return '/once'
    }
    expect(createPage(evaluate())).toBe('/once')
    expect(evaluations).toBe(1)
    expect(createRoute(evaluate())).toBe('/once')
    expect(evaluations).toBe(2)
  })
})

describe('normalizeCatchallRoutes', () => {
  it('should not add the catch-all to the interception route', () => {
    const appPaths = createAppPaths({
      '/': ['/page'],
      '/[...slug]': ['/[...slug]/page'],
      '/things/[...ids]': ['/things/[...ids]/page'],
      '/(.)things/[...ids]': ['/@modal/(.)things/[...ids]/page'],
    })

    const initialAppPaths = JSON.parse(JSON.stringify(appPaths))

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject(initialAppPaths)
  })

  it('should add the catch-all route to all matched paths when nested', () => {
    const appPaths = createAppPaths({
      '/parallel-nested-catchall': ['/parallel-nested-catchall/page'],
      '/parallel-nested-catchall/[...catchAll]': [
        '/parallel-nested-catchall/[...catchAll]/page',
        '/parallel-nested-catchall/@slot/[...catchAll]/page',
      ],
      '/parallel-nested-catchall/bar': ['/parallel-nested-catchall/bar/page'],
      '/parallel-nested-catchall/foo': [
        '/parallel-nested-catchall/foo/page',
        '/parallel-nested-catchall/@slot/foo/page',
      ],
      '/parallel-nested-catchall/foo/[id]': [
        '/parallel-nested-catchall/foo/[id]/page',
      ],
      '/parallel-nested-catchall/foo/[...catchAll]': [
        '/parallel-nested-catchall/@slot/foo/[...catchAll]/page',
      ],
    })

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject({
      '/parallel-nested-catchall': ['/parallel-nested-catchall/page'],
      '/parallel-nested-catchall/[...catchAll]': [
        '/parallel-nested-catchall/[...catchAll]/page',
        '/parallel-nested-catchall/@slot/[...catchAll]/page',
      ],
      '/parallel-nested-catchall/bar': [
        '/parallel-nested-catchall/bar/page',
        '/parallel-nested-catchall/@slot/[...catchAll]/page', // inserted
      ],
      '/parallel-nested-catchall/foo': [
        '/parallel-nested-catchall/foo/page',
        '/parallel-nested-catchall/@slot/foo/page',
      ],
      '/parallel-nested-catchall/foo/[id]': [
        '/parallel-nested-catchall/foo/[id]/page',
        '/parallel-nested-catchall/@slot/foo/[...catchAll]/page', // inserted
      ],
      '/parallel-nested-catchall/foo/[...catchAll]': [
        '/parallel-nested-catchall/@slot/foo/[...catchAll]/page',
        '/parallel-nested-catchall/[...catchAll]/page', // inserted
      ],
    })
  })

  it('should add the catch-all route to all matched paths at the root', () => {
    const appPaths = createAppPaths({
      '/': ['/page'],
      '/[...catchAll]': ['/[...catchAll]/page', '/@slot/[...catchAll]/page'],
      '/bar': ['/bar/page'],
      '/foo': ['/foo/page', '/@slot/foo/page'],
      '/foo/[id]': ['/foo/[id]/page'],
      '/foo/[...catchAll]': ['/@slot/foo/[...catchAll]/page'],
    })

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject({
      '/': ['/page'],
      '/[...catchAll]': ['/[...catchAll]/page', '/@slot/[...catchAll]/page'],
      '/bar': [
        '/bar/page',
        '/@slot/[...catchAll]/page', // inserted
      ],
      '/foo': ['/foo/page', '/@slot/foo/page'],
      '/foo/[id]': [
        '/foo/[id]/page',
        '/@slot/foo/[...catchAll]/page', // inserted
      ],
      '/foo/[...catchAll]': [
        '/@slot/foo/[...catchAll]/page',
        '/[...catchAll]/page', //inserted
      ],
    })
  })

  // TODO-APP: Enable this test once support for optional catch-all slots is added.
  it.skip('should only match optional catch-all paths to the "index" of a segment', () => {
    const appPaths = createAppPaths({
      '/': ['/page'],
      '/[[...catchAll]]': ['/@slot/[[...catchAll]]/page'],
      '/foo': ['/foo/page'],
      '/foo/[[...catchAll]]': ['/foo/@slot/[[...catchAll]]/page'],
    })

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject({
      '/': [
        '/page',
        '/@slot/[[...catchAll]]/page', // inserted
      ],
      '/[[...catchAll]]': ['/@slot/[[...catchAll]]/page'],
      '/foo': ['/foo/page', '/@slot/[[...catchAll]]/page'],
      '/foo/[[...catchAll]]': ['/foo/@slot/[[...catchAll]]/page'],
    })
  })

  it('should not add the catch-all route to segments that have a more specific default', () => {
    const appPaths = createAppPaths({
      '/': ['/page'],
      '/[[...catchAll]]': ['/[[...catchAll]]/page'],
      '/nested/[foo]/[bar]/default': [
        '/nested/[foo]/[bar]/default',
        '/nested/[foo]/[bar]/@slot/default',
      ],
      '/nested/[foo]/[bar]': ['/nested/[foo]/[bar]/@slot/page'],
      '/nested/[foo]/[bar]/[baz]/default': [
        '/nested/[foo]/[bar]/@slot/[baz]/default',
        '/[[...catchAll]]/page',
      ],
      '/nested/[foo]/[bar]/[baz]': ['/nested/[foo]/[bar]/@slot/[baz]/page'],
    })

    const initialAppPaths = JSON.parse(JSON.stringify(appPaths))

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject(initialAppPaths)
  })

  it('should not add the catch-all route to segments that have a more specific [dynamicRoute]', () => {
    const appPaths = createAppPaths({
      '/': ['/page'],
      '/[[...catchAll]]': ['/[[...catchAll]]/page'],
      '/nested/[foo]/[bar]/default': [
        '/nested/[foo]/[bar]/default',
        '/nested/[foo]/[bar]/@slot0/default',
        '/nested/[foo]/[bar]/@slot2/default',
      ],
      '/nested/[foo]/[bar]': [
        '/nested/[foo]/[bar]/@slot0/page',
        '/nested/[foo]/[bar]/@slot1/page',
      ],
      '/nested/[foo]/[bar]/[baz]': [
        '/nested/[foo]/[bar]/@slot0/[baz]/page',
        '/nested/[foo]/[bar]/@slot1/[baz]/page',
      ],
      '/[locale]/nested/[foo]/[bar]/[baz]/[qux]': [
        '/[locale]/nested/[foo]/[bar]/@slot1/[baz]/[qux]/page',
      ],
    })

    const initialAppPaths = JSON.parse(JSON.stringify(appPaths))

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject(initialAppPaths)
  })

  it('should not add the catch-all route to non-catchall segments that are more specific', () => {
    const appPaths = createAppPaths({
      '/': ['/page'],
      '/[locale]/[[...catchAll]]': ['/[locale]/[[...catchAll]]/page'],
      '/[locale]/nested/default': [
        '/[locale]/nested/default',
        '/[locale]/nested/@slot0/default',
        '/[locale]/nested/@slot1/default',
      ],
      '/[locale]/nested': ['/[locale]/nested/page'],
      '/[locale]/nested/bar': ['/[locale]/nested/@slot0/bar/page'],
      '/[locale]/nested/foo': ['/[locale]/nested/@slot0/foo/page'],
      '/[locale]/nested/baz': ['/[locale]/nested/@slot1/baz/page'],
    })

    const initialAppPaths = JSON.parse(JSON.stringify(appPaths))

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject(initialAppPaths)
  })

  it('should not add the catch-all route to a path that has a @children slot', async () => {
    const appPaths = createAppPaths({
      '/': ['/@children/page', '/@slot/page'],
      '/[...slug]': ['/[...slug]/page'],
      '/nested': ['/nested/@children/page'],
    })

    const initialAppPaths = JSON.parse(JSON.stringify(appPaths))

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject(initialAppPaths)
  })

  describe('strictRouteMatching pruning', () => {
    it('does not report pages when strict route matching is disabled', () => {
      const appPaths = createAppPaths({
        '/[...slug]': ['/[...slug]/page'],
        '/foo': ['/@first/foo/page'],
        '/bar': ['/@second/bar/page'],
      })

      const { unmatchedAppPages } = normalizeCatchAllRoutes(appPaths)

      expect(unmatchedAppPages).toEqual([])
    })

    it('does not require an implicit children slot with no routes', () => {
      const appPaths = createAppPaths({
        '/[...slug]': ['/@catchall/[...slug]/page'],
        '/foo': ['/@specific/foo/page'],
      })

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual({
        '/foo': ['/@specific/foo/page', '/@catchall/[...slug]/page'],
      })
    })

    it('keeps a named-only matcher when every declared slot matches', () => {
      const appPaths = createAppPaths({
        '/[...slug]': ['/@left/[...slug]/page', '/@right/[...slug]/page'],
      })
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual(expected)
    })

    it('does not infer children from built-in routes', () => {
      const appPaths = createAppPaths({
        '/_not-found': ['/built-in/global-not-found'],
        '/_global-error': ['/built-in/app-error'],
        '/[case]': ['/@slot/[case]/page'],
      })
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
        defaultAppPaths: createPages([
          '/_not-found/page',
          '/_global-error/page',
          '/@slot/default',
        ]),
      })

      expect(appPaths).toEqual(expected)
    })

    it('does not apply page completeness to route handlers', () => {
      const appPaths = createAppPaths({
        '/': ['/page', '/@slot/page'],
        '/icon.png': ['/@slot/icon/route'],
      })
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual(expected)
    })

    it('prunes only the incomplete catch-all matcher', () => {
      const appPaths = createAppPaths({
        '/foo': ['/foo/page'],
        '/bar': ['/bar/page'],
        '/[...parts]': ['/@slot/[...parts]/page'],
      })

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual({
        '/foo': ['/foo/page', '/@slot/[...parts]/page'],
        '/bar': ['/bar/page', '/@slot/[...parts]/page'],
      })
    })

    it('prunes a children catch-all when a named slot is missing', () => {
      const appPaths = createAppPaths({
        '/[...slug]': ['/[...slug]/page'],
        '/foo': ['/@first/foo/page'],
        '/bar': ['/@second/bar/page'],
      })

      const { unmatchedAppPages } = normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
      })

      expect(appPaths).toEqual({})
      expect(unmatchedAppPages).toEqual([
        '/@first/foo/page',
        '/@second/bar/page',
        '/[...slug]/page',
      ])
    })

    it('prunes an optional children catch-all when a named slot is missing', () => {
      const appPaths = createAppPaths({
        '/[[...slug]]': ['/[[...slug]]/page'],
        '/specific': ['/specific/page', '/@slot/specific/page'],
      })

      const { unmatchedAppPages } = normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
      })

      expect(appPaths).toEqual({
        '/specific': ['/specific/page', '/@slot/specific/page'],
      })
      expect(unmatchedAppPages).toEqual(['/[[...slug]]/page'])
    })

    it('prunes a catch-all with an incomplete nested parallel route', () => {
      const appPaths = createAppPaths({
        '/nested/[...slug]': [
          '/nested/[...slug]/page',
          '/nested/@outer/[...slug]/page',
        ],
        '/nested/specific': [
          '/nested/specific/page',
          '/nested/@outer/specific/page',
          '/nested/@outer/@inner/specific/page',
        ],
      })

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual({
        '/nested/specific': [
          '/nested/specific/page',
          '/nested/@outer/specific/page',
          '/nested/@outer/@inner/specific/page',
        ],
      })
    })

    it('prunes an incomplete catch-all through a route group', () => {
      const appPaths = createAppPaths({
        '/grouped/[...slug]': ['/(pruning-group)/grouped/[...slug]/page'],
        '/grouped/specific': [
          '/(pruning-group)/grouped/specific/page',
          '/(pruning-group)/grouped/@slot/specific/page',
        ],
      })

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual({
        '/grouped/specific': [
          '/(pruning-group)/grouped/specific/page',
          '/(pruning-group)/grouped/@slot/specific/page',
        ],
      })
    })

    it('keeps a catch-all matcher when every slot has catch-all coverage', () => {
      const appPaths = createAppPaths({
        '/[...slug]': ['/[...slug]/page', '/@slot/[...slug]/page'],
        '/specific': ['/specific/page', '/@slot/specific/page'],
      })
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual(expected)
    })

    it('keeps catch-all routes when missing siblings have defaults', () => {
      const appPaths = createAppPaths({
        '/[...slug]': ['/[...slug]/page'],
        '/specific': ['/@slot/specific/page'],
      })

      normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
        defaultAppPaths: createPages(['/default', '/@slot/default']),
      })

      expect(appPaths).toEqual({
        '/[...slug]': ['/[...slug]/page'],
        '/specific': ['/@slot/specific/page', '/[...slug]/page'],
      })
    })

    it('prunes a static matcher when a real children slot is unmatched', () => {
      const appPaths = createAppPaths({
        '/': ['/page'],
        '/details': ['/@panel/details/page'],
      })

      normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
        defaultAppPaths: createPages(['/@panel/default']),
      })

      expect(appPaths).toEqual({
        '/': ['/page'],
      })
    })

    it('keeps a static matcher when every declared slot matches', () => {
      const appPaths = createAppPaths({
        '/foo': ['/@first/foo/page', '/@second/foo/page'],
      })
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual(expected)
    })

    it('prunes static matchers with incompatible named slots', () => {
      const appPaths = createAppPaths({
        '/foo': ['/@first/foo/page'],
        '/bar': ['/@second/bar/page'],
      })

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual({})
    })

    it('keeps an interception catch-all when host slots are retained', () => {
      const appPaths = createAppPaths({
        '/': ['/@content/page', '/@secondary/page'],
        '/photo/[...slug]': ['/@modal/(.)photo/[...slug]/page'],
      })
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
        defaultAppPaths: createPages(['/@modal/default']),
      })

      expect(appPaths).toEqual(expected)
    })

    it('keeps real children and named slots at an interception host', () => {
      const appPaths = createAppPaths({
        '/': ['/page', '/@sidebar/page'],
        '/photo/[...slug]': ['/@modal/(.)photo/[...slug]/page'],
      })
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
        defaultAppPaths: createPages(['/@modal/default']),
      })

      expect(appPaths).toEqual(expected)
    })

    it('keeps named slots when children contains the interception catch-all', () => {
      const appPaths = createAppPaths({
        '/': ['/page', '/@sidebar/page'],
        '/photo/[...slug]': ['/(.)photo/[...slug]/page'],
      })
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual(expected)
    })

    it('keeps slots owned by the immediate interception host through a route group', () => {
      const appPaths = createAppPaths({
        '/': ['/(host)/@modal/page', '/(host)/@modal/@sidebar/page'],
        '/photo/[...slug]': ['/(host)/@modal/(.)photo/[...slug]/page'],
      })
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual(expected)
    })

    it('keeps an optional interception catch-all when host slots are retained', () => {
      const appPaths = createAppPaths({
        '/': ['/page', '/@sidebar/page'],
        '/photo/[[...slug]]': ['/@modal/(.)photo/[[...slug]]/page'],
      })
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
        defaultAppPaths: createPages(['/@modal/default']),
      })

      expect(appPaths).toEqual(expected)
    })

    it('prunes every incomplete matcher inside an interception subtree', () => {
      const appPaths = createAppPaths({
        '/photo/[...slug]': ['/@modal/(.)photo/@catchall/[...slug]/page'],
        '/photo/specific': ['/@modal/(.)photo/@specific/specific/page'],
      })

      const { unmatchedAppPages } = normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
      })

      expect(appPaths).toEqual({})
      expect(unmatchedAppPages).toEqual([
        '/@modal/(.)photo/@catchall/[...slug]/page',
        '/@modal/(.)photo/@specific/specific/page',
      ])
    })

    it('does not report a catch-all page used by more specific matchers', () => {
      const appPaths = createAppPaths({
        '/foo': ['/foo/page'],
        '/bar': ['/bar/page'],
        '/[...parts]': ['/@slot/[...parts]/page'],
      })

      const { unmatchedAppPages } = normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
      })

      expect(unmatchedAppPages).toEqual([])
    })
  })

  describe('incompatible parallel route slots', () => {
    it('reports incompatible static matchers and still prunes them', () => {
      const appPaths = createAppPaths({
        '/foo': ['/@left/foo/page'],
        '/bar': ['/@right/bar/page'],
      })

      const { incompatibleParallelRouteSlots } = normalizeCatchAllRoutes(
        appPaths,
        { strictRouteMatching: true }
      )

      expect(incompatibleParallelRouteSlots).toEqual([
        {
          layoutPath: '/',
          route: '/bar',
          missingSlots: ['@left'],
        },
        {
          layoutPath: '/',
          route: '/foo',
          missingSlots: ['@right'],
        },
      ])
      expect(appPaths).toEqual({})
    })

    it('does not report a broad catch-all matcher that can be pruned', () => {
      const appPaths = createAppPaths({
        '/foo': ['/foo/page'],
        '/[...parts]': ['/@slot/[...parts]/page'],
      })

      const { incompatibleParallelRouteSlots } = normalizeCatchAllRoutes(
        appPaths,
        { strictRouteMatching: true }
      )

      expect(incompatibleParallelRouteSlots).toEqual([])
      expect(appPaths).toEqual({
        '/foo': ['/foo/page', '/@slot/[...parts]/page'],
      })
    })

    it('reports static pages in sibling slots that cannot render together', () => {
      const incompatibleRoutes = findIncompatibleParallelRouteSlots(
        createAppPaths({
          '/foo': ['/@left/foo/page'],
          '/bar': ['/@right/bar/page'],
        })
      )

      expect(incompatibleRoutes).toEqual([
        {
          layoutPath: '/',
          route: '/bar',
          missingSlots: ['@left'],
        },
        {
          layoutPath: '/',
          route: '/foo',
          missingSlots: ['@right'],
        },
      ])
    })

    it('reports an incompatible children route at the nested owner', () => {
      const incompatibleRoutes = findIncompatibleParallelRouteSlots(
        createAppPaths({
          '/dashboard/foo': ['/dashboard/foo/page'],
          '/dashboard/bar': ['/dashboard/@panel/bar/page'],
        })
      )

      expect(incompatibleRoutes).toEqual([
        {
          layoutPath: '/dashboard',
          route: '/dashboard/bar',
          missingSlots: ['children'],
        },
        {
          layoutPath: '/dashboard',
          route: '/dashboard/foo',
          missingSlots: ['@panel'],
        },
      ])
    })

    it('accepts explicit defaults for the missing sibling slots', () => {
      const incompatibleRoutes = findIncompatibleParallelRouteSlots(
        createAppPaths({
          '/foo': ['/@left/foo/page'],
          '/bar': ['/@right/bar/page'],
        }),
        createPages(['/@left/default', '/@right/default'])
      )

      expect(incompatibleRoutes).toEqual([])
    })

    it('does not infer children from framework-owned defaults', () => {
      const incompatibleRoutes = findIncompatibleParallelRouteSlots(
        createAppPaths({
          '/foo': ['/@left/foo/page'],
          '/bar': ['/@right/bar/page'],
          '/_not-found': ['/next/dist/builtin/global-not-found/page'],
        }),
        createPages(['/_global-error/page'])
      )

      expect(incompatibleRoutes).toEqual([
        {
          layoutPath: '/',
          route: '/bar',
          missingSlots: ['@left'],
        },
        {
          layoutPath: '/',
          route: '/foo',
          missingSlots: ['@right'],
        },
      ])
    })

    it('does not apply ordinary matching requirements to interception routes', () => {
      const incompatibleRoutes = findIncompatibleParallelRouteSlots(
        createAppPaths({
          '/': ['/@content/page'],
          '/photo/(.)[id]': ['/@modal/(.)photo/[id]/page'],
        }),
        createPages(['/@modal/default'])
      )

      expect(incompatibleRoutes).toEqual([])
    })
  })
})
