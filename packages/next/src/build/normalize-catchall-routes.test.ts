import { normalizeCatchAllRoutes } from './normalize-catchall-routes'

describe('normalizeCatchallRoutes', () => {
  it('should not add the catch-all to the interception route', () => {
    const appPaths = {
      '/': ['/page'],
      '/[...slug]': ['/[...slug]/page'],
      '/things/[...ids]': ['/things/[...ids]/page'],
      '/(.)things/[...ids]': ['/@modal/(.)things/[...ids]/page'],
    }

    const initialAppPaths = JSON.parse(JSON.stringify(appPaths))

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject(initialAppPaths)
  })

  it('should add the catch-all route to all matched paths when nested', () => {
    const appPaths = {
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
    }

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
    const appPaths = {
      '/': ['/page'],
      '/[...catchAll]': ['/[...catchAll]/page', '/@slot/[...catchAll]/page'],
      '/bar': ['/bar/page'],
      '/foo': ['/foo/page', '/@slot/foo/page'],
      '/foo/[id]': ['/foo/[id]/page'],
      '/foo/[...catchAll]': ['/@slot/foo/[...catchAll]/page'],
    }

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
    const appPaths = {
      '/': ['/page'],
      '/[[...catchAll]]': ['/@slot/[[...catchAll]]/page'],
      '/foo': ['/foo/page'],
      '/foo/[[...catchAll]]': ['/foo/@slot/[[...catchAll]]/page'],
    }

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
    const appPaths = {
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
    }

    const initialAppPaths = JSON.parse(JSON.stringify(appPaths))

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject(initialAppPaths)
  })

  it('should not add the catch-all route to segments that have a more specific [dynamicRoute]', () => {
    const appPaths = {
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
    }

    const initialAppPaths = JSON.parse(JSON.stringify(appPaths))

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject(initialAppPaths)
  })

  it('should not add the catch-all route to non-catchall segments that are more specific', () => {
    const appPaths = {
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
    }

    const initialAppPaths = JSON.parse(JSON.stringify(appPaths))

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject(initialAppPaths)
  })

  it('should not add the catch-all route to a path that has a @children slot', async () => {
    const appPaths = {
      '/': ['/@children/page', '/@slot/page'],
      '/[...slug]': ['/[...slug]/page'],
      '/nested': ['/nested/@children/page'],
    }

    const initialAppPaths = JSON.parse(JSON.stringify(appPaths))

    // normalize appPaths against catchAlls
    normalizeCatchAllRoutes(appPaths)

    // ensure values are correct after normalizing
    expect(appPaths).toMatchObject(initialAppPaths)
  })

  describe('strictRouteMatching pruning', () => {
    it('does not require an implicit children slot with no routes', () => {
      const appPaths = {
        '/[...slug]': ['/@catchall/[...slug]/page'],
        '/foo': ['/@specific/foo/page'],
      }

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual({
        '/foo': ['/@specific/foo/page', '/@catchall/[...slug]/page'],
      })
    })

    it('keeps a named-only matcher when every declared slot matches', () => {
      const appPaths = {
        '/[...slug]': ['/@left/[...slug]/page', '/@right/[...slug]/page'],
      }
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual(expected)
    })

    it('does not infer children from built-in routes', () => {
      const appPaths = {
        '/_not-found': ['/built-in/global-not-found'],
        '/_global-error': ['/built-in/app-error'],
        '/[case]': ['/@slot/[case]/page'],
      }
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
        defaultAppPaths: [
          '/_not-found/page',
          '/_global-error/page',
          '/@slot/default',
        ],
      })

      expect(appPaths).toEqual(expected)
    })

    it('does not apply page completeness to route handlers', () => {
      const appPaths = {
        '/': ['/page', '/@slot/page'],
        '/icon.png': ['/@slot/icon/route'],
      }
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual(expected)
    })

    it('prunes only the incomplete catch-all matcher', () => {
      const appPaths = {
        '/foo': ['/foo/page'],
        '/bar': ['/bar/page'],
        '/[...parts]': ['/@slot/[...parts]/page'],
      }

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual({
        '/foo': ['/foo/page', '/@slot/[...parts]/page'],
        '/bar': ['/bar/page', '/@slot/[...parts]/page'],
      })
    })

    it('prunes a children catch-all when a named slot is missing', () => {
      const appPaths = {
        '/[...slug]': ['/[...slug]/page'],
        '/foo': ['/@first/foo/page'],
        '/bar': ['/@second/bar/page'],
      }

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual({})
    })

    it('prunes an optional children catch-all when a named slot is missing', () => {
      const appPaths = {
        '/[[...slug]]': ['/[[...slug]]/page'],
        '/specific': ['/specific/page', '/@slot/specific/page'],
      }

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual({
        '/specific': ['/specific/page', '/@slot/specific/page'],
      })
    })

    it('prunes a catch-all with an incomplete nested parallel route', () => {
      const appPaths = {
        '/nested/[...slug]': [
          '/nested/[...slug]/page',
          '/nested/@outer/[...slug]/page',
        ],
        '/nested/specific': [
          '/nested/specific/page',
          '/nested/@outer/specific/page',
          '/nested/@outer/@inner/specific/page',
        ],
      }

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
      const appPaths = {
        '/grouped/[...slug]': ['/(pruning-group)/grouped/[...slug]/page'],
        '/grouped/specific': [
          '/(pruning-group)/grouped/specific/page',
          '/(pruning-group)/grouped/@slot/specific/page',
        ],
      }

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual({
        '/grouped/specific': [
          '/(pruning-group)/grouped/specific/page',
          '/(pruning-group)/grouped/@slot/specific/page',
        ],
      })
    })

    it('keeps a catch-all matcher when every slot has catch-all coverage', () => {
      const appPaths = {
        '/[...slug]': ['/[...slug]/page', '/@slot/[...slug]/page'],
        '/specific': ['/specific/page', '/@slot/specific/page'],
      }
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual(expected)
    })

    it('keeps catch-all routes when missing siblings have defaults', () => {
      const appPaths = {
        '/[...slug]': ['/[...slug]/page'],
        '/specific': ['/@slot/specific/page'],
      }

      normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
        defaultAppPaths: ['/default', '/@slot/default'],
      })

      expect(appPaths).toEqual({
        '/[...slug]': ['/[...slug]/page'],
        '/specific': ['/@slot/specific/page', '/[...slug]/page'],
      })
    })

    it('prunes a static matcher when a real children slot is unmatched', () => {
      const appPaths = {
        '/': ['/page'],
        '/details': ['/@panel/details/page'],
      }

      normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
        defaultAppPaths: ['/@panel/default'],
      })

      expect(appPaths).toEqual({
        '/': ['/page'],
      })
    })

    it('keeps a static matcher when every declared slot matches', () => {
      const appPaths = {
        '/foo': ['/@first/foo/page', '/@second/foo/page'],
      }
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual(expected)
    })

    it('prunes static matchers with incompatible named slots', () => {
      const appPaths = {
        '/foo': ['/@first/foo/page'],
        '/bar': ['/@second/bar/page'],
      }

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual({})
    })

    it('keeps an interception catch-all when host slots are retained', () => {
      const appPaths = {
        '/': ['/@content/page', '/@secondary/page'],
        '/photo/[...slug]': ['/@modal/(.)photo/[...slug]/page'],
      }
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
        defaultAppPaths: ['/@modal/default'],
      })

      expect(appPaths).toEqual(expected)
    })

    it('keeps real children and named slots at an interception host', () => {
      const appPaths = {
        '/': ['/page', '/@sidebar/page'],
        '/photo/[...slug]': ['/@modal/(.)photo/[...slug]/page'],
      }
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
        defaultAppPaths: ['/@modal/default'],
      })

      expect(appPaths).toEqual(expected)
    })

    it('keeps named slots when children contains the interception catch-all', () => {
      const appPaths = {
        '/': ['/page', '/@sidebar/page'],
        '/photo/[...slug]': ['/(.)photo/[...slug]/page'],
      }
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual(expected)
    })

    it('keeps slots owned by the immediate interception host through a route group', () => {
      const appPaths = {
        '/': ['/(host)/@modal/page', '/(host)/@modal/@sidebar/page'],
        '/photo/[...slug]': ['/(host)/@modal/(.)photo/[...slug]/page'],
      }
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual(expected)
    })

    it('keeps an optional interception catch-all when host slots are retained', () => {
      const appPaths = {
        '/': ['/page', '/@sidebar/page'],
        '/photo/[[...slug]]': ['/@modal/(.)photo/[[...slug]]/page'],
      }
      const expected = structuredClone(appPaths)

      normalizeCatchAllRoutes(appPaths, {
        strictRouteMatching: true,
        defaultAppPaths: ['/@modal/default'],
      })

      expect(appPaths).toEqual(expected)
    })

    it('prunes every incomplete matcher inside an interception subtree', () => {
      const appPaths = {
        '/photo/[...slug]': ['/@modal/(.)photo/@catchall/[...slug]/page'],
        '/photo/specific': ['/@modal/(.)photo/@specific/specific/page'],
      }

      normalizeCatchAllRoutes(appPaths, { strictRouteMatching: true })

      expect(appPaths).toEqual({})
    })
  })
})
