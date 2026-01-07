import {
  createOpaqueFallbackRouteParams,
  getFallbackRouteParams,
} from './fallback-params'
import type { FallbackRouteParam } from '../../build/static-paths/types'
import type AppPageRouteModule from '../route-modules/app-page/module'
import type { LoaderTree } from '../lib/app-dir-module'

// Helper to create LoaderTree structures for testing
type TestLoaderTree = [
  segment: string,
  parallelRoutes: { [key: string]: TestLoaderTree },
  modules: Record<string, unknown>,
]

function createLoaderTree(
  segment: string,
  parallelRoutes: { [key: string]: TestLoaderTree } = {},
  children?: TestLoaderTree
): TestLoaderTree {
  const routes = children ? { ...parallelRoutes, children } : parallelRoutes
  return [segment, routes, {}]
}

/**
 * Creates a mock AppPageRouteModule for testing.
 */
function createMockRouteModule(loaderTree: LoaderTree): AppPageRouteModule {
  return {
    userland: {
      loaderTree,
    },
  } as AppPageRouteModule
}

describe('createOpaqueFallbackRouteParams', () => {
  describe('opaque object interface', () => {
    const fallbackParams: readonly FallbackRouteParam[] = [
      { paramName: 'slug', paramType: 'dynamic' },
      { paramName: 'modal', paramType: 'dynamic' },
    ]

    it('has method works correctly', () => {
      const result = createOpaqueFallbackRouteParams(fallbackParams)!

      expect(result.has('slug')).toBe(true)
      expect(result.has('modal')).toBe(true)
      expect(result.has('nonexistent')).toBe(false)
      expect(result.has('')).toBe(false)
    })

    it('get method works correctly', () => {
      const result = createOpaqueFallbackRouteParams(fallbackParams)!

      expect(result.get('slug')?.[0]).toMatch(/^%%drp:slug:[a-f0-9]+%%$/)
      expect(result.get('modal')?.[0]).toMatch(/^%%drp:modal:[a-f0-9]+%%$/)
      expect(result.get('nonexistent')).toBeUndefined()
      expect(result.get('')).toBeUndefined()
    })

    it('iterator yields correct entries', () => {
      const result = createOpaqueFallbackRouteParams(fallbackParams)!

      const entries = Array.from(result.entries())
      expect(entries).toHaveLength(2)

      const [name, [value]] = entries[0]
      expect(name).toBe('slug')
      expect(value).toMatch(/^%%drp:slug:[a-f0-9]+%%$/)
    })
  })
})

