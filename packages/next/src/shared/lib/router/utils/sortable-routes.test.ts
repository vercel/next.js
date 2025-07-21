import {
  sortSortableRoutes,
  sortSortableRouteObjects,
  sortPageObjects,
  sortPages,
  getSegmentSpecificity,
  compareRouteSegments,
  type SortableRoute,
} from './sortable-routes'

describe('sortSortableRoutes', () => {
  it('should sort routes by page', () => {
    const routes: SortableRoute[] = [
      {
        sourcePage: '/[lang]/[teamSlug]/[projectSlug]/monitoring',
        page: '/[lang]/[teamSlug]/[projectSlug]/monitoring',
      },
      {
        sourcePage: '/[lang]/[teamSlug]/[projectSlug]/monitoring',
        page: '/en/[teamSlug]/[projectSlug]/monitoring',
      },
      {
        sourcePage: '/[lang]/[teamSlug]/~/monitoring',
        page: '/[lang]/[teamSlug]/~/monitoring',
      },
      {
        sourcePage: '/[lang]/[teamSlug]/[projectSlug]/monitoring',
        page: '/fr/[teamSlug]/[projectSlug]/monitoring',
      },
    ]

    const sorted = sortSortableRoutes(routes)

    expect(sorted).toEqual([
      {
        sourcePage: '/[lang]/[teamSlug]/~/monitoring',
        page: '/[lang]/[teamSlug]/~/monitoring',
      },
      {
        sourcePage: '/[lang]/[teamSlug]/[projectSlug]/monitoring',
        page: '/en/[teamSlug]/[projectSlug]/monitoring',
      },
      {
        sourcePage: '/[lang]/[teamSlug]/[projectSlug]/monitoring',
        page: '/fr/[teamSlug]/[projectSlug]/monitoring',
      },
      {
        sourcePage: '/[lang]/[teamSlug]/[projectSlug]/monitoring',
        page: '/[lang]/[teamSlug]/[projectSlug]/monitoring',
      },
    ])
  })

  it('should sort routes by specificity with different parameter types', () => {
    const routes: SortableRoute[] = [
      {
        sourcePage: '/docs/[[...slug]]',
        page: '/docs/[[...slug]]',
      },
      {
        sourcePage: '/docs/[...slug]',
        page: '/docs/[...slug]',
      },
      {
        sourcePage: '/docs/[slug]',
        page: '/docs/[slug]',
      },
      {
        sourcePage: '/docs/api',
        page: '/docs/api',
      },
    ]

    const sorted = sortSortableRoutes(routes)

    expect(sorted).toEqual([
      {
        sourcePage: '/docs/api',
        page: '/docs/api',
      },
      {
        sourcePage: '/docs/[slug]',
        page: '/docs/[slug]',
      },
      {
        sourcePage: '/docs/[...slug]',
        page: '/docs/[...slug]',
      },
      {
        sourcePage: '/docs/[[...slug]]',
        page: '/docs/[[...slug]]',
      },
    ])
  })

  it('should prioritize source over page in sorting', () => {
    const routes: SortableRoute[] = [
      {
        sourcePage: '/[lang]/[...slug]',
        page: '/en/docs/api',
      },
      {
        sourcePage: '/en/docs',
        page: '/[lang]/[...slug]',
      },
    ]

    const sorted = sortSortableRoutes(routes)

    expect(sorted).toEqual([
      {
        sourcePage: '/en/docs',
        page: '/[lang]/[...slug]',
      },
      {
        sourcePage: '/[lang]/[...slug]',
        page: '/en/docs/api',
      },
    ])
  })

  it('should handle mixed route lengths correctly', () => {
    const routes: SortableRoute[] = [
      {
        sourcePage: '/api/[...path]',
        page: '/api/[...path]',
      },
      {
        sourcePage: '/api',
        page: '/api',
      },
      {
        sourcePage: '/api/users/[id]',
        page: '/api/users/[id]',
      },
      {
        sourcePage: '/api/users',
        page: '/api/users',
      },
    ]

    const sorted = sortSortableRoutes(routes)

    expect(sorted).toEqual([
      {
        sourcePage: '/api',
        page: '/api',
      },
      {
        sourcePage: '/api/users',
        page: '/api/users',
      },
      {
        sourcePage: '/api/users/[id]',
        page: '/api/users/[id]',
      },
      {
        sourcePage: '/api/[...path]',
        page: '/api/[...path]',
      },
    ])
  })

  it('should sort lexicographically when specificity is equal', () => {
    const routes: SortableRoute[] = [
      {
        sourcePage: '/[lang]/zebra',
        page: '/[lang]/zebra',
      },
      {
        sourcePage: '/[lang]/apple',
        page: '/[lang]/apple',
      },
      {
        sourcePage: '/[lang]/banana',
        page: '/[lang]/banana',
      },
    ]

    const sorted = sortSortableRoutes(routes)

    expect(sorted).toEqual([
      {
        sourcePage: '/[lang]/apple',
        page: '/[lang]/apple',
      },
      {
        sourcePage: '/[lang]/banana',
        page: '/[lang]/banana',
      },
      {
        sourcePage: '/[lang]/zebra',
        page: '/[lang]/zebra',
      },
    ])
  })

  it('should handle empty routes array', () => {
    const routes: SortableRoute[] = []
    const sorted = sortSortableRoutes(routes)
    expect(sorted).toEqual([])
  })

  it('should handle single route', () => {
    const routes: SortableRoute[] = [
      {
        sourcePage: '/api/users/[id]',
        page: '/api/users/[id]',
      },
    ]

    const sorted = sortSortableRoutes(routes)

    expect(sorted).toEqual([
      {
        sourcePage: '/api/users/[id]',
        page: '/api/users/[id]',
      },
    ])
  })

  it('should handle identical routes', () => {
    const routes: SortableRoute[] = [
      {
        sourcePage: '/api/users',
        page: '/api/users',
      },
      {
        sourcePage: '/api/users',
        page: '/api/users',
      },
    ]

    const sorted = sortSortableRoutes(routes)

    expect(sorted).toEqual([
      {
        sourcePage: '/api/users',
        page: '/api/users',
      },
      {
        sourcePage: '/api/users',
        page: '/api/users',
      },
    ])
  })

  it('should handle complex nested routes with different parameter types', () => {
    const routes: SortableRoute[] = [
      {
        sourcePage: '/[lang]/blog/[[...slug]]',
        page: '/[lang]/blog/[[...slug]]',
      },
      {
        sourcePage: '/[lang]/blog/[slug]',
        page: '/[lang]/blog/[slug]',
      },
      {
        sourcePage: '/en/blog/[slug]',
        page: '/en/blog/[slug]',
      },
      {
        sourcePage: '/en/blog',
        page: '/en/blog',
      },
      {
        sourcePage: '/[lang]/blog',
        page: '/[lang]/blog',
      },
      {
        sourcePage: '/[lang]/blog/[...slug]',
        page: '/[lang]/blog/[...slug]',
      },
    ]

    const sorted = sortSortableRoutes(routes)

    expect(sorted).toEqual([
      {
        sourcePage: '/en/blog',
        page: '/en/blog',
      },
      {
        sourcePage: '/en/blog/[slug]',
        page: '/en/blog/[slug]',
      },
      {
        sourcePage: '/[lang]/blog',
        page: '/[lang]/blog',
      },
      {
        sourcePage: '/[lang]/blog/[slug]',
        page: '/[lang]/blog/[slug]',
      },
      {
        sourcePage: '/[lang]/blog/[...slug]',
        page: '/[lang]/blog/[...slug]',
      },
      {
        sourcePage: '/[lang]/blog/[[...slug]]',
        page: '/[lang]/blog/[[...slug]]',
      },
    ])
  })
})

