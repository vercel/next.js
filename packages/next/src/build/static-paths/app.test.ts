import { FallbackMode } from '../../lib/fallback'
import type { Params } from '../../server/request/params'
import {
  assignErrorIfEmpty,
  generateAllParamCombinations,
  calculateFallbackMode,
  filterUniqueParams,
  generateRouteStaticParams,
  resolveParallelRouteParams,
} from './app'
import type { PrerenderedRoute, FallbackRouteParam } from './types'
import type { WorkStore } from '../../server/app-render/work-async-storage.external'
import type { AppSegment } from '../segment-config/app/app-segments'
import type { DynamicParamTypes } from '../../shared/lib/app-router-types'

describe('assignErrorIfEmpty', () => {
  it('should assign throwOnEmptyStaticShell true for a static route with no children', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/',
        encodedPathname: '/',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(true)
  })

  it('should assign throwOnEmptyStaticShell based on route hierarchy', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/[id]',
        encodedPathname: '/[id]',
        fallbackRouteParams: [
          {
            paramName: 'id',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1' },
        pathname: '/1',
        encodedPathname: '/1',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [{ paramName: 'id' }])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(true)
  })

  it('should handle more complex routes', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/[id]/[name]',
        encodedPathname: '/[id]/[name]',
        fallbackRouteParams: [
          {
            paramName: 'id',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
          {
            paramName: 'name',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1' },
        pathname: '/1/[name]',
        encodedPathname: '/1/[name]',
        fallbackRouteParams: [
          {
            paramName: 'name',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1', name: 'test' },
        pathname: '/1/test',
        encodedPathname: '/1/test',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '2', name: 'test' },
        pathname: '/2/test',
        encodedPathname: '/2/test',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '2' },
        pathname: '/2/[name]',
        encodedPathname: '/2/[name]',
        fallbackRouteParams: [
          {
            paramName: 'name',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [
      { paramName: 'id' },
      { paramName: 'name' },
    ])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[2].throwOnEmptyStaticShell).toBe(true)
    expect(prerenderedRoutes[3].throwOnEmptyStaticShell).toBe(true)
    expect(prerenderedRoutes[4].throwOnEmptyStaticShell).toBe(false)
  })

  it('should handle multiple routes at the same trie node', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: { id: '1' },
        pathname: '/1/[name]',
        encodedPathname: '/1/[name]',
        fallbackRouteParams: [
          {
            paramName: 'name',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1' },
        pathname: '/1/[name]/[extra]',
        encodedPathname: '/1/[name]/[extra]',
        fallbackRouteParams: [
          {
            paramName: 'name',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
          {
            paramName: 'extra',
            paramType: 'catchall',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1', name: 'test' },
        pathname: '/1/test',
        encodedPathname: '/1/test',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [
      { paramName: 'id' },
      { paramName: 'name' },
      { paramName: 'extra' },
    ])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[2].throwOnEmptyStaticShell).toBe(true)
  })

  it('should handle empty input', () => {
    const prerenderedRoutes: PrerenderedRoute[] = []
    assignErrorIfEmpty(prerenderedRoutes, [])
    expect(prerenderedRoutes).toEqual([])
  })

  it('should handle blog/[slug] not throwing when concrete routes exist (from docs example)', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/blog/[slug]',
        encodedPathname: '/blog/[slug]',
        fallbackRouteParams: [
          {
            paramName: 'slug',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { slug: 'first-post' },
        pathname: '/blog/first-post',
        encodedPathname: '/blog/first-post',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { slug: 'second-post' },
        pathname: '/blog/second-post',
        encodedPathname: '/blog/second-post',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [{ paramName: 'slug' }])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false) // Should not throw - has concrete children
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(true) // Should throw - concrete route
    expect(prerenderedRoutes[2].throwOnEmptyStaticShell).toBe(true) // Should throw - concrete route
  })

  it('should handle catch-all routes with different fallback parameter counts (from docs example)', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/[id]/[...slug]',
        encodedPathname: '/[id]/[...slug]',
        fallbackRouteParams: [
          {
            paramName: 'id',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
          {
            paramName: 'slug',
            paramType: 'catchall',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1234' },
        pathname: '/1234/[...slug]',
        encodedPathname: '/1234/[...slug]',
        fallbackRouteParams: [
          {
            paramName: 'slug',
            paramType: 'catchall',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1234', slug: ['about', 'us'] },
        pathname: '/1234/about/us',
        encodedPathname: '/1234/about/us',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [
      { paramName: 'id' },
      { paramName: 'slug' },
    ])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false) // Should not throw - has children
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(false) // Should not throw - has children
    expect(prerenderedRoutes[2].throwOnEmptyStaticShell).toBe(true) // Should throw - concrete route
  })

  it('should handle nested routes with multiple parameter depths', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/[category]/[subcategory]/[item]',
        encodedPathname: '/[category]/[subcategory]/[item]',
        fallbackRouteParams: [
          {
            paramName: 'category',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
          {
            paramName: 'subcategory',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
          {
            paramName: 'item',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { category: 'electronics' },
        pathname: '/electronics/[subcategory]/[item]',
        encodedPathname: '/electronics/[subcategory]/[item]',
        fallbackRouteParams: [
          {
            paramName: 'subcategory',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
          {
            paramName: 'item',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { category: 'electronics', subcategory: 'phones' },
        pathname: '/electronics/phones/[item]',
        encodedPathname: '/electronics/phones/[item]',
        fallbackRouteParams: [
          {
            paramName: 'item',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: {
          category: 'electronics',
          subcategory: 'phones',
          item: 'iphone',
        },
        pathname: '/electronics/phones/iphone',
        encodedPathname: '/electronics/phones/iphone',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [
      { paramName: 'category' },
      { paramName: 'subcategory' },
      { paramName: 'item' },
    ])

    // All except the last one should not throw on empty static shell
    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[2].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[3].throwOnEmptyStaticShell).toBe(true)
  })

  it('should handle routes at same trie node with different fallback parameter lengths', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: { locale: 'en' },
        pathname: '/en/[...segments]',
        encodedPathname: '/en/[...segments]',
        fallbackRouteParams: [
          {
            paramName: 'segments',
            paramType: 'catchall',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { locale: 'en' },
        pathname: '/en',
        encodedPathname: '/en',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [
      { paramName: 'locale' },
      { paramName: 'segments' },
    ])

    // The route with more fallback params should not throw on empty static shell
    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(true)
  })
})

describe('filterUniqueParams', () => {
  it('should filter out duplicate parameters', () => {
    const params = [
      { id: '1', name: 'test' },
      { id: '1', name: 'test' },
      { id: '2' },
    ]

    const unique = filterUniqueParams(
      [{ paramName: 'id' }, { paramName: 'name' }],
      params
    )

    expect(unique).toEqual([{ id: '1', name: 'test' }, { id: '2' }])
  })

  it('should handle more complex routes', () => {
    const params = [
      { id: '1', name: 'test', age: '10' },
      { id: '1', name: 'test', age: '20' },
      { id: '2', name: 'test', age: '10' },
    ]

    const unique = filterUniqueParams(
      [{ paramName: 'id' }, { paramName: 'name' }, { paramName: 'age' }],
      params
    )

    expect(unique).toEqual([
      { id: '1', name: 'test', age: '10' },
      { id: '1', name: 'test', age: '20' },
      { id: '2', name: 'test', age: '10' },
    ])
  })
})

describe('generateParamPrefixCombinations', () => {
  it('should return only the route parameters', () => {
    const params = [
      { id: '1', name: 'test' },
      { id: '1', name: 'test' },
      { id: '2', name: 'test' },
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'id' }],
      params,
      []
    )

    expect(unique).toEqual([{ id: '1' }, { id: '2' }])
  })

  it('should handle multiple route parameters', () => {
    const params = [
      { lang: 'en', region: 'US', page: 'home' },
      { lang: 'en', region: 'US', page: 'about' },
      { lang: 'fr', region: 'CA', page: 'home' },
      { lang: 'fr', region: 'CA', page: 'about' },
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'lang' }, { paramName: 'region' }],
      params,
      []
    )

    expect(unique).toEqual([
      { lang: 'en' },
      { lang: 'en', region: 'US' },
      { lang: 'fr' },
      { lang: 'fr', region: 'CA' },
    ])
  })

  it('should handle parameter value collisions', () => {
    const params = [{ slug: ['foo', 'bar'] }, { slug: 'foo,bar' }]

    const unique = generateAllParamCombinations(
      [{ paramName: 'slug' }],
      params,
      []
    )

    expect(unique).toEqual([{ slug: ['foo', 'bar'] }, { slug: 'foo,bar' }])
  })

  it('should handle empty inputs', () => {
    // Empty routeParamKeys
    expect(generateAllParamCombinations([], [{ id: '1' }], [])).toEqual([])

    // Empty routeParams
    expect(generateAllParamCombinations([{ paramName: 'id' }], [], [])).toEqual(
      []
    )

    // Both empty
    expect(generateAllParamCombinations([], [], [])).toEqual([])
  })

  it('should handle undefined parameters', () => {
    const params = [
      { id: '1', name: 'test' },
      { id: '2', name: undefined },
      { id: '3' }, // missing name key
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'id' }, { paramName: 'name' }],
      params,
      []
    )

    expect(unique).toEqual([
      { id: '1' },
      { id: '1', name: 'test' },
      { id: '2' },
      { id: '3' },
    ])
  })

  it('should handle missing parameter keys in objects', () => {
    const params = [
      { lang: 'en', region: 'US', category: 'tech' },
      { lang: 'en', region: 'US' }, // missing category
      { lang: 'fr' }, // missing region and category
    ]

    const unique = generateAllParamCombinations(
      [
        { paramName: 'lang' },
        { paramName: 'region' },
        { paramName: 'category' },
      ],
      params,
      []
    )

    expect(unique).toEqual([
      { lang: 'en' },
      { lang: 'en', region: 'US' },
      { lang: 'en', region: 'US', category: 'tech' },
      { lang: 'fr' },
    ])
  })

  it('should prevent collisions with special characters', () => {
    const params = [
      { slug: ['foo', 'bar'] }, // Array: A:foo,bar
      { slug: 'foo,bar' }, // String: S:foo,bar
      { slug: 'A:foo,bar' }, // String that looks like array prefix
      { slug: ['A:foo', 'bar'] }, // Array with A: prefix in element
      { slug: undefined }, // Undefined: U:undefined
      { slug: 'U:undefined' }, // String that looks like undefined prefix
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'slug' }],
      params,
      []
    )

    expect(unique).toEqual([
      { slug: ['foo', 'bar'] },
      { slug: 'foo,bar' },
      { slug: 'A:foo,bar' },
      { slug: ['A:foo', 'bar'] },
      { slug: undefined },
      { slug: 'U:undefined' },
    ])
  })

  it('should handle parameters with pipe characters', () => {
    const params = [
      { slug: 'foo|bar' }, // String with pipe
      { slug: ['foo', 'bar|baz'] }, // Array with pipe in element
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'slug' }],
      params,
      []
    )

    expect(unique).toEqual([{ slug: 'foo|bar' }, { slug: ['foo', 'bar|baz'] }])
  })

  it('should handle deep parameter hierarchies', () => {
    const params = [
      { a: '1', b: '2', c: '3', d: '4', e: '5' },
      { a: '1', b: '2', c: '3', d: '4', e: '6' },
      { a: '1', b: '2', c: '3', d: '7' },
    ]

    const unique = generateAllParamCombinations(
      [
        { paramName: 'a' },
        { paramName: 'b' },
        { paramName: 'c' },
        { paramName: 'd' },
        { paramName: 'e' },
      ],
      params,
      []
    )

    // Should contain all the unique prefix combinations
    expect(unique).toEqual([
      { a: '1' },
      { a: '1', b: '2' },
      { a: '1', b: '2', c: '3' },
      { a: '1', b: '2', c: '3', d: '4' },
      { a: '1', b: '2', c: '3', d: '4', e: '5' },
      { a: '1', b: '2', c: '3', d: '4', e: '6' },
      { a: '1', b: '2', c: '3', d: '7' },
    ])
  })

  it('should only generate combinations with complete root params', () => {
    const params = [
      { lang: 'en', region: 'US', slug: 'home' },
      { lang: 'en', region: 'US', slug: 'about' },
      { lang: 'fr', region: 'CA', slug: 'about' },
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'lang' }, { paramName: 'region' }, { paramName: 'slug' }],
      params,
      ['lang', 'region'] // Root params
    )

    // Should NOT include partial combinations like { lang: 'en' }
    // Should only include combinations with complete root params
    expect(unique).toEqual([
      { lang: 'en', region: 'US' }, // Complete root params
      { lang: 'en', region: 'US', slug: 'home' },
      { lang: 'en', region: 'US', slug: 'about' },
      { lang: 'fr', region: 'CA' }, // Complete root params
      { lang: 'fr', region: 'CA', slug: 'about' },
    ])
  })

  it('should handle routes without root params normally', () => {
    const params = [
      { category: 'tech', slug: 'news' },
      { category: 'tech', slug: 'reviews' },
      { category: 'sports', slug: 'news' },
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'category' }, { paramName: 'slug' }],
      params,
      [] // No root params
    )

    // Should generate all sub-combinations as before
    expect(unique).toEqual([
      { category: 'tech' },
      { category: 'tech', slug: 'news' },
      { category: 'tech', slug: 'reviews' },
      { category: 'sports' },
      { category: 'sports', slug: 'news' },
    ])
  })

  it('should handle single root param', () => {
    const params = [
      { lang: 'en', page: 'home' },
      { lang: 'en', page: 'about' },
      { lang: 'fr', page: 'home' },
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'lang' }, { paramName: 'page' }],
      params,
      ['lang'] // Single root param
    )

    // Should include combinations starting from the root param
    expect(unique).toEqual([
      { lang: 'en' },
      { lang: 'en', page: 'home' },
      { lang: 'en', page: 'about' },
      { lang: 'fr' },
      { lang: 'fr', page: 'home' },
    ])
  })

  it('should handle missing root params gracefully', () => {
    const params = [
      { lang: 'en', page: 'home' },
      { lang: 'en', page: 'about' },
      { page: 'contact' }, // Missing lang root param
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'lang' }, { paramName: 'page' }],
      params,
      ['lang'] // Root param
    )

    // Should only include combinations that have the root param
    expect(unique).toEqual([
      { lang: 'en' },
      { lang: 'en', page: 'home' },
      { lang: 'en', page: 'about' },
      // { page: 'contact' } should be excluded because it lacks the root param
    ])
  })

  it('should handle root params not in route params', () => {
    const params = [
      { category: 'tech', slug: 'news' },
      { category: 'sports', slug: 'news' },
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'category' }, { paramName: 'slug' }],
      params,
      ['lang', 'region'] // Root params not in route params
    )

    // Should fall back to normal behavior when root params are not found
    expect(unique).toEqual([
      { category: 'tech' },
      { category: 'tech', slug: 'news' },
      { category: 'sports' },
      { category: 'sports', slug: 'news' },
    ])
  })

  it('should handle test case scenario: route with extra param but missing value', () => {
    // This simulates the failing test scenario:
    // Route: /[lang]/[locale]/other/[slug]
    // generateStaticParams only provides: { lang: 'en', locale: 'us' }
    // Missing: slug parameter
    const params = [
      { lang: 'en', locale: 'us' }, // Missing slug parameter
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'lang' }, { paramName: 'locale' }, { paramName: 'slug' }], // All route params
      params,
      ['lang', 'locale'] // Root params
    )

    // Should generate only the combination with complete root params
    // but not try to include the missing slug param
    expect(unique).toEqual([
      { lang: 'en', locale: 'us' }, // Complete root params, slug omitted
    ])
  })

  it('should handle empty routeParams with root params', () => {
    // This might be what's happening for the [slug] route
    const params: Params[] = [] // No generateStaticParams results

    const unique = generateAllParamCombinations(
      [{ paramName: 'lang' }, { paramName: 'locale' }, { paramName: 'slug' }], // All route params
      params,
      ['lang', 'locale'] // Root params
    )

    // Should return empty array when there are no route params to work with
    expect(unique).toEqual([])
  })
})

