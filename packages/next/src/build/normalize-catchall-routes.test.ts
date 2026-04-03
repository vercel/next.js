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

  // Test to verify normalizeDynamicRoutes doesn't break static-siblings parallel route test
  it('should not propagate dynamic parallel routes when the slot already has a static match', () => {
    // Mimics the static-siblings dashboard scenario:
    // /dashboard/@panel/settings/page.tsx (static)
    // /dashboard/@panel/[id]/page.tsx (dynamic)
    const appPaths: Record<string, string[]> = {
      '/dashboard': ['/dashboard/page'],
      '/dashboard/settings': ['/dashboard/@panel/settings/page'],
      '/dashboard/[id]': ['/dashboard/@panel/[id]/page'],
    }

    const initialAppPaths = JSON.parse(JSON.stringify(appPaths))

    normalizeCatchAllRoutes(appPaths)

    // /dashboard/settings should NOT get /dashboard/@panel/[id]/page added
    // because @panel already has a match (settings)
    expect(appPaths).toMatchObject(initialAppPaths)
  })

  // Test for the actual fix: dynamic parallel route should be propagated when no static match exists
  it('should propagate dynamic parallel routes when the slot has no match', () => {
    // Mimics the #62656 scenario:
    // /test/[testParam]/page.tsx (children dynamic)
    // /test/static/page.tsx (children static)
    // /@parallel/test/[testParam]/page.tsx (parallel dynamic, no static match)
    const appPaths: Record<string, string[]> = {
      '/': ['/page'],
      '/test/static': ['/test/static/page'],
      '/test/[testParam]': [
        '/test/[testParam]/page',
        '/@parallel/test/[testParam]/page',
      ],
    }

    normalizeCatchAllRoutes(appPaths)

    // /test/static SHOULD get /@parallel/test/[testParam]/page added
    // because @parallel has no match for /test/static
    expect(appPaths['/test/static']).toContain(
      '/@parallel/test/[testParam]/page'
    )
  })
})
