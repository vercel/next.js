import type { Params } from '../../server/request/params'
import { parseAppRoute } from '../../shared/lib/router/routes/app'
import type { FallbackRouteParam } from './types'
import { resolveRouteParamsFromTree } from './utils'

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

describe('resolveRouteParamsFromTree', () => {
  describe('direct match case', () => {
    it('should skip processing when param already exists in params object', () => {
      // Tree: / -> @sidebar/[existingParam]
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[existingParam]'),
      })
      const params: Params = { existingParam: 'value' }
      const route = parseAppRoute('/some/path', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.existingParam).toBe('value')
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should skip processing for multiple existing params', () => {
      // Tree: / -> @sidebar/[param1] + @modal/[...param2]
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[param1]'),
        modal: createLoaderTree('[...param2]'),
      })
      const params: Params = { param1: 'value1', param2: ['a', 'b'] }
      const route = parseAppRoute('/some/path', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.param1).toBe('value1')
      expect(params.param2).toEqual(['a', 'b'])
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })

  describe('dynamic params', () => {
    it('should extract dynamic param from pathname when not already in params', () => {
      // Tree: / -> @sidebar/[dynamicParam]
      // At depth 0, should extract 'some' from pathname '/some/path'
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[dynamicParam]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/some/path', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.dynamicParam).toBe('some')
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should handle multiple dynamic params in parallel routes at same depth', () => {
      // Tree: / -> @modal/[id] + @sidebar/[category]
      // Both at depth 0, so both extract 'photo' from pathname '/photo/123'
      const loaderTree = createLoaderTree('', {
        modal: createLoaderTree('[id]'),
        sidebar: createLoaderTree('[category]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/photo/123', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Both should extract the first segment 'photo'
      expect(params.id).toBe('photo')
      expect(params.category).toBe('photo')
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should extract dynamic param from pathname at depth 0', () => {
      // Tree: / -> @sidebar/[category]
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[category]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/tech', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.category).toBe('tech')
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should extract dynamic param from pathname at nested depth', () => {
      // Tree: /blog -> @sidebar/[category]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('blog', {
          sidebar: createLoaderTree('[category]'),
        })
      )
      const params: Params = {}
      const route = parseAppRoute('/blog/tech', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.category).toBe('tech')
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should extract dynamic param even when other unknown params exist at different depths', () => {
      // Tree: / -> @sidebar/[category]
      // Even though there's an unknown 'slug' param somewhere else, if the segment
      // at this depth is known, we can extract it
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[category]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/tech', true)
      const fallbackRouteParams: FallbackRouteParam[] = [
        { paramName: 'slug', paramType: 'dynamic' },
      ]

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should extract 'tech' because pathSegments[0] is known, regardless of slug
      expect(params.category).toBe('tech')
      expect(fallbackRouteParams).toHaveLength(1) // Still just slug
    })

    it('should mark dynamic param as fallback when depth exceeds pathname length', () => {
      // Tree: /blog/posts -> @sidebar/[category]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'blog',
          {},
          createLoaderTree('posts', {
            sidebar: createLoaderTree('[category]'),
          })
        )
      )
      const params: Params = {}
      const route = parseAppRoute('/blog', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.category).toBeUndefined()
      expect(fallbackRouteParams).toHaveLength(1)
      expect(fallbackRouteParams[0]).toEqual({
        paramName: 'category',
        paramType: 'dynamic',
      })
    })

    it('should resolve embedded params when extracting dynamic param value', () => {
      // Tree: /[lang] -> @sidebar/[category]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[lang]', {
          sidebar: createLoaderTree('[category]'),
        })
      )
      const params: Params = { lang: 'en' }
      const route = parseAppRoute('/en/tech', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.category).toBe('tech')
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should extract dynamic param when unknown params exist at LATER depth', () => {
      // Tree: /[lang] -> @sidebar/[filter] (at depth 1)
      //       /[lang]/products/[category] (category at depth 2 is unknown)
      // @sidebar/[filter] is at depth 1, should extract 'products'
      // [category] at depth 2 is unknown, but shouldn't affect depth 1 resolution
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '[lang]',
          {
            sidebar: createLoaderTree('[filter]'),
          },
          createLoaderTree('products', {}, createLoaderTree('[category]'))
        )
      )
      const params: Params = { lang: 'en' }
      const route = parseAppRoute('/en/products/[category]', true)
      const fallbackRouteParams: FallbackRouteParam[] = [
        { paramName: 'category', paramType: 'dynamic' },
      ]

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should extract 'products' at depth 1, even though category at depth 2 is unknown
      expect(params.filter).toBe('products')
      expect(fallbackRouteParams).toHaveLength(1) // Still just category
    })

    it('should NOT extract dynamic param when placeholder is at SAME depth', () => {
      // Tree: /[lang]/products/[category] -> @sidebar/[filter]
      // @sidebar/[filter] is at depth 2
      // [category] at depth 2 is also unknown - same depth!
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '[lang]',
          {},
          createLoaderTree(
            'products',
            {},
            createLoaderTree('[category]', {
              sidebar: createLoaderTree('[filter]'),
            })
          )
        )
      )
      const params: Params = { lang: 'en' }
      const route = parseAppRoute('/en/products/[category]', true)
      const fallbackRouteParams: FallbackRouteParam[] = [
        { paramName: 'category', paramType: 'dynamic' },
      ]

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should NOT extract because pathSegments[2] = '[category]' is a placeholder
      expect(params.filter).toBeUndefined()
      expect(fallbackRouteParams).toHaveLength(2)
      expect(fallbackRouteParams[1]).toEqual({
        paramName: 'filter',
        paramType: 'dynamic',
      })
    })
  })

  describe('catchall deriving from pathname with depth', () => {
    it('should use depth to correctly slice pathname segments', () => {
      // Tree: /blog -> @sidebar/[...catchallParam]
      // At depth 1 (after /blog), should get remaining segments
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('blog', {
          sidebar: createLoaderTree('[...catchallParam]'),
        })
      )
      const params: Params = {}
      const route = parseAppRoute('/blog/2023/posts/my-article', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should get segments from depth 1 onwards
      expect(params.catchallParam).toEqual(['2023', 'posts', 'my-article'])
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should handle catchall at depth 0 (root level)', () => {
      // Tree: / -> @sidebar/[...catchallParam]
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[...catchallParam]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/blog/2023/posts', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should get all segments
      expect(params.catchallParam).toEqual(['blog', '2023', 'posts'])
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should handle nested depth correctly', () => {
      // Tree: /products/[category] -> @filters/[...filterPath]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'products',
          {},
          createLoaderTree('[category]', {
            filters: createLoaderTree('[...filterPath]'),
          })
        )
      )
      const params: Params = { category: 'electronics' }
      const route = parseAppRoute('/products/electronics/phones/iphone', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should get segments from depth 2 onwards (after /products/[category])
      expect(params.filterPath).toEqual(['phones', 'iphone'])
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should handle single path segment', () => {
      // Tree: / -> @sidebar/[...catchallParam]
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[...catchallParam]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/single', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.catchallParam).toEqual(['single'])
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })

  describe('route groups', () => {
    it('should not increment depth for route groups', () => {
      // Tree: /(marketing) -> @sidebar/[...catchallParam]
      // Route groups don't contribute to pathname depth
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('(marketing)', {
          sidebar: createLoaderTree('[...catchallParam]'),
        })
      )
      const params: Params = {}
      const route = parseAppRoute('/blog/post', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should get all segments since route group doesn't increment depth
      expect(params.catchallParam).toEqual(['blog', 'post'])
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should handle multiple route groups', () => {
      // Tree: /(group1)/(group2)/blog -> @sidebar/[...path]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '(group1)',
          {},
          createLoaderTree(
            '(group2)',
            {},
            createLoaderTree('blog', {
              sidebar: createLoaderTree('[...path]'),
            })
          )
        )
      )
      const params: Params = {}
      const route = parseAppRoute('/blog/2023/posts', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should get segments from depth 1 (after /blog), route groups don't count
      expect(params.path).toEqual(['2023', 'posts'])
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })

  describe('optional-catchall with empty pathname', () => {
    it('should set params to empty array when pathname has no segments', () => {
      // Tree: / -> @sidebar/[[...optionalCatchall]]
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[[...optionalCatchall]]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.optionalCatchall).toBeUndefined()
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should handle optional catchall at nested depth with no remaining segments', () => {
      // Tree: /blog -> @sidebar/[[...optionalPath]]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('blog', {
          sidebar: createLoaderTree('[[...optionalPath]]'),
        })
      )
      const params: Params = {}
      const route = parseAppRoute('/blog', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.optionalPath).toBeUndefined()
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })

  describe('optional-catchall with non-empty pathname', () => {
    it('should populate params with path segments', () => {
      // Tree: / -> @sidebar/[[...optionalCatchall]]
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[[...optionalCatchall]]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/api/v1/users', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.optionalCatchall).toEqual(['api', 'v1', 'users'])
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })

  describe('catchall-intercepted params', () => {
    it('should handle catchall-intercepted params in parallel routes', () => {
      // Tree: / -> @modal/[...path]  where [...path] uses catchall-intercepted type
      // Note: catchall-intercepted is a param type, not related to interception routes
      const loaderTree = createLoaderTree('', {
        modal: createLoaderTree('[...path]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/photos/album/2023', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should get all segments
      expect(params.path).toEqual(['photos', 'album', '2023'])
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })

  describe('error cases', () => {
    it('should throw error for catchall with empty pathname', () => {
      // Tree: / -> @sidebar/[...catchallParam]
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[...catchallParam]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      expect(() =>
        resolveRouteParamsFromTree(
          loaderTree,
          params,
          route,
          fallbackRouteParams
        )
      ).toThrow(/Unexpected empty path segments/)
    })

    it('should throw error for catchall when depth exceeds pathname', () => {
      // Tree: /blog/posts -> @sidebar/[...catchallParam]
      // But pathname is just /blog
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'blog',
          {},
          createLoaderTree('posts', {
            sidebar: createLoaderTree('[...catchallParam]'),
          })
        )
      )
      const params: Params = {}
      const route = parseAppRoute('/blog', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      expect(() =>
        resolveRouteParamsFromTree(
          loaderTree,
          params,
          route,
          fallbackRouteParams
        )
      ).toThrow(/Unexpected empty path segments/)
    })
  })

  describe('complex scenarios', () => {
    it('should handle multiple parallel routes at same level', () => {
      // Tree: / -> @sidebar/[...sidebarPath] + @modal/[[...modalPath]]
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[...sidebarPath]'),
        modal: createLoaderTree('[[...modalPath]]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/products/electronics', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.sidebarPath).toEqual(['products', 'electronics'])
      expect(params.modalPath).toEqual(['products', 'electronics'])
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should handle parallel route with embedded dynamic param from pathname', () => {
      // Tree: /[lang] -> @sidebar/[...path]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[lang]', {
          sidebar: createLoaderTree('[...path]'),
        })
      )
      const params: Params = { lang: 'en' }
      const route = parseAppRoute('/en/blog/post', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should resolve [lang] in path segments to 'en'
      expect(params.path).toEqual(['blog', 'post'])
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should only process parallel routes, not children route', () => {
      // Tree: / -> children: /blog, sidebar: /[...path]
      const loaderTree = createLoaderTree(
        '',
        {
          sidebar: createLoaderTree('[...path]'),
        },
        createLoaderTree('blog')
      )
      const params: Params = {}
      const route = parseAppRoute('/blog/post', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should only process @sidebar, not children
      expect(params.path).toEqual(['blog', 'post'])
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })

  describe('interception routes', () => {
    it('should increment depth for (.) interception route (same level)', () => {
      // Tree: /(.)photo -> @modal/[...segments]
      // Interception routes should increment depth unlike route groups
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('(.)photo', {
          modal: createLoaderTree('[...segments]'),
        })
      )
      const params: Params = {}
      const route = parseAppRoute('/photo/123/details', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should get segments from depth 1 onwards (after /(.)photo)
      expect(params.segments).toEqual(['123', 'details'])
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should increment depth for (..) interception route (parent level)', () => {
      // Tree: /gallery/(..)photo -> @modal/[id]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'gallery',
          {},
          createLoaderTree('(..)photo', {
            modal: createLoaderTree('[id]'),
          })
        )
      )
      const params: Params = {}
      const route = parseAppRoute('/gallery/photo/123', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // (..)photo is at depth 1, @modal/[id] should extract from depth 2
      expect(params.id).toBe('123')
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should increment depth for (...) interception route (root level)', () => {
      // Tree: /app/gallery/(...)photo -> @modal/[...path]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'app',
          {},
          createLoaderTree(
            'gallery',
            {},
            createLoaderTree('(...)photo', {
              modal: createLoaderTree('[...path]'),
            })
          )
        )
      )
      const params: Params = {}
      const route = parseAppRoute('/app/gallery/photo/2023/album', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // (...)photo is at depth 2, @modal/[...path] should extract from depth 3
      expect(params.path).toEqual(['2023', 'album'])
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should increment depth for (..)(..) interception route (grandparent level)', () => {
      // Tree: /a/b/(..)(..)photo -> @modal/[category]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'a',
          {},
          createLoaderTree(
            'b',
            {},
            createLoaderTree('(..)(..)photo', {
              modal: createLoaderTree('[category]'),
            })
          )
        )
      )
      const params: Params = {}
      const route = parseAppRoute('/a/b/photo/nature', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // (..)(..)photo is at depth 2, @modal/[category] should extract from depth 3
      expect(params.category).toBe('nature')
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should distinguish interception routes from regular route groups', () => {
      // Tree: /(marketing) -> @sidebar/[...path] (route group)
      //   vs: /(.)photo -> @modal/[...path] (interception route)
      const routeGroupTree = createLoaderTree(
        '',
        {},
        createLoaderTree('(marketing)', {
          sidebar: createLoaderTree('[...path]'),
        })
      )

      const interceptionTree = createLoaderTree(
        '',
        {},
        createLoaderTree('(.)photo', {
          modal: createLoaderTree('[...path]'),
        })
      )

      const route = parseAppRoute('/photo/123', true)

      // Route group - should NOT increment depth
      const routeGroupParams: Params = {}
      const routeGroupFallback: FallbackRouteParam[] = []
      resolveRouteParamsFromTree(
        routeGroupTree,
        routeGroupParams,
        route,
        routeGroupFallback
      )
      // Gets all segments because route group doesn't increment depth
      expect(routeGroupParams.path).toEqual(['photo', '123'])

      // Interception route - SHOULD increment depth
      const interceptionParams: Params = {}
      const interceptionFallback: FallbackRouteParam[] = []
      resolveRouteParamsFromTree(
        interceptionTree,
        interceptionParams,
        route,
        interceptionFallback
      )
      // Gets segments from depth 1 because (.)photo increments depth
      expect(interceptionParams.path).toEqual(['123'])
    })
  })

  describe('empty pathname edge cases', () => {
    it('should mark dynamic param as fallback when pathname is empty', () => {
      // Tree: / -> @modal/[id]
      const loaderTree = createLoaderTree('', {
        modal: createLoaderTree('[id]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.id).toBeUndefined()
      expect(fallbackRouteParams).toHaveLength(1)
      expect(fallbackRouteParams[0]).toEqual({
        paramName: 'id',
        paramType: 'dynamic',
      })
    })

    it('should mark multiple dynamic params as fallback when pathname is empty', () => {
      // Tree: / -> @modal/[category] + @sidebar/[filter]
      const loaderTree = createLoaderTree('', {
        modal: createLoaderTree('[category]'),
        sidebar: createLoaderTree('[filter]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      expect(params.category).toBeUndefined()
      expect(params.filter).toBeUndefined()
      expect(fallbackRouteParams).toHaveLength(2)
      expect(fallbackRouteParams).toContainEqual({
        paramName: 'category',
        paramType: 'dynamic',
      })
      expect(fallbackRouteParams).toContainEqual({
        paramName: 'filter',
        paramType: 'dynamic',
      })
    })

    it('should handle nested parallel route with empty pathname at that depth', () => {
      // Tree: /blog -> @modal/[id]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('blog', {
          modal: createLoaderTree('[id]'),
        })
      )
      const params: Params = {}
      const route = parseAppRoute('/blog', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // No segment at depth 1, should mark as fallback
      expect(params.id).toBeUndefined()
      expect(fallbackRouteParams).toHaveLength(1)
      expect(fallbackRouteParams[0]).toEqual({
        paramName: 'id',
        paramType: 'dynamic',
      })
    })
  })

  describe('complex path segments', () => {
    it('should handle catch-all with embedded param placeholders in pathname', () => {
      // Tree: / -> @sidebar/[...path]
      // Pathname contains a placeholder like [category] which is unknown
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[...path]'),
      })
      const params: Params = {}
      const route = parseAppRoute('/blog/[category]/tech', true)
      const fallbackRouteParams: FallbackRouteParam[] = [
        { paramName: 'category', paramType: 'dynamic' },
      ]

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should mark as fallback because there's a non-parallel fallback param
      expect(params.path).toBeUndefined()
      expect(fallbackRouteParams).toHaveLength(2)
      expect(fallbackRouteParams[1]).toEqual({
        paramName: 'path',
        paramType: 'catchall',
      })
    })

    it('should mark catch-all as fallback when pathname has unknown param placeholder', () => {
      // Tree: /[lang] -> @sidebar/[...path]
      // Pathname has [lang] which is known, but [category] which is not
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[lang]', {
          sidebar: createLoaderTree('[...path]'),
        })
      )
      const params: Params = { lang: 'en' }
      const route = parseAppRoute('/en/blog/[category]', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should mark path as fallback because pathname contains unknown [category] placeholder
      expect(params.path).toBeUndefined()
      expect(fallbackRouteParams).toHaveLength(1)
      expect(fallbackRouteParams[0]).toEqual({
        paramName: 'path',
        paramType: 'catchall',
      })
    })

    it('should handle mixed static and dynamic segments in catch-all resolution', () => {
      // Tree: /products/[category] -> @filters/[...filterPath]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'products',
          {},
          createLoaderTree('[category]', {
            filters: createLoaderTree('[...filterPath]'),
          })
        )
      )
      const params: Params = { category: 'electronics' }
      const route = parseAppRoute(
        '/products/electronics/brand/apple/price/high',
        true
      )
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Should get remaining path after resolving category
      expect(params.filterPath).toEqual(['brand', 'apple', 'price', 'high'])
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })

  describe('integration scenarios', () => {
    it('should handle interception route + parallel route together', () => {
      // Tree: /gallery/(.)photo -> @modal/[id] + @sidebar/[category]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'gallery',
          {},
          createLoaderTree('(.)photo', {
            modal: createLoaderTree('[id]'),
            sidebar: createLoaderTree('[category]'),
          })
        )
      )
      const params: Params = {}
      const route = parseAppRoute('/gallery/photo/123', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Both should extract from depth 2 (after /gallery/(.)photo)
      expect(params.id).toBe('123')
      expect(params.category).toBe('123')
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should handle route group + parallel route + interception route', () => {
      // Tree: /(marketing)/gallery/(.)photo -> @modal/[...path]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '(marketing)',
          {},
          createLoaderTree(
            'gallery',
            {},
            createLoaderTree('(.)photo', {
              modal: createLoaderTree('[...path]'),
            })
          )
        )
      )
      const params: Params = {}
      const route = parseAppRoute('/gallery/photo/2023/album', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // Route group doesn't increment, gallery does, (.)photo does
      // So depth is 2, extract from depth 2 onwards
      expect(params.path).toEqual(['2023', 'album'])
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should handle all param types together', () => {
      // Tree: /[lang] -> @modal/[category] + @sidebar/[...tags] + @info/[[...extra]]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[lang]', {
          modal: createLoaderTree('[category]'),
          sidebar: createLoaderTree('[...tags]'),
          info: createLoaderTree('[[...extra]]'),
        })
      )
      const params: Params = { lang: 'en' }
      const route = parseAppRoute('/en/tech/react/nextjs', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // All should extract from depth 1 onwards
      expect(params.category).toBe('tech')
      expect(params.tags).toEqual(['tech', 'react', 'nextjs'])
      expect(params.extra).toEqual(['tech', 'react', 'nextjs'])
      expect(fallbackRouteParams).toHaveLength(0)
    })

    it('should handle complex nesting with multiple interception routes', () => {
      // Tree: /app/(.)modal/(.)photo -> @dialog/[id]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'app',
          {},
          createLoaderTree(
            '(.)modal',
            {},
            createLoaderTree('(.)photo', {
              dialog: createLoaderTree('[id]'),
            })
          )
        )
      )
      const params: Params = {}
      const route = parseAppRoute('/app/modal/photo/image-123', true)
      const fallbackRouteParams: FallbackRouteParam[] = []

      resolveRouteParamsFromTree(loaderTree, params, route, fallbackRouteParams)

      // app (depth 1) + (.)modal (depth 2) + (.)photo (depth 3) -> extract at depth 3
      expect(params.id).toBe('image-123')
      expect(fallbackRouteParams).toHaveLength(0)
    })
  })
})
