import { FallbackMode } from '../../lib/fallback'
import {
  assignErrorIfEmpty,
  generateParamPrefixCombinations,
  filterUniqueParams,
} from './app'
import type { PrerenderedRoute } from './types'

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
        fallbackRouteParams: ['id'],
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

    assignErrorIfEmpty(prerenderedRoutes, ['id'])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(true)
  })

  it('should handle more complex routes', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/[id]/[name]',
        encodedPathname: '/[id]/[name]',
        fallbackRouteParams: ['id', 'name'],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1' },
        pathname: '/1/[name]',
        encodedPathname: '/1/[name]',
        fallbackRouteParams: ['name'],
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
        fallbackRouteParams: ['name'],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, ['id', 'name'])

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
        fallbackRouteParams: ['name'],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1' },
        pathname: '/1/[name]/[extra]',
        encodedPathname: '/1/[name]/[extra]',
        fallbackRouteParams: ['name', 'extra'],
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

    assignErrorIfEmpty(prerenderedRoutes, ['id', 'name', 'extra'])

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
        fallbackRouteParams: ['slug'],
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

    assignErrorIfEmpty(prerenderedRoutes, ['slug'])

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
        fallbackRouteParams: ['id', 'slug'],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1234' },
        pathname: '/1234/[...slug]',
        encodedPathname: '/1234/[...slug]',
        fallbackRouteParams: ['slug'],
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

    assignErrorIfEmpty(prerenderedRoutes, ['id', 'slug'])

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
        fallbackRouteParams: ['category', 'subcategory', 'item'],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { category: 'electronics' },
        pathname: '/electronics/[subcategory]/[item]',
        encodedPathname: '/electronics/[subcategory]/[item]',
        fallbackRouteParams: ['subcategory', 'item'],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { category: 'electronics', subcategory: 'phones' },
        pathname: '/electronics/phones/[item]',
        encodedPathname: '/electronics/phones/[item]',
        fallbackRouteParams: ['item'],
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

    assignErrorIfEmpty(prerenderedRoutes, ['category', 'subcategory', 'item'])

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
        fallbackRouteParams: ['segments'],
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

    assignErrorIfEmpty(prerenderedRoutes, ['locale', 'segments'])

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

    const unique = filterUniqueParams(['id', 'name'], params)

    expect(unique).toEqual([{ id: '1', name: 'test' }, { id: '2' }])
  })

  it('should handle more complex routes', () => {
    const params = [
      { id: '1', name: 'test', age: '10' },
      { id: '1', name: 'test', age: '20' },
      { id: '2', name: 'test', age: '10' },
    ]

    const unique = filterUniqueParams(['id', 'name', 'age'], params)

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

    const unique = generateParamPrefixCombinations(['id'], params)

    expect(unique).toEqual([{ id: '1' }, { id: '2' }])
  })

  it('should handle multiple route parameters', () => {
    const params = [
      { lang: 'en', region: 'US', page: 'home' },
      { lang: 'en', region: 'US', page: 'about' },
      { lang: 'fr', region: 'CA', page: 'home' },
      { lang: 'fr', region: 'CA', page: 'about' },
    ]

    const unique = generateParamPrefixCombinations(['lang', 'region'], params)

    expect(unique).toEqual([
      { lang: 'en' },
      { lang: 'en', region: 'US' },
      { lang: 'fr' },
      { lang: 'fr', region: 'CA' },
    ])
  })

  it('should handle parameter value collisions', () => {
    const params = [{ slug: ['foo', 'bar'] }, { slug: 'foo,bar' }]

    const unique = generateParamPrefixCombinations(['slug'], params)

    expect(unique).toEqual([{ slug: ['foo', 'bar'] }, { slug: 'foo,bar' }])
  })

  it('should handle empty inputs', () => {
    // Empty routeParamKeys
    expect(generateParamPrefixCombinations([], [{ id: '1' }])).toEqual([])

    // Empty routeParams
    expect(generateParamPrefixCombinations(['id'], [])).toEqual([])

    // Both empty
    expect(generateParamPrefixCombinations([], [])).toEqual([])
  })

  it('should handle undefined parameters', () => {
    const params = [
      { id: '1', name: 'test' },
      { id: '2', name: undefined },
      { id: '3' }, // missing name key
    ]

    const unique = generateParamPrefixCombinations(['id', 'name'], params)

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

    const unique = generateParamPrefixCombinations(
      ['lang', 'region', 'category'],
      params
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

    const unique = generateParamPrefixCombinations(['slug'], params)

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

    const unique = generateParamPrefixCombinations(['slug'], params)

    expect(unique).toEqual([{ slug: 'foo|bar' }, { slug: ['foo', 'bar|baz'] }])
  })

  it('should handle deep parameter hierarchies', () => {
    const params = [
      { a: '1', b: '2', c: '3', d: '4', e: '5' },
      { a: '1', b: '2', c: '3', d: '4', e: '6' },
      { a: '1', b: '2', c: '3', d: '7' },
    ]

    const unique = generateParamPrefixCombinations(
      ['a', 'b', 'c', 'd', 'e'],
      params
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
})