type TestAppSegment = Pick<AppSegment, 'config' | 'generateStaticParams'>

// Mock WorkStore for testing
const createMockWorkStore = (fetchCache?: WorkStore['fetchCache']) => ({
  fetchCache,
})

// Helper to create mock segments
const createMockSegment = (
  generateStaticParams?: (options: { params?: Params }) => Promise<Params[]>,
  config?: TestAppSegment['config']
): TestAppSegment => ({
  config,
  generateStaticParams,
})

describe('generateRouteStaticParams', () => {
  describe('Basic functionality', () => {
    it('should return empty array for empty segments', async () => {
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams([], store, false)
      expect(result).toEqual([])
    })

    it('should return empty array for segments without generateStaticParams', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(),
        createMockSegment(),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([])
    })

    it('should process single segment with generateStaticParams', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ id: '1' }, { id: '2' }]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ id: '1' }, { id: '2' }])
    })

    it('should process multiple segments with generateStaticParams', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [
          { category: 'tech' },
          { category: 'sports' },
        ]),
        createMockSegment(async ({ params }) => [
          { slug: `${params?.category}-post-1` },
          { slug: `${params?.category}-post-2` },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([
        { category: 'tech', slug: 'tech-post-1' },
        { category: 'tech', slug: 'tech-post-2' },
        { category: 'sports', slug: 'sports-post-1' },
        { category: 'sports', slug: 'sports-post-2' },
      ])
    })
  })

  describe('Parameter inheritance', () => {
    it('should inherit parent parameters', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }, { lang: 'fr' }]),
        createMockSegment(async ({ params }) => [
          { category: `${params?.lang}-tech` },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([
        { lang: 'en', category: 'en-tech' },
        { lang: 'fr', category: 'fr-tech' },
      ])
    })

    it('should handle mixed segments (some with generateStaticParams, some without)', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }]),
        createMockSegment(), // No generateStaticParams
        createMockSegment(async ({ params }) => [
          { slug: `${params?.lang}-slug` },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ lang: 'en', slug: 'en-slug' }])
    })
  })

  describe('Empty and undefined handling', () => {
    it('should handle empty generateStaticParams results', async () => {
      const segments: TestAppSegment[] = [createMockSegment(async () => [])]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([])
    })

    it('should handle generateStaticParams returning empty array with parent params', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }]),
        createMockSegment(async () => []), // Empty result
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ lang: 'en' }])
    })

    it('should handle missing parameters in parent params', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }, {}]),
        createMockSegment(async ({ params }) => [
          { category: `${params?.lang || 'default'}-tech` },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([
        { lang: 'en', category: 'en-tech' },
        { category: 'default-tech' },
      ])
    })
  })

  describe('FetchCache configuration', () => {
    it('should set fetchCache on store when segment has fetchCache config', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ id: '1' }], {
          fetchCache: 'force-cache',
        }),
      ]
      const store = createMockWorkStore()
      await generateRouteStaticParams(segments, store, false)
      expect(store.fetchCache).toBe('force-cache')
    })

    it('should not modify fetchCache when segment has no fetchCache config', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ id: '1' }]),
      ]
      const store = createMockWorkStore('force-cache')
      await generateRouteStaticParams(segments, store, false)
      expect(store.fetchCache).toBe('force-cache')
    })

    it('should update fetchCache for multiple segments', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ category: 'tech' }], {
          fetchCache: 'force-cache',
        }),
        createMockSegment(async () => [{ slug: 'post' }], {
          fetchCache: 'default-cache',
        }),
      ]
      const store = createMockWorkStore()
      await generateRouteStaticParams(segments, store, false)
      // Should have the last fetchCache value
      expect(store.fetchCache).toBe('default-cache')
    })
  })

  describe('Array parameter values', () => {
    it('should handle array parameter values', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [
          { slug: ['a', 'b'] },
          { slug: ['c', 'd', 'e'] },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ slug: ['a', 'b'] }, { slug: ['c', 'd', 'e'] }])
    })

    it('should handle mixed array and string parameters', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }]),
        createMockSegment(async ({ params }) => [
          { slug: [`${params?.lang}`, 'post'] },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ lang: 'en', slug: ['en', 'post'] }])
    })
  })

  describe('Deep nesting scenarios', () => {
    it('should handle deeply nested segments', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ a: '1' }]),
        createMockSegment(async ({ params }) => [{ b: `${params?.a}-2` }]),
        createMockSegment(async ({ params }) => [{ c: `${params?.b}-3` }]),
        createMockSegment(async ({ params }) => [{ d: `${params?.c}-4` }]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ a: '1', b: '1-2', c: '1-2-3', d: '1-2-3-4' }])
    })

    it('should handle many parameter combinations', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ x: '1' }, { x: '2' }]),
        createMockSegment(async () => [{ y: 'a' }, { y: 'b' }]),
        createMockSegment(async () => [{ z: 'i' }, { z: 'ii' }]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([
        { x: '1', y: 'a', z: 'i' },
        { x: '1', y: 'a', z: 'ii' },
        { x: '1', y: 'b', z: 'i' },
        { x: '1', y: 'b', z: 'ii' },
        { x: '2', y: 'a', z: 'i' },
        { x: '2', y: 'a', z: 'ii' },
        { x: '2', y: 'b', z: 'i' },
        { x: '2', y: 'b', z: 'ii' },
      ])
    })
  })

  describe('Error handling', () => {
    it('should handle generateStaticParams throwing an error', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => {
          throw new Error('Test error')
        }),
      ]
      const store = createMockWorkStore()
      await expect(
        generateRouteStaticParams(segments, store, false)
      ).rejects.toThrow('Test error')
    })

    it('should handle generateStaticParams returning a rejected promise', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => {
          return Promise.reject(new Error('Async error'))
        }),
      ]
      const store = createMockWorkStore()
      await expect(
        generateRouteStaticParams(segments, store, false)
      ).rejects.toThrow('Async error')
    })

    it('should handle partially failing generateStaticParams', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ category: 'tech' }]),
        createMockSegment(async ({ params }) => {
          if (params?.category === 'tech') {
            throw new Error('Tech not allowed')
          }
          return [{ slug: 'post' }]
        }),
      ]
      const store = createMockWorkStore()
      await expect(
        generateRouteStaticParams(segments, store, false)
      ).rejects.toThrow('Tech not allowed')
    })

    it('should throw error when generateStaticParams returns empty array with isRoutePPREnabled=true', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }]),
        createMockSegment(async () => []), // Empty result
      ]
      const store = createMockWorkStore()
      await expect(
        generateRouteStaticParams(segments, store, true)
      ).rejects.toThrow(
        'When using Cache Components, all `generateStaticParams` functions must return at least one result'
      )
    })

    it('should throw error when first segment returns empty array with isRoutePPREnabled=true', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => []), // Empty result at root level
      ]
      const store = createMockWorkStore()
      await expect(
        generateRouteStaticParams(segments, store, true)
      ).rejects.toThrow(
        'When using Cache Components, all `generateStaticParams` functions must return at least one result'
      )
    })

    it('should NOT throw error when generateStaticParams returns empty array with isRoutePPREnabled=false', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }]),
        createMockSegment(async () => []), // Empty result
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ lang: 'en' }])
    })

    it('should NOT throw error when first segment returns empty array with isRoutePPREnabled=false', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => []), // Empty result at root level
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([])
    })
  })

  describe('Complex real-world scenarios', () => {
    it('should handle i18n routing pattern', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [
          { lang: 'en' },
          { lang: 'fr' },
          { lang: 'es' },
        ]),
        createMockSegment(async ({ params: _params }) => [
          { category: 'tech' },
          { category: 'sports' },
        ]),
        createMockSegment(async ({ params }) => [
          { slug: `${params?.lang}-${params?.category}-post-1` },
          { slug: `${params?.lang}-${params?.category}-post-2` },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toHaveLength(12) // 3 langs × 2 categories × 2 slugs
      expect(result).toContainEqual({
        lang: 'en',
        category: 'tech',
        slug: 'en-tech-post-1',
      })
      expect(result).toContainEqual({
        lang: 'fr',
        category: 'sports',
        slug: 'fr-sports-post-2',
      })
    })

    it('should handle e-commerce routing pattern', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(), // Static segment
        createMockSegment(async () => [
          { category: 'electronics' },
          { category: 'clothing' },
        ]),
        createMockSegment(async ({ params }) => {
          if (params?.category === 'electronics') {
            return [{ subcategory: 'phones' }, { subcategory: 'laptops' }]
          }
          return [{ subcategory: 'shirts' }, { subcategory: 'pants' }]
        }),
        createMockSegment(async ({ params }) => [
          { product: `${params?.subcategory}-item-1` },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([
        {
          category: 'electronics',
          subcategory: 'phones',
          product: 'phones-item-1',
        },
        {
          category: 'electronics',
          subcategory: 'laptops',
          product: 'laptops-item-1',
        },
        {
          category: 'clothing',
          subcategory: 'shirts',
          product: 'shirts-item-1',
        },
        { category: 'clothing', subcategory: 'pants', product: 'pants-item-1' },
      ])
    })

    it('should handle blog with optional catch-all', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(), // Static segment
        createMockSegment(async () => [{ year: '2023' }, { year: '2024' }]),
        createMockSegment(async ({ params: _params }) => [
          { month: '01' },
          { month: '02' },
        ]),
        createMockSegment(async ({ params }) => [
          { slug: [`${params?.year}-${params?.month}-post`] },
          { slug: [] }, // Empty for optional catch-all
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toHaveLength(8) // 2 years × 2 months × 2 slug variations
      expect(result).toContainEqual({
        year: '2023',
        month: '01',
        slug: ['2023-01-post'],
      })
      expect(result).toContainEqual({ year: '2024', month: '02', slug: [] })
    })
  })

  describe('Performance considerations', () => {
    it('should handle recursive calls without stack overflow', async () => {
      const segments: TestAppSegment[] = []
      for (let i = 0; i < 5000; i++) {
        segments.push(
          createMockSegment(async () => [{ [`param${i}`]: `value${i}` }])
        )
      }
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toHaveLength(1)
      expect(Object.keys(result[0])).toHaveLength(5000)
    })
  })
})