describe('getFallbackRouteParams', () => {
  describe('Regular Routes (children segments)', () => {
    it('should extract single dynamic segment from children route', () => {
      // Tree: /[slug]
      const loaderTree = createLoaderTree('', {}, createLoaderTree('[slug]'))
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/[slug]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.has('slug')).toBe(true)
      expect(result!.get('slug')?.[1]).toBe('d') // 'd' = dynamic (short type)
    })

    it('should extract multiple nested dynamic segments', () => {
      // Tree: /[category]/[slug]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[category]', {}, createLoaderTree('[slug]'))
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/[category]/[slug]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(2)
      expect(result!.has('category')).toBe(true)
      expect(result!.has('slug')).toBe(true)
      expect(result!.get('category')?.[1]).toBe('d')
      expect(result!.get('slug')?.[1]).toBe('d')
    })

    it('should extract catchall segment', () => {
      // Tree: /[...slug]
      const loaderTree = createLoaderTree('', {}, createLoaderTree('[...slug]'))
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/[...slug]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('slug')).toBe(true)
      expect(result!.get('slug')?.[1]).toBe('c') // 'c' = catchall
    })

    it('should extract optional catchall segment', () => {
      // Tree: /[[...slug]]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[[...slug]]')
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/[[...slug]]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('slug')).toBe(true)
      expect(result!.get('slug')?.[1]).toBe('oc') // 'oc' = optional-catchall
    })

    it('should extract mixed static and dynamic segments', () => {
      // Tree: /blog/[category]/posts/[slug]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'blog',
          {},
          createLoaderTree(
            '[category]',
            {},
            createLoaderTree('posts', {}, createLoaderTree('[slug]'))
          )
        )
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams(
        '/blog/[category]/posts/[slug]',
        routeModule
      )

      expect(result).not.toBeNull()
      expect(result!.size).toBe(2)
      expect(result!.has('category')).toBe(true)
      expect(result!.has('slug')).toBe(true)
    })

    it('should handle route with no dynamic segments', () => {
      // Tree: /blog/posts
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('blog', {}, createLoaderTree('posts'))
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/blog/posts', routeModule)

      // Should return null for no fallback params
      expect(result).toBeNull()
    })

    it('should handle partially static routes', () => {
      // Tree: /[teamSlug]/[projectSlug] but page is /vercel/[projectSlug]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[teamSlug]', {}, createLoaderTree('[projectSlug]'))
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams(
        '/vercel/[projectSlug]',
        routeModule
      )

      expect(result).not.toBeNull()
      // Only projectSlug should be a fallback param, vercel is static
      expect(result!.has('projectSlug')).toBe(true)
      expect(result!.has('teamSlug')).toBe(false)
    })
  })

  describe('Route Groups', () => {
    it('should ignore route groups when extracting segments', () => {
      // Tree: /(marketing)/blog/[slug]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '(marketing)',
          {},
          createLoaderTree('blog', {}, createLoaderTree('[slug]'))
        )
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/blog/[slug]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('slug')).toBe(true)
    })

    it('should handle route groups mixed with static segments', () => {
      // Tree: /(app)/dashboard/(users)/[userId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '(app)',
          {},
          createLoaderTree(
            'dashboard',
            {},
            createLoaderTree('(users)', {}, createLoaderTree('[userId]'))
          )
        )
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/dashboard/[userId]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('userId')).toBe(true)
    })
  })

  describe('Parallel Routes', () => {
    it('should extract segment from parallel route matching pathname', () => {
      // Tree: / -> @modal/[id]
      const loaderTree = createLoaderTree('', {
        modal: createLoaderTree('[id]'),
      })
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/[id]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('id')).toBe(true)
    })

    it('should extract segments from both children and parallel routes', () => {
      // Tree: /[lang] -> children + @modal/[photoId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[lang]', {
          modal: createLoaderTree('[photoId]'),
        })
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/[lang]/[photoId]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(2)
      expect(result!.has('lang')).toBe(true)
      expect(result!.has('photoId')).toBe(true)
    })

    it('should handle parallel route params that are not in pathname', () => {
      // Tree: /[id] -> @modal/[photoId] (photoId is not in pathname /[id])
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[id]', {
          modal: createLoaderTree('[photoId]'),
        })
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/[id]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(2)
      expect(result!.has('id')).toBe(true)
      // photoId should also be included as it's a parallel route param
      expect(result!.has('photoId')).toBe(true)
    })
  })

  describe('Interception Routes', () => {
    it('should extract segment from (.) same-level interception route', () => {
      // Tree: /(.)photo/[photoId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('(.)photo', {}, createLoaderTree('[photoId]'))
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/(.)photo/[photoId]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('photoId')).toBe(true)
    })

    it('should extract segment from (..) parent-level interception route', () => {
      // Tree: /gallery/(..)photo/[photoId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'gallery',
          {},
          createLoaderTree('(..)photo', {}, createLoaderTree('[photoId]'))
        )
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams(
        '/gallery/(..)photo/[photoId]',
        routeModule
      )

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('photoId')).toBe(true)
    })

    it('should extract intercepted param when marker is part of the segment itself', () => {
      // Tree: /(.)[photoId] - the interception marker is PART OF the dynamic segment
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('(.)[photoId]')
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/[photoId]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('photoId')).toBe(true)
      // Should have intercepted type
      expect(result!.get('photoId')?.[1]).toBe('di(.)') // 'di(.)' = dynamic-intercepted-(.)'
    })
  })

  describe('Interception Routes in Parallel Routes', () => {
    it('should extract segment from interception route in parallel slot', () => {
      // Tree: @modal/(.)photo/[photoId]
      const loaderTree = createLoaderTree('', {
        modal: createLoaderTree('(.)photo', {}, createLoaderTree('[photoId]')),
      })
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/(.)photo/[photoId]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('photoId')).toBe(true)
    })

    it('should extract segments from both children and intercepting parallel route', () => {
      // Tree: /[id] -> children + @modal/(.)photo/[photoId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[id]', {
          modal: createLoaderTree(
            '(.)photo',
            {},
            createLoaderTree('[photoId]')
          ),
        })
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams(
        '/[id]/(.)photo/[photoId]',
        routeModule
      )

      expect(result).not.toBeNull()
      expect(result!.size).toBe(2)
      expect(result!.has('id')).toBe(true)
      expect(result!.has('photoId')).toBe(true)
    })

    it('should handle realistic photo gallery pattern with interception', () => {
      // Realistic pattern: /photos/[id] with @modal/(.)photo/[photoId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'photos',
          {},
          createLoaderTree('[id]', {
            modal: createLoaderTree(
              '(.)photo',
              {},
              createLoaderTree('[photoId]')
            ),
          })
        )
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams(
        '/photos/[id]/(.)photo/[photoId]',
        routeModule
      )

      expect(result).not.toBeNull()
      expect(result!.size).toBe(2)
      expect(result!.has('id')).toBe(true)
      expect(result!.has('photoId')).toBe(true)
    })
  })

  describe('Complex Mixed Scenarios', () => {
    it('should handle route groups + parallel routes + interception routes', () => {
      // Tree: /(marketing)/[lang] -> @modal/(.)photo/[photoId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '(marketing)',
          {},
          createLoaderTree('[lang]', {
            modal: createLoaderTree(
              '(.)photo',
              {},
              createLoaderTree('[photoId]')
            ),
          })
        )
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams(
        '/[lang]/(.)photo/[photoId]',
        routeModule
      )

      expect(result).not.toBeNull()
      expect(result!.size).toBe(2)
      expect(result!.has('lang')).toBe(true)
      expect(result!.has('photoId')).toBe(true)
    })

    it('should handle i18n with interception routes', () => {
      // Tree: /[locale]/products/[category] -> @modal/(.)product/[productId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '[locale]',
          {},
          createLoaderTree(
            'products',
            {},
            createLoaderTree('[category]', {
              modal: createLoaderTree(
                '(.)product',
                {},
                createLoaderTree('[productId]')
              ),
            })
          )
        )
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams(
        '/[locale]/products/[category]/(.)product/[productId]',
        routeModule
      )

      expect(result).not.toBeNull()
      expect(result!.size).toBe(3)
      expect(result!.has('locale')).toBe(true)
      expect(result!.has('category')).toBe(true)
      expect(result!.has('productId')).toBe(true)
    })

    it('should handle partially static i18n route', () => {
      // Tree: /[locale]/products/[category] but page is /en/products/[category]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '[locale]',
          {},
          createLoaderTree('products', {}, createLoaderTree('[category]'))
        )
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams(
        '/en/products/[category]',
        routeModule
      )

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('category')).toBe(true)
      // locale should not be a fallback param because 'en' is static
      expect(result!.has('locale')).toBe(false)
    })

    it('should handle a partially static intercepting route', () => {
      // Tree: /[locale]/(.)photo/[photoId] but page is /en/(.)photo/[photoId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[locale]', {
          modal: createLoaderTree(
            '(.)photo',
            {},
            createLoaderTree('[photoId]')
          ),
        })
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams(
        '/en/(.)photo/[photoId]',
        routeModule
      )

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('photoId')).toBe(true)
      // locale should not be a fallback param because 'en' is static
      expect(result!.has('locale')).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should return null for pathname with no dynamic segments', () => {
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('blog', {}, createLoaderTree('posts'))
      )
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/blog/posts', routeModule)

      expect(result).toBeNull()
    })

    it('should handle empty segment in tree', () => {
      // Tree: '' -> [id]
      const loaderTree = createLoaderTree('', {}, createLoaderTree('[id]'))
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/[id]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('id')).toBe(true)
    })

    it('should handle root dynamic route', () => {
      // Tree: /[slug]
      const loaderTree = createLoaderTree('', {}, createLoaderTree('[slug]'))
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/[slug]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('slug')).toBe(true)
    })

    it('should handle catchall at root', () => {
      // Tree: /[...slug]
      const loaderTree = createLoaderTree('', {}, createLoaderTree('[...slug]'))
      const routeModule = createMockRouteModule(loaderTree)
      const result = getFallbackRouteParams('/[...slug]', routeModule)

      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('slug')).toBe(true)
      expect(result!.get('slug')?.[1]).toBe('c') // catchall
    })

    it('should handle optional catchall in parallel route', () => {
      // Tree: @sidebar/[[...optional]]
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[[...optional]]'),
      })
      const routeModule = createMockRouteModule(loaderTree)

      let result = getFallbackRouteParams('/[[...optional]]', routeModule)
      expect(result).not.toBeNull()
      expect(result!.size).toBe(1)
      expect(result!.has('optional')).toBe(true)
      expect(result!.get('optional')?.[1]).toBe('oc') // optional-catchall

      result = getFallbackRouteParams('/sidebar/is/real', routeModule)
      expect(result).toBeNull()
    })
  })
})