describe('sortSortableRouteObjects', () => {
  it('should sort objects by sourcePage and page while preserving object references', () => {
    interface TestRoute {
      id: string
      sourcePage: string
      page: string
      data: string
    }

    const objects: TestRoute[] = [
      {
        id: '1',
        sourcePage: '/[lang]/[slug]',
        page: '/[lang]/[slug]',
        data: 'dynamic',
      },
      {
        id: '2',
        sourcePage: '/api/users',
        page: '/api/users',
        data: 'static',
      },
      {
        id: '3',
        sourcePage: '/[lang]/blog',
        page: '/[lang]/blog',
        data: 'partial',
      },
      { id: '4', sourcePage: '/api', page: '/api', data: 'root' },
    ]

    const sorted = sortSortableRouteObjects(objects, (obj) => ({
      sourcePage: obj.sourcePage,
      page: obj.page,
    }))

    expect(sorted).toEqual([
      { id: '4', sourcePage: '/api', page: '/api', data: 'root' },
      {
        id: '2',
        sourcePage: '/api/users',
        page: '/api/users',
        data: 'static',
      },
      {
        id: '3',
        sourcePage: '/[lang]/blog',
        page: '/[lang]/blog',
        data: 'partial',
      },
      {
        id: '1',
        sourcePage: '/[lang]/[slug]',
        page: '/[lang]/[slug]',
        data: 'dynamic',
      },
    ])

    // Verify object references are preserved
    expect(sorted[0]).toBe(objects[3])
    expect(sorted[1]).toBe(objects[1])
    expect(sorted[2]).toBe(objects[2])
    expect(sorted[3]).toBe(objects[0])
  })

  it('should handle objects with different source and page paths', () => {
    interface PrerenderedRoute {
      page: string
      metadata: { type: string }
    }

    const routes: PrerenderedRoute[] = [
      { page: '/blog/post-1', metadata: { type: 'static' } },
      { page: '/blog/[slug]', metadata: { type: 'dynamic' } },
      { page: '/api/[...path]', metadata: { type: 'catchall' } },
      { page: '/api/users', metadata: { type: 'api' } },
    ]

    const sorted = sortSortableRouteObjects(routes, (route) => ({
      sourcePage: route.page,
      page: route.page,
    }))

    expect(sorted.map((r) => r.page)).toEqual([
      '/api/users',
      '/api/[...path]',
      '/blog/post-1',
      '/blog/[slug]',
    ])

    // Verify metadata is preserved
    expect(sorted[0].metadata.type).toBe('api')
    expect(sorted[1].metadata.type).toBe('catchall')
    expect(sorted[2].metadata.type).toBe('static')
    expect(sorted[3].metadata.type).toBe('dynamic')
  })

  it('should sort by sourcePage first, then page as tiebreaker', () => {
    interface RouteWithDifferentPages {
      name: string
      source: string
      rendered: string
    }

    const objects: RouteWithDifferentPages[] = [
      { name: 'route-1', source: '/[lang]/docs', rendered: '/fr/docs' },
      { name: 'route-2', source: '/[lang]/docs', rendered: '/en/docs' },
      { name: 'route-3', source: '/en/docs', rendered: '/[lang]/docs' },
      { name: 'route-4', source: '/[lang]/docs', rendered: '/[lang]/docs' },
    ]

    const sorted = sortSortableRouteObjects(objects, (obj) => ({
      sourcePage: obj.source,
      page: obj.rendered,
    }))

    expect(sorted.map((r) => r.name)).toEqual([
      'route-3', // static source wins
      'route-2', // same dynamic source, but '/en/docs' < '/fr/docs'
      'route-1', // same dynamic source, but '/fr/docs' > '/en/docs'
      'route-4', // same dynamic source, fully dynamic page last
    ])
  })

  it('should handle complex route specificity ordering', () => {
    const objects = [
      { id: 'optional-catchall', path: '/docs/[[...slug]]' },
      { id: 'catchall', path: '/docs/[...slug]' },
      { id: 'dynamic', path: '/docs/[slug]' },
      { id: 'static-nested', path: '/docs/api/auth' },
      { id: 'static-mid', path: '/docs/api' },
      { id: 'static-root', path: '/docs' },
    ]

    const sorted = sortSortableRouteObjects(objects, (obj) => ({
      sourcePage: obj.path,
      page: obj.path,
    }))

    expect(sorted.map((r) => r.id)).toEqual([
      'static-root', // '/docs' - most specific (shortest + static)
      'static-mid', // '/docs/api' - static segment
      'static-nested', // '/docs/api/auth' - longer static path
      'dynamic', // '/docs/[slug]' - dynamic segment
      'catchall', // '/docs/[...slug]' - catch-all
      'optional-catchall', // '/docs/[[...slug]]' - optional catch-all (least specific)
    ])
  })

  it('should not mutate the input array', () => {
    const objects = [
      { id: 3, route: '/api/[id]' },
      { id: 1, route: '/api' },
      { id: 2, route: '/api/users' },
    ]

    const originalOrder = [...objects]

    const sorted = sortSortableRouteObjects(objects, (obj) => ({
      sourcePage: obj.route,
      page: obj.route,
    }))

    // Original array should be unchanged
    expect(objects).toEqual(originalOrder)

    // Sorted array should be different
    expect(sorted.map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('should handle empty array', () => {
    const objects: any[] = []

    const sorted = sortSortableRouteObjects(objects, (obj) => ({
      sourcePage: obj.path,
      page: obj.path,
    }))

    expect(sorted).toEqual([])
  })

  it('should handle single object', () => {
    const objects = [{ name: 'only', path: '/api/users/[id]' }]

    const sorted = sortSortableRouteObjects(objects, (obj) => ({
      sourcePage: obj.path,
      page: obj.path,
    }))

    expect(sorted).toEqual([{ name: 'only', path: '/api/users/[id]' }])
    expect(sorted[0]).toBe(objects[0]) // Same reference
  })

  it('should handle duplicate route patterns with different objects', () => {
    const objects = [
      { type: 'layout', pattern: '/[lang]/blog' },
      { type: 'page', pattern: '/[lang]/blog' },
      { type: 'api', pattern: '/[lang]/blog' },
    ]

    const sorted = sortSortableRouteObjects(objects, (obj) => ({
      sourcePage: obj.pattern,
      page: obj.pattern,
    }))

    // All should have same route, so original order preserved (stable sort)
    expect(sorted).toEqual(objects)
    expect(sorted[0]).toBe(objects[0])
    expect(sorted[1]).toBe(objects[1])
    expect(sorted[2]).toBe(objects[2])
  })

  it('should work with getter function that creates new objects each time', () => {
    // This test specifically covers the bug that was fixed in the WeakMap version
    const objects = [
      { page: '/blog/[slug]' },
      { page: '/blog/post-1' },
      { page: '/api/[...params]' },
    ]

    // Getter that creates new objects each time (like in the build process)
    const sorted = sortSortableRouteObjects(objects, (obj) => ({
      sourcePage: obj.page, // New object created each call
      page: obj.page,
    }))

    expect(sorted.map((r) => r.page)).toEqual([
      '/api/[...params]', // Catch-all at root level comes first in this context
      '/blog/post-1', // Static segment
      '/blog/[slug]', // Dynamic segment
    ])

    // Verify original objects are returned, not new ones
    expect(sorted[1]).toBe(objects[1]) // post-1 object reference preserved
  })

  it('should handle mixed route depths correctly', () => {
    const objects = [
      { name: 'deep-catchall', route: '/api/v1/[...path]' },
      { name: 'root', route: '/' },
      { name: 'shallow-dynamic', route: '/[slug]' },
      { name: 'mid-static', route: '/api/users' },
      { name: 'deep-static', route: '/api/v1/auth/login' },
    ]

    const sorted = sortSortableRouteObjects(objects, (obj) => ({
      sourcePage: obj.route,
      page: obj.route,
    }))

    expect(sorted.map((r) => r.name)).toEqual([
      'root', // '/' - shortest and static
      'mid-static', // '/api/users' - static segment before dynamic
      'deep-static', // '/api/v1/auth/login' - longest static
      'deep-catchall', // '/api/v1/[...path]' - catch-all
      'shallow-dynamic', // '/[slug]' - dynamic comes after static
    ])
  })

  it('should sort lexicographically when all other factors are equal', () => {
    const objects = [
      { letter: 'z', route: '/[lang]/zebra' },
      { letter: 'a', route: '/[lang]/apple' },
      { letter: 'm', route: '/[lang]/mango' },
      { letter: 'b', route: '/[lang]/banana' },
    ]

    const sorted = sortSortableRouteObjects(objects, (obj) => ({
      sourcePage: obj.route,
      page: obj.route,
    }))

    expect(sorted.map((r) => r.letter)).toEqual(['a', 'b', 'm', 'z'])
  })
})

describe('sortPageObjects', () => {
  it('should handle duplicate pages correctly (bug fix)', () => {
    // This test specifically covers the bug that was fixed where duplicate pages
    // would overwrite each other in the indexes object
    const objects = [
      { id: 'first', type: 'layout', route: '/blog/[slug]' },
      { id: 'second', type: 'page', route: '/blog/post-1' },
      { id: 'third', type: 'page', route: '/blog/[slug]' }, // Same route as first
      { id: 'fourth', type: 'api', route: '/api/users' },
      { id: 'fifth', type: 'middleware', route: '/blog/[slug]' }, // Same route as first and third
    ]

    const sorted = sortPageObjects(objects, (obj) => obj.route)

    // Should preserve all objects, even those with duplicate routes
    expect(sorted.length).toBe(5)

    // Should be sorted by route specificity
    expect(sorted.map((r) => r.id)).toEqual([
      'fourth', // '/api/users' - static, most specific
      'second', // '/blog/post-1' - static
      'first', // '/blog/[slug]' - dynamic (first occurrence)
      'third', // '/blog/[slug]' - dynamic (second occurrence)
      'fifth', // '/blog/[slug]' - dynamic (third occurrence)
    ])

    // Verify all objects are preserved with their original properties
    expect(sorted[0]).toEqual({
      id: 'fourth',
      type: 'api',
      route: '/api/users',
    })
    expect(sorted[1]).toEqual({
      id: 'second',
      type: 'page',
      route: '/blog/post-1',
    })
    expect(sorted[2]).toEqual({
      id: 'first',
      type: 'layout',
      route: '/blog/[slug]',
    })
    expect(sorted[3]).toEqual({
      id: 'third',
      type: 'page',
      route: '/blog/[slug]',
    })
    expect(sorted[4]).toEqual({
      id: 'fifth',
      type: 'middleware',
      route: '/blog/[slug]',
    })
  })

  it('should sort pages by specificity', () => {
    const objects = [
      { name: 'catchall', path: '/docs/[...slug]' },
      { name: 'static', path: '/docs/api' },
      { name: 'dynamic', path: '/docs/[slug]' },
      { name: 'optional', path: '/docs/[[...slug]]' },
    ]

    const sorted = sortPageObjects(objects, (obj) => obj.path)

    expect(sorted.map((r) => r.name)).toEqual([
      'static', // '/docs/api' - static segment
      'dynamic', // '/docs/[slug]' - dynamic segment
      'catchall', // '/docs/[...slug]' - catch-all
      'optional', // '/docs/[[...slug]]' - optional catch-all
    ])
  })

  it('should maintain original order for identical routes (stable sort)', () => {
    const objects = [
      { id: 'a', route: '/same' },
      { id: 'b', route: '/same' },
      { id: 'c', route: '/same' },
    ]

    const sorted = sortPageObjects(objects, (obj) => obj.route)

    expect(sorted.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('should handle mixed route depths', () => {
    const objects = [
      { name: 'deep', route: '/api/v1/users/[id]' },
      { name: 'shallow', route: '/[slug]' },
      { name: 'root', route: '/' },
      { name: 'mid', route: '/api/users' },
    ]

    const sorted = sortPageObjects(objects, (obj) => obj.route)

    expect(sorted.map((r) => r.name)).toEqual([
      'root', // '/' - shortest and static
      'mid', // '/api/users' - static
      'deep', // '/api/v1/users/[id]' - longer static path before dynamic
      'shallow', // '/[slug]' - dynamic
    ])
  })

  it('should sort lexicographically when specificity is equal', () => {
    const objects = [
      { letter: 'z', route: '/zebra' },
      { letter: 'a', route: '/apple' },
      { letter: 'm', route: '/mango' },
    ]

    const sorted = sortPageObjects(objects, (obj) => obj.route)

    expect(sorted.map((r) => r.letter)).toEqual(['a', 'm', 'z'])
  })

  it('should handle empty array', () => {
    const objects: any[] = []
    const sorted = sortPageObjects(objects, (obj) => obj.route)
    expect(sorted).toEqual([])
  })

  it('should handle single object', () => {
    const objects = [{ name: 'only', route: '/single' }]
    const sorted = sortPageObjects(objects, (obj) => obj.route)
    expect(sorted).toEqual([{ name: 'only', route: '/single' }])
  })

  it('should not mutate the input array', () => {
    const objects = [
      { id: 2, route: '/dynamic/[id]' },
      { id: 1, route: '/static' },
    ]
    const originalOrder = [...objects]

    const sorted = sortPageObjects(objects, (obj) => obj.route)

    // Original array should be unchanged
    expect(objects).toEqual(originalOrder)

    // Sorted array should be different - '/dynamic/[id]' comes before '/static' lexicographically
    expect(sorted.map((r) => r.id)).toEqual([2, 1])
  })

  it('should handle many duplicate routes efficiently', () => {
    // Test with many duplicates to ensure the fix handles large datasets
    const objects = []
    for (let i = 0; i < 100; i++) {
      objects.push({ id: i, route: '/blog/[slug]' })
    }
    objects.push({ id: 'static', route: '/blog/about' })

    const sorted = sortPageObjects(objects, (obj) => obj.route)

    // Should preserve all objects
    expect(sorted.length).toBe(101)

    // Static route should come first
    expect(sorted[0].id).toBe('static')

    // All dynamic routes should follow in original order
    for (let i = 1; i < 101; i++) {
      expect(sorted[i].id).toBe(i - 1)
    }
  })
})

describe('sortPages', () => {
  it('should sort pages by specificity', () => {
    const pages = [
      '/docs/[[...slug]]',
      '/docs/[...slug]',
      '/docs/[slug]',
      '/docs/api',
      '/docs',
    ]

    const sorted = sortPages(pages)

    expect(sorted).toEqual([
      '/docs',
      '/docs/api',
      '/docs/[slug]',
      '/docs/[...slug]',
      '/docs/[[...slug]]',
    ])
  })

  it('should handle mixed route depths', () => {
    const pages = [
      '/api/v1/[...path]',
      '/[slug]',
      '/',
      '/api/users/[id]',
      '/api',
    ]

    const sorted = sortPages(pages)

    expect(sorted).toEqual([
      '/',
      '/api',
      '/api/users/[id]',
      '/api/v1/[...path]',
      '/[slug]',
    ])
  })

  it('should sort lexicographically when specificity is equal', () => {
    const pages = ['/zebra', '/apple', '/mango']

    const sorted = sortPages(pages)

    expect(sorted).toEqual(['/apple', '/mango', '/zebra'])
  })

  it('should handle empty array', () => {
    const pages: string[] = []
    const sorted = sortPages(pages)
    expect(sorted).toEqual([])
  })

  it('should handle single page', () => {
    const pages = ['/single']
    const sorted = sortPages(pages)
    expect(sorted).toEqual(['/single'])
  })

  it('should not mutate the input array', () => {
    const pages = ['/static', '/dynamic/[id]']
    const originalOrder = [...pages]

    const sorted = sortPages(pages)

    // Original array should be unchanged
    expect(pages).toEqual(originalOrder)

    // Sorted array should be different - '/dynamic/[id]' comes before '/static' lexicographically
    expect(sorted).toEqual(['/dynamic/[id]', '/static'])
  })

  it('should handle duplicate pages', () => {
    const pages = [
      '/blog/[slug]',
      '/blog/post-1',
      '/blog/[slug]',
      '/blog/[slug]',
    ]

    const sorted = sortPages(pages)

    expect(sorted).toEqual([
      '/blog/post-1',
      '/blog/[slug]',
      '/blog/[slug]',
      '/blog/[slug]',
    ])
  })

  it('should handle complex nested routes', () => {
    const pages = [
      '/[lang]/blog/[[...slug]]',
      '/en/blog/[slug]',
      '/[lang]/blog/[slug]',
      '/en/blog',
      '/[lang]/blog',
      '/[lang]/blog/[...slug]',
    ]

    const sorted = sortPages(pages)

    expect(sorted).toEqual([
      '/en/blog',
      '/en/blog/[slug]',
      '/[lang]/blog',
      '/[lang]/blog/[slug]',
      '/[lang]/blog/[...slug]',
      '/[lang]/blog/[[...slug]]',
    ])
  })
})

describe('getSegmentSpecificity', () => {
  it('should return 0 for static segments', () => {
    expect(getSegmentSpecificity('api')).toBe(0)
    expect(getSegmentSpecificity('users')).toBe(0)
    expect(getSegmentSpecificity('dashboard')).toBe(0)
    expect(getSegmentSpecificity('123')).toBe(0)
    expect(getSegmentSpecificity('about-us')).toBe(0)
  })

  it('should return 1 for dynamic segments', () => {
    expect(getSegmentSpecificity('[id]')).toBe(1)
    expect(getSegmentSpecificity('[slug]')).toBe(1)
    expect(getSegmentSpecificity('[userId]')).toBe(1)
    expect(getSegmentSpecificity('[post-id]')).toBe(1)
  })

  it('should return 2 for catch-all segments', () => {
    expect(getSegmentSpecificity('[...slug]')).toBe(2)
    expect(getSegmentSpecificity('[...path]')).toBe(2)
    expect(getSegmentSpecificity('[...params]')).toBe(2)
  })

  it('should return 3 for optional catch-all segments', () => {
    expect(getSegmentSpecificity('[[...slug]]')).toBe(3)
    expect(getSegmentSpecificity('[[...path]]')).toBe(3)
    expect(getSegmentSpecificity('[[...params]]')).toBe(3)
  })

  it('should handle edge cases', () => {
    expect(getSegmentSpecificity('')).toBe(0)
    expect(getSegmentSpecificity('[')).toBe(0) // Malformed bracket
    expect(getSegmentSpecificity(']')).toBe(0) // Malformed bracket
    expect(getSegmentSpecificity('[id')).toBe(0) // Missing closing bracket
    expect(getSegmentSpecificity('id]')).toBe(0) // Missing opening bracket
    expect(getSegmentSpecificity('[[...slug]')).toBe(1) // Malformed optional catch-all - treated as dynamic
    expect(getSegmentSpecificity('[...slug]]')).toBe(2) // Malformed optional catch-all - treated as catch-all
  })

  it('should handle segments with brackets but not dynamic routes', () => {
    expect(getSegmentSpecificity('api[version]')).toBe(0) // Contains brackets but not a dynamic route
    expect(getSegmentSpecificity('users[admin]')).toBe(0)
  })
})

describe('compareRouteSegments', () => {
  it('should prioritize shorter routes', () => {
    expect(compareRouteSegments('/api', '/api/users')).toBe(-1)
    expect(compareRouteSegments('/api/users', '/api')).toBe(1)
    expect(compareRouteSegments('/', '/about')).toBe(-1)
    expect(compareRouteSegments('/about', '/')).toBe(1)
  })

  it('should prioritize static over dynamic segments', () => {
    expect(compareRouteSegments('/api/users', '/api/[id]')).toBe(-1)
    expect(compareRouteSegments('/api/[id]', '/api/users')).toBe(1)
    expect(compareRouteSegments('/blog/about', '/blog/[slug]')).toBe(-1)
  })

  it('should prioritize dynamic over catch-all segments', () => {
    expect(compareRouteSegments('/api/[id]', '/api/[...path]')).toBe(-1)
    expect(compareRouteSegments('/api/[...path]', '/api/[id]')).toBe(1)
    expect(compareRouteSegments('/docs/[slug]', '/docs/[...slug]')).toBe(-1)
  })

  it('should prioritize catch-all over optional catch-all segments', () => {
    expect(compareRouteSegments('/docs/[...slug]', '/docs/[[...slug]]')).toBe(
      -1
    )
    expect(compareRouteSegments('/docs/[[...slug]]', '/docs/[...slug]')).toBe(1)
  })

  it('should handle complete specificity hierarchy', () => {
    const routes = [
      '/docs/[[...slug]]',
      '/docs/[...slug]',
      '/docs/[slug]',
      '/docs/api',
    ]

    const sorted = routes.sort(compareRouteSegments)
    expect(sorted).toEqual([
      '/docs/api', // Static - most specific
      '/docs/[slug]', // Dynamic
      '/docs/[...slug]', // Catch-all
      '/docs/[[...slug]]', // Optional catch-all - least specific
    ])
  })

  it('should sort lexicographically when specificity is equal', () => {
    expect(compareRouteSegments('/api/zebra', '/api/apple')).toBe(1)
    expect(compareRouteSegments('/api/apple', '/api/zebra')).toBe(-1)
    expect(compareRouteSegments('/[lang]/zebra', '/[lang]/apple')).toBe(1)
    expect(compareRouteSegments('/[lang]/apple', '/[lang]/zebra')).toBe(-1)
  })

  it('should handle identical routes', () => {
    expect(compareRouteSegments('/api/users', '/api/users')).toBe(0)
    expect(compareRouteSegments('/[lang]/[slug]', '/[lang]/[slug]')).toBe(0)
    expect(compareRouteSegments('/docs/[...slug]', '/docs/[...slug]')).toBe(0)
  })

  it('should handle empty paths', () => {
    expect(compareRouteSegments('', '')).toBe(0)
    expect(compareRouteSegments('', '/api')).toBe(-1)
    expect(compareRouteSegments('/api', '')).toBe(1)
  })

  it('should handle root path', () => {
    expect(compareRouteSegments('/', '/api')).toBe(-1)
    expect(compareRouteSegments('/api', '/')).toBe(1)
    expect(compareRouteSegments('/', '/')).toBe(0)
  })

  it('should handle paths with leading/trailing slashes consistently', () => {
    expect(compareRouteSegments('/api/users/', '/api/users')).toBe(0)
    expect(compareRouteSegments('api/users', '/api/users')).toBe(0)
    expect(compareRouteSegments('/api/users/', 'api/users')).toBe(0)
  })

  it('should handle complex nested comparisons', () => {
    expect(compareRouteSegments('/[lang]/blog/[slug]', '/en/blog/[slug]')).toBe(
      1
    )
    expect(compareRouteSegments('/en/blog/[slug]', '/[lang]/blog/[slug]')).toBe(
      -1
    )
    expect(
      compareRouteSegments('/[lang]/blog/[...slug]', '/[lang]/blog/[slug]')
    ).toBe(1)
  })

  it('should handle mixed depths with different specificities', () => {
    const routes = [
      '/api/v1/users/[id]/posts/[...slug]',
      '/api/v1/users/[id]/posts',
      '/api/v1/users/[id]',
      '/api/v1/users',
      '/api/v1',
      '/api',
    ]

    const sorted = routes.sort(compareRouteSegments)
    expect(sorted).toEqual([
      '/api',
      '/api/v1',
      '/api/v1/users',
      '/api/v1/users/[id]',
      '/api/v1/users/[id]/posts',
      '/api/v1/users/[id]/posts/[...slug]',
    ])
  })
})
