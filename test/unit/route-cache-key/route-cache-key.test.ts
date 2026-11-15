import { createHash } from 'crypto'
import {
  getResponseCacheOwner,
  getRouteCacheKey,
  isRouteCacheOwner,
} from 'next/dist/server/lib/route-cache-key'
import { RouteKind } from 'next/dist/server/route-kind'

const pages = (sourceRoute: string) => ({ kind: RouteKind.PAGES, sourceRoute })

describe('response cache identity', () => {
  it('rejects callers that omit the source route', () => {
    expect(() => {
      // @ts-expect-error a pathname alone cannot identify a response cache entry
      getRouteCacheKey('/blog/post')
    }).toThrow('Response cache requires a source route')
  })

  it('separates source routes that accept the same normalized pathname', () => {
    expect(getRouteCacheKey('/blog/post', pages('/blog/[slug]'))).not.toBe(
      getRouteCacheKey('/blog/post', pages('/[...slug]'))
    )
  })

  it.each(['/', '/nested', '/blog/[slug]', '/index'])(
    'uses the Pages pathname regardless of the bundler module name: %s',
    (pathname) => {
      const webpack = getResponseCacheOwner({
        kind: RouteKind.PAGES,
        page: pathname,
        pathname,
      })
      const turbopack = getResponseCacheOwner({
        kind: RouteKind.PAGES,
        page: pathname === '/' ? '/index' : `${pathname}/index`,
        pathname,
      })
      expect(webpack).toEqual(pages(pathname))
      expect(turbopack).toEqual(webpack)
      expect(getRouteCacheKey('/post', turbopack)).toBe(
        getRouteCacheKey('/post', webpack)
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
        expect(getRouteCacheKey('/blog/post', pages(page))).toBe(
          `/route-cache/PAGES/${hash}/$/blog/post`
        )
      }
    )

    it.each([
      `/${'é'.repeat(50)}/page`,
      `/${Array.from({ length: 80 }, (_, i) => `(group${i})`).join('/')}/page`,
    ])('bounds source directory length and depth: %s', (page) => {
      expect(
        getRouteCacheKey('/short', {
          kind: RouteKind.APP_PAGE,
          sourceRoute: page,
        })
      ).toMatch(/^\/route-cache\/APP_PAGE\/[a-f0-9]{64}\/\$\/short$/)
    })
  })

  it('separates response kinds and internal app module identities', () => {
    const keys = [
      { kind: RouteKind.PAGES, page: '/blog/[slug]' },
      { kind: RouteKind.APP_PAGE, page: '/blog/[slug]' },
      { kind: RouteKind.APP_ROUTE, page: '/blog/[slug]' },
      { kind: RouteKind.APP_PAGE, page: '/(group)/blog/[slug]/page' },
      { kind: RouteKind.APP_PAGE, page: '/@slot/blog/[slug]/page' },
    ].map((definition) => {
      const owner = getResponseCacheOwner({
        ...definition,
        pathname: '/blog/[slug]',
      })
      expect(owner.sourceRoute).toBe(definition.page)
      return getRouteCacheKey('/blog/post', owner)
    })
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('cannot confuse a source-route delimiter with the pathname', () => {
    expect(getRouteCacheKey('/b/$/c', pages('/a'))).not.toBe(
      getRouteCacheKey('/c', pages('/a/$/b'))
    )
    expect(getRouteCacheKey('/post', pages('/%24'))).not.toBe(
      getRouteCacheKey('/post', pages('/$'))
    )
  })

  it('normalizes the pathname exactly once', () => {
    const route = pages('/[[...slug]]')
    const keys = ['/', '/index', '/index/index'].map((pathname) =>
      getRouteCacheKey(pathname, route)
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
      (pathname) => getRouteCacheKey(pathname, route)
    )
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(['/a/../b', '/a/./b', '/a//b'])(
    'rejects pathname traversal or normalization across the namespace: %s',
    (pathname) => {
      expect(() => getRouteCacheKey(pathname, pages('/[...slug]'))).toThrow()
    }
  )
})

describe('prerender ownership without a cache-key manifest', () => {
  it('recognizes a Pages index module without admitting a sibling', () => {
    const prerender = {
      srcRoute: '/[first]',
      dataRoute: '/_next/data/build/en/first.json',
    }
    expect(
      isRouteCacheOwner(
        '/en/first',
        getResponseCacheOwner({
          kind: RouteKind.PAGES,
          page: '/[first]/index',
          pathname: '/[first]',
        }),
        prerender,
        ['en', 'es']
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        '/en/first',
        getResponseCacheOwner({
          kind: RouteKind.PAGES,
          page: '/[...slug]/index',
          pathname: '/[...slug]',
        }),
        prerender,
        ['en', 'es']
      )
    ).toBe(false)
  })

  it('requires the source route of a concrete prerender', () => {
    const prerender = {
      srcRoute: '/blog/[slug]',
      dataRoute: '/_next/data/build/blog/post.json',
    }
    expect(
      isRouteCacheOwner('/blog/post', pages('/blog/[slug]'), prerender)
    ).toBe(true)
    expect(
      isRouteCacheOwner('/blog/post', pages('/[...slug]'), prerender)
    ).toBe(false)
    expect(
      isRouteCacheOwner('/blog/post', pages('/blog/[slug]'), undefined)
    ).toBe(false)
  })

  it('recognizes static Pages owners with and without locales', () => {
    const prerender = {
      srcRoute: null,
      dataRoute: '/_next/data/build/about.json',
    }
    expect(isRouteCacheOwner('/about', pages('/about'), prerender)).toBe(true)
    expect(
      isRouteCacheOwner('/fr/about', pages('/about'), prerender, ['en', 'fr'])
    ).toBe(true)
    expect(isRouteCacheOwner('/fr', pages('/'), prerender, ['en', 'fr'])).toBe(
      true
    )
    expect(
      isRouteCacheOwner('/other/about', pages('/about'), prerender, [
        'en',
        'fr',
      ])
    ).toBe(false)
  })

  it('recognizes locale-prefixed Pages fallback shells', () => {
    const prerender = {
      dataRoute: '/_next/data/build/blog/[slug].json',
      fallbackSourceRoute: undefined,
    }
    expect(
      isRouteCacheOwner('/fr/blog/[slug]', pages('/blog/[slug]'), prerender, [
        'en',
        'fr',
      ])
    ).toBe(true)
    expect(
      isRouteCacheOwner('/fr/blog/[slug]', pages('/[...slug]'), prerender, [
        'en',
        'fr',
      ])
    ).toBe(false)
  })

  it('uses the original source for partially specialized PPR shells', () => {
    const prerender = {
      fallbackSourceRoute: '/catalog/[category]/[item]',
      dataRoute: '/catalog/a/[item].rsc',
    }
    expect(
      isRouteCacheOwner(
        '/catalog/a/[item]',
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: '/(shop)/catalog/[category]/[item]/page',
        },
        prerender
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        '/catalog/a/[item]',
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: '/catalog/a/[item]/page',
        },
        prerender
      )
    ).toBe(false)
  })

  it('uses App route normalization for groups, slots, and escaped underscores', () => {
    expect(
      isRouteCacheOwner(
        '/_blog/post',
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: '/(group)/@slot/%5Fblog/[slug]/page',
        },
        { srcRoute: '/_blog/[slug]', dataRoute: '/_blog/post.rsc' }
      )
    ).toBe(true)
    expect(
      isRouteCacheOwner(
        '/photos/post',
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: '/@modal/(.)photos/[slug]/page',
        },
        { srcRoute: '/photos/[slug]', dataRoute: '/photos/post.rsc' }
      )
    ).toBe(false)
  })

  it('keeps response kinds distinct when source pathnames agree', () => {
    const pathname = '/blog/[slug]'
    const sources = [
      pages(pathname),
      { kind: RouteKind.APP_PAGE, sourceRoute: `${pathname}/page` },
      { kind: RouteKind.APP_ROUTE, sourceRoute: `${pathname}/route` },
    ]
    const dataRoutes = [
      '/_next/data/build/blog/post.json',
      '/blog/post.rsc',
      null,
    ]
    for (const [index, route] of sources.entries()) {
      for (const [other, dataRoute] of dataRoutes.entries()) {
        expect(
          isRouteCacheOwner('/blog/post', route, {
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
          pathname,
          {
            kind: RouteKind.APP_PAGE,
            sourceRoute: `${pathname}/page`,
          },
          { srcRoute: pathname, dataRoute: `${pathname}.rsc` },
          ['en', 'fr']
        )
      ).toBe(true)
    }
    expect(
      isRouteCacheOwner(
        '/fr/about',
        {
          kind: RouteKind.APP_PAGE,
          sourceRoute: '/about/page',
        },
        { srcRoute: null, dataRoute: '/fr/about.rsc' },
        ['en', 'fr']
      )
    ).toBe(false)
  })
})
