import { createHash } from 'crypto'
import {
  getResponseCacheOwner,
  getRouteCacheKey,
  isRouteCacheOwner,
} from 'next/dist/server/lib/route-cache-key'
import { RouteKind } from 'next/dist/server/route-kind'
import {
  createPage,
  createRoute,
  createRoutes,
  pagesRouteToPage,
  type Route,
} from 'next/dist/shared/lib/route-types'
import type { ResponseCacheOwner } from 'next/dist/server/lib/route-cache-key'

const pages = (sourceRoute: Route): ResponseCacheOwner => ({
  kind: RouteKind.PAGES,
  sourceRoute: sourceRoute,
})

describe('response cache identity', () => {
  it('rejects callers that omit the source route', () => {
    expect(() => {
      // @ts-expect-error a pathname alone cannot identify a response cache entry
      getRouteCacheKey('/blog/post')
    }).toThrow('Response cache requires a source route')
  })

  it('separates source routes that accept the same normalized pathname', () => {
    expect(
      getRouteCacheKey(
        createRoute('/blog/post'),
        pages(createRoute('/blog/[slug]'))
      )
    ).not.toBe(
      getRouteCacheKey(
        createRoute('/blog/post'),
        pages(createRoute('/[...slug]'))
      )
    )
  })

  it.each(createRoutes(['/', '/nested', '/blog/[slug]', '/index']))(
    'uses the Pages pathname regardless of the bundler module name: %s',
    (pathname) => {
      const webpack = getResponseCacheOwner({
        kind: RouteKind.PAGES,
        // These Pages-only fixtures deliberately use the same URL and module spelling.
        page: pagesRouteToPage(pathname),
        pathname,
      })
      const turbopack = getResponseCacheOwner({
        kind: RouteKind.PAGES,
        page: createPage(pathname === '/' ? '/index' : `${pathname}/index`),
        pathname,
      })
      expect(webpack).toEqual(pages(pathname))
      expect(turbopack).toEqual(webpack)
      expect(getRouteCacheKey(createRoute('/post'), turbopack)).toBe(
        getRouteCacheKey(createRoute('/post'), webpack)
      )
    }
  )

  describe.each(['nodejs', 'edge'])('%s hashing', (runtime) => {
    beforeEach(() => {
      jest.replaceProperty(process, 'env', {
        ...process.env,
        NEXT_RUNTIME: runtime,
      })
    })
    afterEach(() => jest.restoreAllMocks())

    it.each(['/blog/[slug]', '/(group)/@slot/café/😀/page'])(
      'uses SHA-256 of the full source module: %s',
      (page) => {
        const hash = createHash('sha256').update(page).digest('hex')
        expect(
          getRouteCacheKey(createRoute('/blog/post'), pages(createRoute(page)))
        ).toBe(`/route-cache/PAGES/${hash}/$/blog/post`)
      }
    )

    it.each([
      `/${'é'.repeat(50)}/page`,
      `/${Array.from({ length: 80 }, (_, i) => `(group${i})`).join('/')}/page`,
    ])('bounds source directory length and depth: %s', (page) => {
      expect(
        getRouteCacheKey(createRoute('/short'), {
          kind: RouteKind.APP_PAGE,
          sourceRoute: createPage(page),
        })
      ).toMatch(/^\/route-cache\/APP_PAGE\/[a-f0-9]{64}\/\$\/short$/)
    })
  })

  it('separates response kinds and internal app module identities', () => {
    const keys = [
      { kind: RouteKind.PAGES, page: createPage('/blog/[slug]') },
      { kind: RouteKind.APP_PAGE, page: createPage('/blog/[slug]') },
      { kind: RouteKind.APP_ROUTE, page: createPage('/blog/[slug]') },
      {
        kind: RouteKind.APP_PAGE,
        page: createPage('/(group)/blog/[slug]/page'),
      },
      { kind: RouteKind.APP_PAGE, page: createPage('/@slot/blog/[slug]/page') },
    ].map((definition) => {
      const owner = getResponseCacheOwner({
        ...definition,
        pathname: createRoute('/blog/[slug]'),
      })
      expect(owner.sourceRoute).toBe(definition.page)
      return getRouteCacheKey(createRoute('/blog/post'), owner)
    })
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('cannot confuse a source-route delimiter with the pathname', () => {
    expect(
      getRouteCacheKey(createRoute('/b/$/c'), pages(createRoute('/a')))
    ).not.toBe(
      getRouteCacheKey(createRoute('/c'), pages(createRoute('/a/$/b')))
    )
    expect(
      getRouteCacheKey(createRoute('/post'), pages(createRoute('/%24')))
    ).not.toBe(getRouteCacheKey(createRoute('/post'), pages(createRoute('/$'))))
  })

  it('normalizes the pathname exactly once', () => {
    const route = pages(createRoute('/[[...slug]]'))
    const keys = ['/', '/index', '/index/index'].map((pathname) =>
      getRouteCacheKey(createRoute(pathname), route)
    )
    expect(new Set(keys).size).toBe(3)
    expect(keys.map((key) => key.split('/$/')[1])).toEqual([
      'index',
      'index/index',
      'index/index/index',
    ])
  })

  it('retains locale and escaped pathname distinctions', () => {
    const route = pages(createRoute('/[...slug]'))
    const keys = ['/en/post', '/fr/post', '/a/b', '/a%2Fb', '/a%252Fb'].map(
      (pathname) => getRouteCacheKey(createRoute(pathname), route)
    )
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(['/a/../b', '/a/./b', '/a//b'])(
    'rejects pathname traversal or normalization across the namespace: %s',
    (pathname) => {
      expect(() =>
        getRouteCacheKey(
          createRoute(pathname),
          pages(createRoute('/[...slug]'))
        )
      ).toThrow()
    }
  )
})

describe('prerender ownership without a cache-key manifest', () => {
  it('recognizes a Pages index module without admitting a sibling', () => {
    const prerender = {
      srcRoute: createRoute('/[first]'),
      dataRoute: createRoute('/_next/data/build/en/first.json'),
    }
    expect(
      isRouteCacheOwner(
        createRoute('/en/first'),
        getResponseCacheOwner({
          kind: RouteKind.PAGES,
          page: createPage('/[first]/index'),
          pathname: createRoute('/[first]'),
        }),
        prerender,
        ['en', 'es']
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        createRoute('/en/first'),
        getResponseCacheOwner({
          kind: RouteKind.PAGES,
          page: createPage('/[...slug]/index'),
          pathname: createRoute('/[...slug]'),
        }),
        prerender,
        ['en', 'es']
      )
    ).toBe(false)
  })

  it('requires the source route of a concrete prerender', () => {
    const prerender = {
      srcRoute: createRoute('/blog/[slug]'),
      dataRoute: createRoute('/_next/data/build/blog/post.json'),
    }
    expect(
      isRouteCacheOwner(
        createRoute('/blog/post'),
        pages(createRoute('/blog/[slug]')),
        prerender
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        createRoute('/blog/post'),
        pages(createRoute('/[...slug]')),
        prerender
      )
    ).toBe(false)
    expect(
      isRouteCacheOwner(
        createRoute('/blog/post'),
        pages(createRoute('/blog/[slug]')),
        undefined
      )
    ).toBe(false)
  })

  it('recognizes static Pages owners with and without locales', () => {
    const prerender = {
      srcRoute: null,
      dataRoute: createRoute('/_next/data/build/about.json'),
    }
    expect(
      isRouteCacheOwner(
        createRoute('/about'),
        pages(createRoute('/about')),
        prerender
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        createRoute('/fr/about'),
        pages(createRoute('/about')),
        prerender,
        ['en', 'fr']
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        createRoute('/fr'),
        pages(createRoute('/')),
        prerender,
        ['en', 'fr']
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        createRoute('/other/about'),
        pages(createRoute('/about')),
        prerender,
        ['en', 'fr']
      )
    ).toBe(false)
  })

  it('recognizes locale-prefixed Pages fallback shells', () => {
    const prerender = {
      dataRoute: createRoute('/_next/data/build/blog/[slug].json'),
      fallbackSourceRoute: undefined,
    }
    expect(
      isRouteCacheOwner(
        createRoute('/fr/blog/[slug]'),
        pages(createRoute('/blog/[slug]')),
        prerender,
        ['en', 'fr']
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        createRoute('/fr/blog/[slug]'),
        pages(createRoute('/[...slug]')),
        prerender,
        ['en', 'fr']
      )
    ).toBe(false)
  })

  it('uses the original source for partially specialized PPR shells', () => {
    const prerender = {
      fallbackSourceRoute: createRoute('/catalog/[category]/[item]'),
      dataRoute: createRoute('/catalog/a/[item].rsc'),
    }
    expect(
      isRouteCacheOwner(
        createRoute('/catalog/a/[item]'),
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: createPage('/(shop)/catalog/[category]/[item]/page'),
        },
        prerender
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        createRoute('/catalog/a/[item]'),
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: createPage('/catalog/a/[item]/page'),
        },
        prerender
      )
    ).toBe(false)
  })

  it('uses App route normalization for groups, slots, and escaped underscores', () => {
    expect(
      isRouteCacheOwner(
        createRoute('/_blog/post'),
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: createPage('/(group)/@slot/%5Fblog/[slug]/page'),
        },
        {
          srcRoute: createRoute('/_blog/[slug]'),
          dataRoute: createRoute('/_blog/post.rsc'),
        }
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        createRoute('/photos/post'),
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: createPage('/@modal/(.)photos/[slug]/page'),
        },
        {
          srcRoute: createRoute('/photos/[slug]'),
          dataRoute: createRoute('/photos/post.rsc'),
        }
      )
    ).toBe(false)
  })

  it('keeps response kinds distinct when source pathnames agree', () => {
    const pathname = createRoute('/blog/[slug]')
    const sources: ResponseCacheOwner[] = [
      pages(pathname),
      { kind: RouteKind.APP_PAGE, sourceRoute: createPage(`${pathname}/page`) },
      {
        kind: RouteKind.APP_ROUTE,
        sourceRoute: createPage(`${pathname}/route`),
      },
    ]
    const dataRoutes = [
      createRoute('/_next/data/build/blog/post.json'),
      createRoute('/blog/post.rsc'),
      null,
    ]
    for (const [index, route] of sources.entries()) {
      for (const [other, dataRoute] of dataRoutes.entries()) {
        expect(
          isRouteCacheOwner(createRoute('/blog/post'), route, {
            srcRoute: pathname,
            dataRoute,
          })
        ).toBe(index === other)
      }
    }
  })

  it('preserves App locale segments and literal Unicode and index paths', () => {
    for (const pathname of ['/fr/about', '/café', '/index']) {
      expect(
        isRouteCacheOwner(
          createRoute(pathname),
          {
            kind: RouteKind.APP_PAGE,
            sourceRoute: createPage(`${pathname}/page`),
          },
          {
            srcRoute: createRoute(pathname),
            dataRoute: createRoute(`${pathname}.rsc`),
          },
          ['en', 'fr']
        )
      ).toBe(true)
    }
    expect(
      isRouteCacheOwner(
        createRoute('/fr/about'),
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: createPage('/about/page'),
        },
        { srcRoute: null, dataRoute: createRoute('/fr/about.rsc') },
        ['en', 'fr']
      )
    ).toBe(false)
  })
})