describe('calculateFallbackMode', () => {
  it('should return NOT_FOUND when dynamic params are disabled', () => {
    const result = calculateFallbackMode(false, [], FallbackMode.PRERENDER)

    expect(result).toBe(FallbackMode.NOT_FOUND)
  })

  it('should return NOT_FOUND when dynamic params are disabled regardless of root params', () => {
    const result = calculateFallbackMode(
      false,
      ['rootParam'],
      FallbackMode.BLOCKING_STATIC_RENDER
    )

    expect(result).toBe(FallbackMode.NOT_FOUND)
  })

  it('should return BLOCKING_STATIC_RENDER when dynamic params are enabled and root params exist', () => {
    const result = calculateFallbackMode(
      true,
      ['rootParam1', 'rootParam2'],
      FallbackMode.PRERENDER
    )

    expect(result).toBe(FallbackMode.BLOCKING_STATIC_RENDER)
  })

  it('should return base fallback mode when dynamic params are enabled and no root params', () => {
    const result = calculateFallbackMode(true, [], FallbackMode.PRERENDER)

    expect(result).toBe(FallbackMode.PRERENDER)
  })

  it('should return base fallback mode when dynamic params are enabled and empty root params', () => {
    const result = calculateFallbackMode(
      true,
      [],
      FallbackMode.BLOCKING_STATIC_RENDER
    )

    expect(result).toBe(FallbackMode.BLOCKING_STATIC_RENDER)
  })

  it('should return NOT_FOUND when dynamic params are enabled but no base fallback mode provided', () => {
    const result = calculateFallbackMode(true, [], undefined)

    expect(result).toBe(FallbackMode.NOT_FOUND)
  })

  it('should prioritize root params over base fallback mode', () => {
    const result = calculateFallbackMode(
      true,
      ['rootParam'],
      FallbackMode.PRERENDER
    )

    expect(result).toBe(FallbackMode.BLOCKING_STATIC_RENDER)
  })

  it('should handle single root param correctly', () => {
    const result = calculateFallbackMode(
      true,
      ['singleParam'],
      FallbackMode.PRERENDER
    )

    expect(result).toBe(FallbackMode.BLOCKING_STATIC_RENDER)
  })
})

