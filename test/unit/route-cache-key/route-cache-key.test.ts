import { createHash } from 'crypto'
import {
  getResponseCacheOwner,
  getRouteCacheKey,
  isRouteCacheOwner,
} from 'next/dist/server/lib/route-cache-key'
import { RouteKind } from 'next/dist/server/route-kind'
import type { Page, Route } from 'next/dist/shared/lib/route-types'
import type { ResponseCacheOwner } from 'next/dist/server/lib/route-cache-key'

const pages = (sourceRoute: string): ResponseCacheOwner => ({
  kind: RouteKind.PAGES,
  sourceRoute: sourceRoute as Route,
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
      getRouteCacheKey('/blog/post' as Route, pages('/blog/[slug]'))
    ).not.toBe(getRouteCacheKey('/blog/post' as Route, pages('/[...slug]')))
  })

  it.each(['/', '/nested', '/blog/[slug]', '/index'] as Route[])(
    'uses the Pages pathname regardless of the bundler module name: %s',
    (pathname) => {
      const webpack = getResponseCacheOwner({
        kind: RouteKind.PAGES,
        // These Pages-only fixtures deliberately use the same URL and module spelling.
        page: pathname as string as Page,
        pathname,
      })
      const turbopack = getResponseCacheOwner({
        kind: RouteKind.PAGES,
        page: (pathname === '/' ? '/index' : `${pathname}/index`) as Page,
        pathname,
      })
      expect(webpack).toEqual(pages(pathname))
      expect(turbopack).toEqual(webpack)
      expect(getRouteCacheKey('/post' as Route, turbopack)).toBe(
        getRouteCacheKey('/post' as Route, webpack)
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
        expect(getRouteCacheKey('/blog/post' as Route, pages(page))).toBe(
          `/route-cache/PAGES/${hash}/$/blog/post`
        )
      }
    )

    it.each([
      `/${'é'.repeat(50)}/page`,
      `/${Array.from({ length: 80 }, (_, i) => `(group${i})`).join('/')}/page`,
    ])('bounds source directory length and depth: %s', (page) => {
      expect(
        getRouteCacheKey('/short' as Route, {
          kind: RouteKind.APP_PAGE,
          sourceRoute: page as Page,
        })
      ).toMatch(/^\/route-cache\/APP_PAGE\/[a-f0-9]{64}\/\$\/short$/)
    })
  })

  it('separates response kinds and internal app module identities', () => {
    const keys = [
      { kind: RouteKind.PAGES, page: '/blog/[slug]' as Page },
      { kind: RouteKind.APP_PAGE, page: '/blog/[slug]' as Page },
      { kind: RouteKind.APP_ROUTE, page: '/blog/[slug]' as Page },
      { kind: RouteKind.APP_PAGE, page: '/(group)/blog/[slug]/page' as Page },
      { kind: RouteKind.APP_PAGE, page: '/@slot/blog/[slug]/page' as Page },
    ].map((definition) => {
      const owner = getResponseCacheOwner({
        ...definition,
        pathname: '/blog/[slug]' as Route,
      })
      expect(owner.sourceRoute).toBe(definition.page)
      return getRouteCacheKey('/blog/post' as Route, owner)
    })
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('cannot confuse a source-route delimiter with the pathname', () => {
    expect(getRouteCacheKey('/b/$/c' as Route, pages('/a'))).not.toBe(
      getRouteCacheKey('/c' as Route, pages('/a/$/b'))
    )
    expect(getRouteCacheKey('/post' as Route, pages('/%24'))).not.toBe(
      getRouteCacheKey('/post' as Route, pages('/$'))
    )
  })

  it('normalizes the pathname exactly once', () => {
    const route = pages('/[[...slug]]')
    const keys = ['/', '/index', '/index/index'].map((pathname) =>
      getRouteCacheKey(pathname as Route, route)
    )
    expect(new Set(keys).size).toBe(3)
    expect(keys.map((key) => key.split('/$/')[1])).toEqual([
      'index',
      'index/index',
      'index/index/index',
    ])
  })

  it('retains locale and escaped pathname distinctions', () => {
    const route = pages('/[...slug]')
    const keys = ['/en/post', '/fr/post', '/a/b', '/a%2Fb', '/a%252Fb'].map(
      (pathname) => getRouteCacheKey(pathname as Route, route)
    )
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(['/a/../b', '/a/./b', '/a//b'])(
    'rejects pathname traversal or normalization across the namespace: %s',
    (pathname) => {
      expect(() =>
        getRouteCacheKey(pathname as Route, pages('/[...slug]'))
      ).toThrow()
    }
  )
})

describe('prerender ownership without a cache-key manifest', () => {
  it('recognizes a Pages index module without admitting a sibling', () => {
    const prerender = {
      srcRoute: '/[first]' as Route,
      dataRoute: '/_next/data/build/en/first.json' as Route,
    }
    expect(
      isRouteCacheOwner(
        '/en/first' as Route,
        getResponseCacheOwner({
          kind: RouteKind.PAGES,
          page: '/[first]/index' as Page,
          pathname: '/[first]' as Route,
        }),
        prerender,
        ['en', 'es']
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        '/en/first' as Route,
        getResponseCacheOwner({
          kind: RouteKind.PAGES,
          page: '/[...slug]/index' as Page,
          pathname: '/[...slug]' as Route,
        }),
        prerender,
        ['en', 'es']
      )
    ).toBe(false)
  })

  it('requires the source route of a concrete prerender', () => {
    const prerender = {
      srcRoute: '/blog/[slug]' as Route,
      dataRoute: '/_next/data/build/blog/post.json' as Route,
    }
    expect(
      isRouteCacheOwner('/blog/post' as Route, pages('/blog/[slug]'), prerender)
    ).toBe(true)
    expect(
      isRouteCacheOwner('/blog/post' as Route, pages('/[...slug]'), prerender)
    ).toBe(false)
    expect(
      isRouteCacheOwner('/blog/post' as Route, pages('/blog/[slug]'), undefined)
    ).toBe(false)
  })

  it('recognizes static Pages owners with and without locales', () => {
    const prerender = {
      srcRoute: null,
      dataRoute: '/_next/data/build/about.json' as Route,
    }
    expect(
      isRouteCacheOwner('/about' as Route, pages('/about'), prerender)
    ).toBe(true)
    expect(
      isRouteCacheOwner('/fr/about' as Route, pages('/about'), prerender, [
        'en',
        'fr',
      ])
    ).toBe(true)
    expect(
      isRouteCacheOwner('/fr' as Route, pages('/'), prerender, ['en', 'fr'])
    ).toBe(true)
    expect(
      isRouteCacheOwner('/other/about' as Route, pages('/about'), prerender, [
        'en',
        'fr',
      ])
    ).toBe(false)
  })

  it('recognizes locale-prefixed Pages fallback shells', () => {
    const prerender = {
      dataRoute: '/_next/data/build/blog/[slug].json' as Route,
      fallbackSourceRoute: undefined,
    }
    expect(
      isRouteCacheOwner(
        '/fr/blog/[slug]' as Route,
        pages('/blog/[slug]'),
        prerender,
        ['en', 'fr']
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        '/fr/blog/[slug]' as Route,
        pages('/[...slug]'),
        prerender,
        ['en', 'fr']
      )
    ).toBe(false)
  })

  it('uses the original source for partially specialized PPR shells', () => {
    const prerender = {
      fallbackSourceRoute: '/catalog/[category]/[item]' as Route,
      dataRoute: '/catalog/a/[item].rsc' as Route,
    }
    expect(
      isRouteCacheOwner(
        '/catalog/a/[item]' as Route,
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: '/(shop)/catalog/[category]/[item]/page' as Page,
        },
        prerender
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        '/catalog/a/[item]' as Route,
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: '/catalog/a/[item]/page' as Page,
        },
        prerender
      )
    ).toBe(false)
  })

  it('uses App route normalization for groups, slots, and escaped underscores', () => {
    expect(
      isRouteCacheOwner(
        '/_blog/post' as Route,
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: '/(group)/@slot/%5Fblog/[slug]/page' as Page,
        },
        {
          srcRoute: '/_blog/[slug]' as Route,
          dataRoute: '/_blog/post.rsc' as Route,
        }
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        '/photos/post' as Route,
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: '/@modal/(.)photos/[slug]/page' as Page,
        },
        {
          srcRoute: '/photos/[slug]' as Route,
          dataRoute: '/photos/post.rsc' as Route,
        }
      )
    ).toBe(false)
  })

  it('keeps response kinds distinct when source pathnames agree', () => {
    const pathname = '/blog/[slug]' as Route
    const sources: ResponseCacheOwner[] = [
      pages(pathname),
      { kind: RouteKind.APP_PAGE, sourceRoute: `${pathname}/page` as Page },
      { kind: RouteKind.APP_ROUTE, sourceRoute: `${pathname}/route` as Page },
    ]
    const dataRoutes = [
      '/_next/data/build/blog/post.json',
      '/blog/post.rsc',
      null,
    ] as Array<Route | null>
    for (const [index, route] of sources.entries()) {
      for (const [other, dataRoute] of dataRoutes.entries()) {
        expect(
          isRouteCacheOwner('/blog/post' as Route, route, {
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
          pathname as Route,
          {
            kind: RouteKind.APP_PAGE,
            sourceRoute: `${pathname}/page` as Page,
          },
          {
            srcRoute: pathname as Route,
            dataRoute: `${pathname}.rsc` as Route,
          },
          ['en', 'fr']
        )
      ).toBe(true)
    }
    expect(
      isRouteCacheOwner(
        '/fr/about' as Route,
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: '/about/page' as Page,
        },
        { srcRoute: null, dataRoute: '/fr/about.rsc' as Route },
        ['en', 'fr']
      )
    ).toBe(false)
  })
})
