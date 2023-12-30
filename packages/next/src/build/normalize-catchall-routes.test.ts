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

    normalizeCatchAllRoutes(appPaths)

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

    normalizeCatchAllRoutes(appPaths)

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

    normalizeCatchAllRoutes(appPaths)

    expect(appPaths).toMatchObject({
      '/': [
        '/page',
        '/@slot/[...catchAll]/page', // inserted
      ],
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
})