describe('resolveParallelRouteParams', () => {
  function createParallelRouteSegment(
    paramName: string,
    paramType: DynamicParamTypes
  ): {
    name: string
    paramName: string
    paramType: DynamicParamTypes
  } {
    return {
      name: `@${paramName}`,
      paramName,
      paramType,
    }
  }

  function createFallbackParam(
    paramName: string,
    isParallelRouteParam: boolean,
    paramType: DynamicParamTypes = 'dynamic'
  ): FallbackRouteParam {
    return { paramName, paramType, isParallelRouteParam }
  }

  describe('direct match case', () => {
    it('should skip processing when param already exists in params object', () => {
      const parallelRouteSegments = [
        createParallelRouteSegment('existingParam', 'dynamic'),
      ]
      const params: Params = { existingParam: 'value' }
      const pathname = '/some/path'
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveParallelRouteParams(
        parallelRouteSegments,
        params,
        pathname,
        fallbackRouteParams
      )

      expect(params.existingParam).toBe('value')
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should skip processing for multiple existing params', () => {
      const parallelRouteSegments = [
        createParallelRouteSegment('param1', 'dynamic'),
        createParallelRouteSegment('param2', 'catchall'),
      ]
      const params: Params = { param1: 'value1', param2: ['a', 'b'] }
      const pathname = '/some/path'
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveParallelRouteParams(
        parallelRouteSegments,
        params,
        pathname,
        fallbackRouteParams
      )

      expect(params.param1).toBe('value1')
      expect(params.param2).toEqual(['a', 'b'])
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })

  describe('catchall with non-parallel fallback params', () => {
    it('should add to fallbackRouteParams when non-parallel fallback params exist', () => {
      const parallelRouteSegments = [
        createParallelRouteSegment('catchallParam', 'catchall'),
      ]
      const params: Params = {}
      const pathname = '/some/path/segments'
      const fallbackRouteParams: FallbackRouteParam[] = [
        createFallbackParam('regularParam', false), // Non-parallel fallback param
      ]

      resolveParallelRouteParams(
        parallelRouteSegments,
        params,
        pathname,
        fallbackRouteParams
      )

      expect(params.catchallParam).toBeUndefined()
      expect(fallbackRouteParams).toHaveLength(2)
      expect(fallbackRouteParams[1]).toEqual({
        paramName: 'catchallParam',
        paramType: 'catchall',
        isParallelRouteParam: true,
      })
    })
  })

  describe('optional-catchall with non-parallel fallback params', () => {
    it('should add to fallbackRouteParams when non-parallel fallback params exist', () => {
      const parallelRouteSegments = [
        createParallelRouteSegment('optionalCatchall', 'optional-catchall'),
      ]
      const params: Params = {}
      const pathname = '/some/path'
      const fallbackRouteParams: FallbackRouteParam[] = [
        createFallbackParam('regularParam', false), // Non-parallel fallback param
      ]

      resolveParallelRouteParams(
        parallelRouteSegments,
        params,
        pathname,
        fallbackRouteParams
      )

      expect(params.optionalCatchall).toBeUndefined()
      expect(fallbackRouteParams).toHaveLength(2)
      expect(fallbackRouteParams[1]).toEqual({
        paramName: 'optionalCatchall',
        paramType: 'optional-catchall',
        isParallelRouteParam: true,
      })
    })
  })

  describe('catchall deriving from pathname', () => {
    it('should populate params with path segments when no non-parallel fallback params', () => {
      const parallelRouteSegments = [
        createParallelRouteSegment('catchallParam', 'catchall'),
      ]
      const params: Params = {}
      const pathname = '/blog/2023/posts/my-article'
      const fallbackRouteParams: FallbackRouteParam[] = [
        createFallbackParam('parallelParam', true), // Only parallel fallback params
      ]

      resolveParallelRouteParams(
        parallelRouteSegments,
        params,
        pathname,
        fallbackRouteParams
      )

      expect(params.catchallParam).toEqual([
        'blog',
        '2023',
        'posts',
        'my-article',
      ])
      expect(fallbackRouteParams).toHaveLength(1) // No new fallback params added
    })

    it('should handle single path segment', () => {
      const parallelRouteSegments = [
        createParallelRouteSegment('catchallParam', 'catchall'),
      ]
      const params: Params = {}
      const pathname = '/single'
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveParallelRouteParams(
        parallelRouteSegments,
        params,
        pathname,
        fallbackRouteParams
      )

      expect(params.catchallParam).toEqual(['single'])
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })

  describe('optional-catchall with empty pathname', () => {
    it('should set params to empty array when pathname has no segments', () => {
      const parallelRouteSegments = [
        createParallelRouteSegment('optionalCatchall', 'optional-catchall'),
      ]
      const params: Params = {}
      const pathname = '/'
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveParallelRouteParams(
        parallelRouteSegments,
        params,
        pathname,
        fallbackRouteParams
      )

      expect(params.optionalCatchall).toEqual([])
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should set params to empty array when pathname is empty string', () => {
      const parallelRouteSegments = [
        createParallelRouteSegment('optionalCatchall', 'optional-catchall'),
      ]
      const params: Params = {}
      const pathname = '/'
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveParallelRouteParams(
        parallelRouteSegments,
        params,
        pathname,
        fallbackRouteParams
      )

      expect(params.optionalCatchall).toEqual([])
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })

  describe('optional-catchall with non-empty pathname', () => {
    it('should populate params with path segments', () => {
      const parallelRouteSegments = [
        createParallelRouteSegment('optionalCatchall', 'optional-catchall'),
      ]
      const params: Params = {}
      const pathname = '/api/v1/users'
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveParallelRouteParams(
        parallelRouteSegments,
        params,
        pathname,
        fallbackRouteParams
      )

      expect(params.optionalCatchall).toEqual(['api', 'v1', 'users'])
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })

  it('should throw error for catchall with empty pathname', () => {
    const parallelRouteSegments = [
      createParallelRouteSegment('catchallParam', 'catchall'),
    ]
    const params: Params = {}
    const pathname = '/'
    const fallbackRouteParams: FallbackRouteParam[] = []

    expect(() =>
      resolveParallelRouteParams(
        parallelRouteSegments,
        params,
        pathname,
        fallbackRouteParams
      )
    ).toThrow()
  })

  describe('edge cases', () => {
    it('should throw error for catchall with empty path segments', () => {
      const parallelRouteSegments = [
        createParallelRouteSegment('catchall', 'catchall'),
        createParallelRouteSegment('optional', 'optional-catchall'),
      ]
      const params: Params = {}
      const pathname = '///'
      const fallbackRouteParams: FallbackRouteParam[] = []

      expect(() =>
        resolveParallelRouteParams(
          parallelRouteSegments,
          params,
          pathname,
          fallbackRouteParams
        )
      ).toThrow()
    })
  })
})
