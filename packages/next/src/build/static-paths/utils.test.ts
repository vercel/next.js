import type { Params } from '../../server/request/params'
import { parseAppRoute } from '../../shared/lib/router/routes/app'
import type { FallbackRouteParam } from './types'
import {
  extractPathnameRouteParamSegmentsFromLoaderTree,
  resolveRouteParamsFromTree,
} from './utils'

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

      expect(params.optionalCatchall).toEqual([])
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

      expect(params.optionalPath).toEqual([])
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

describe('extractPathnameRouteParamSegmentsFromLoaderTree', () => {
  describe('Regular Routes (children segments)', () => {
    it('should extract single dynamic segment from children route', () => {
      // Tree: /[slug]
      const loaderTree = createLoaderTree('', {}, createLoaderTree('[slug]'))
      const route = parseAppRoute('/[slug]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[slug]', paramName: 'slug', paramType: 'dynamic' },
      ])
    })

    it('should extract multiple nested dynamic segments', () => {
      // Tree: /[category]/[slug]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[category]', {}, createLoaderTree('[slug]'))
      )
      const route = parseAppRoute('/[category]/[slug]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[category]', paramName: 'category', paramType: 'dynamic' },
        { name: '[slug]', paramName: 'slug', paramType: 'dynamic' },
      ])
    })

    it('should extract catchall segment', () => {
      // Tree: /[...slug]
      const loaderTree = createLoaderTree('', {}, createLoaderTree('[...slug]'))
      const route = parseAppRoute('/[...slug]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[...slug]', paramName: 'slug', paramType: 'catchall' },
      ])
    })

    it('should extract optional catchall segment', () => {
      // Tree: /[[...slug]]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[[...slug]]')
      )
      const route = parseAppRoute('/[[...slug]]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        {
          name: '[[...slug]]',
          paramName: 'slug',
          paramType: 'optional-catchall',
        },
      ])
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
      const route = parseAppRoute('/blog/[category]/posts/[slug]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[category]', paramName: 'category', paramType: 'dynamic' },
        { name: '[slug]', paramName: 'slug', paramType: 'dynamic' },
      ])
    })

    it('should handle route with no dynamic segments', () => {
      // Tree: /blog/posts
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('blog', {}, createLoaderTree('posts'))
      )
      const route = parseAppRoute('/blog/posts', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([])
    })

    it('should extract only segments matching the target pathname', () => {
      // Tree: /blog/[category] but target pathname is /[category]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('blog', {}, createLoaderTree('[category]'))
      )
      const route = parseAppRoute('/[category]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      // Should not match because depths don't align
      expect(result).toEqual([])
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
      const route = parseAppRoute('/blog/[slug]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[slug]', paramName: 'slug', paramType: 'dynamic' },
      ])
    })

    it('should ignore nested route groups', () => {
      // Tree: /(group1)/(group2)/[id]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '(group1)',
          {},
          createLoaderTree('(group2)', {}, createLoaderTree('[id]'))
        )
      )
      const route = parseAppRoute('/[id]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[id]', paramName: 'id', paramType: 'dynamic' },
      ])
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
      const route = parseAppRoute('/dashboard/[userId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[userId]', paramName: 'userId', paramType: 'dynamic' },
      ])
    })
  })

  describe('Parallel Routes', () => {
    it('should extract segment from parallel route matching pathname', () => {
      // Tree: / -> @modal/[id]
      const loaderTree = createLoaderTree('', {
        modal: createLoaderTree('[id]'),
      })
      const route = parseAppRoute('/[id]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[id]', paramName: 'id', paramType: 'dynamic' },
      ])
    })

    it('should extract segments from multiple parallel routes at same depth', () => {
      // Tree: / -> @modal/[id] + @sidebar/[category]
      const loaderTree = createLoaderTree('', {
        modal: createLoaderTree('[id]'),
        sidebar: createLoaderTree('[category]'),
      })
      const route = parseAppRoute('/[id]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      // Only [id] matches - [category] has different param name
      expect(result).toEqual([
        { name: '[id]', paramName: 'id', paramType: 'dynamic' },
      ])
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
      const route = parseAppRoute('/[lang]/[photoId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[lang]', paramName: 'lang', paramType: 'dynamic' },
        { name: '[photoId]', paramName: 'photoId', paramType: 'dynamic' },
      ])
    })

    it('should extract catchall from parallel route', () => {
      // Tree: / -> @sidebar/[...path]
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[...path]'),
      })
      const route = parseAppRoute('/[...path]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[...path]', paramName: 'path', paramType: 'catchall' },
      ])
    })

    it('should NOT extract parallel route segments that do not match pathname', () => {
      // Tree: /[id] -> @modal/[photoId] + @sidebar/[category]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[id]', {
          modal: createLoaderTree('[photoId]'),
          sidebar: createLoaderTree('[category]'),
        })
      )
      const route = parseAppRoute('/[id]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      // Only [id] should match, parallel routes are at depth 1
      expect(result).toEqual([
        { name: '[id]', paramName: 'id', paramType: 'dynamic' },
      ])
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
      const route = parseAppRoute('/(.)photo/[photoId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        {
          name: '[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic',
        },
      ])
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
      const route = parseAppRoute('/gallery/(..)photo/[photoId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        {
          name: '[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic',
        },
      ])
    })

    it('should extract segment from (...) root-level interception route', () => {
      // Tree: /app/gallery/(...)photo/[photoId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'app',
          {},
          createLoaderTree(
            'gallery',
            {},
            createLoaderTree('(...)photo', {}, createLoaderTree('[photoId]'))
          )
        )
      )
      const route = parseAppRoute('/app/gallery/(...)photo/[photoId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        {
          name: '[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic',
        },
      ])
    })

    it('should extract segment from (..)(..) grandparent-level interception route', () => {
      // Tree: /a/b/(..)(..)photo/[photoId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'a',
          {},
          createLoaderTree(
            'b',
            {},
            createLoaderTree('(..)(..)photo', {}, createLoaderTree('[photoId]'))
          )
        )
      )
      const route = parseAppRoute('/a/b/(..)(..)photo/[photoId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        {
          name: '[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic',
        },
      ])
    })

    it('should distinguish interception routes from route groups', () => {
      // Tree: /(marketing)/[slug] vs /(.)photo/[photoId]
      const routeGroupTree = createLoaderTree(
        '',
        {},
        createLoaderTree('(marketing)', {}, createLoaderTree('[slug]'))
      )
      const interceptionTree = createLoaderTree(
        '',
        {},
        createLoaderTree('(.)photo', {}, createLoaderTree('[photoId]'))
      )

      const routeGroupRoute = parseAppRoute('/[slug]', true)
      const interceptionRoute = parseAppRoute('/(.)photo/[photoId]', true)

      const routeGroupResult = extractPathnameRouteParamSegmentsFromLoaderTree(
        routeGroupTree,
        routeGroupRoute
      )
      const interceptionResult =
        extractPathnameRouteParamSegmentsFromLoaderTree(
          interceptionTree,
          interceptionRoute
        )

      // Route group ignored, slug at depth 0
      expect(routeGroupResult).toEqual([
        { name: '[slug]', paramName: 'slug', paramType: 'dynamic' },
      ])

      // Interception route counts, photoId at depth 1
      expect(interceptionResult).toEqual([
        {
          name: '[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic',
        },
      ])
    })

    it('should handle catchall in interception route', () => {
      // Tree: /(.)photo/[...segments]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('(.)photo', {}, createLoaderTree('[...segments]'))
      )
      const route = parseAppRoute('/(.)photo/[...segments]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        {
          name: '[...segments]',
          paramName: 'segments',
          paramType: 'catchall',
        },
      ])
    })

    it('should extract intercepted param when marker is part of the segment itself', () => {
      // Tree: /(.)[photoId] - the interception marker is PART OF the dynamic segment
      // This is the case where -intercepted- types apply (handled by getSegmentParam)
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('(.)[photoId]')
      )
      const route = parseAppRoute('/[photoId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        {
          name: '(.)[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic-intercepted-(.)', // NOW it has -intercepted- type
        },
      ])
    })
  })

  describe('Interception Routes in Parallel Routes', () => {
    it('should extract segment from interception route in parallel slot', () => {
      // Tree: @modal/(.)photo/[photoId]
      const loaderTree = createLoaderTree('', {
        modal: createLoaderTree('(.)photo', {}, createLoaderTree('[photoId]')),
      })
      const route = parseAppRoute('/(.)photo/[photoId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        {
          name: '[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic',
        },
      ])
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
      const route = parseAppRoute('/[id]/(.)photo/[photoId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[id]', paramName: 'id', paramType: 'dynamic' },
        {
          name: '[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic',
        },
      ])
    })

    it('should extract from multiple parallel routes with interception', () => {
      // Tree: /[category] -> @modal/(.)photo/[photoId] + @sidebar/(.)filter/[filterId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[category]', {
          modal: createLoaderTree(
            '(.)photo',
            {},
            createLoaderTree('[photoId]')
          ),
          sidebar: createLoaderTree(
            '(.)filter',
            {},
            createLoaderTree('[filterId]')
          ),
        })
      )
      const route = parseAppRoute('/[category]/(.)photo/[photoId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[category]', paramName: 'category', paramType: 'dynamic' },
        {
          name: '[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic',
        },
      ])
    })

    it('should handle (..) interception in parallel route with nested structure', () => {
      // Tree: /gallery/[id] -> @modal/(..)photo/[photoId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'gallery',
          {},
          createLoaderTree('[id]', {
            modal: createLoaderTree(
              '(..)photo',
              {},
              createLoaderTree('[photoId]')
            ),
          })
        )
      )
      const route = parseAppRoute('/gallery/[id]/(..)photo/[photoId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[id]', paramName: 'id', paramType: 'dynamic' },
        {
          name: '[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic',
        },
      ])
    })

    it('should handle (...) root-level interception in parallel route', () => {
      // Tree: /app/gallery/[id] -> @modal/(...)photo/[photoId]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'app',
          {},
          createLoaderTree(
            'gallery',
            {},
            createLoaderTree('[id]', {
              modal: createLoaderTree(
                '(...)photo',
                {},
                createLoaderTree('[photoId]')
              ),
            })
          )
        )
      )
      const route = parseAppRoute(
        '/app/gallery/[id]/(...)photo/[photoId]',
        true
      )
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[id]', paramName: 'id', paramType: 'dynamic' },
        {
          name: '[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic',
        },
      ])
    })

    it('should handle catchall in intercepting parallel route', () => {
      // Tree: /[id] -> @modal/(.)details/[...segments]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[id]', {
          modal: createLoaderTree(
            '(.)details',
            {},
            createLoaderTree('[...segments]')
          ),
        })
      )
      const route = parseAppRoute('/[id]/(.)details/[...segments]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[id]', paramName: 'id', paramType: 'dynamic' },
        {
          name: '[...segments]',
          paramName: 'segments',
          paramType: 'catchall',
        },
      ])
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
      const route = parseAppRoute('/[lang]/(.)photo/[photoId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[lang]', paramName: 'lang', paramType: 'dynamic' },
        {
          name: '[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic',
        },
      ])
    })

    it('should handle deeply nested parallel routes with interception', () => {
      // Tree: /[lang]/blog/[category] -> @modal/(.)post/[slug]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '[lang]',
          {},
          createLoaderTree(
            'blog',
            {},
            createLoaderTree('[category]', {
              modal: createLoaderTree(
                '(.)post',
                {},
                createLoaderTree('[slug]')
              ),
            })
          )
        )
      )
      const route = parseAppRoute(
        '/[lang]/blog/[category]/(.)post/[slug]',
        true
      )
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[lang]', paramName: 'lang', paramType: 'dynamic' },
        { name: '[category]', paramName: 'category', paramType: 'dynamic' },
        {
          name: '[slug]',
          paramName: 'slug',
          paramType: 'dynamic',
        },
      ])
    })

    it('should handle multiple interception routes at different levels', () => {
      // Tree: /[id] -> @modal1/(.)a/[a] + @modal2/(..)b/[b]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[id]', {
          modal1: createLoaderTree('(.)a', {}, createLoaderTree('[a]')),
          modal2: createLoaderTree('(..)b', {}, createLoaderTree('[b]')),
        })
      )
      const route = parseAppRoute('/[id]/(.)a/[a]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[id]', paramName: 'id', paramType: 'dynamic' },
        {
          name: '[a]',
          paramName: 'a',
          paramType: 'dynamic',
        },
      ])
    })

    it('should extract from actual Next.js photo gallery pattern', () => {
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
      const route = parseAppRoute('/photos/[id]/(.)photo/[photoId]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[id]', paramName: 'id', paramType: 'dynamic' },
        {
          name: '[photoId]',
          paramName: 'photoId',
          paramType: 'dynamic',
        },
      ])
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
      const route = parseAppRoute(
        '/[locale]/products/[category]/(.)product/[productId]',
        true
      )
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[locale]', paramName: 'locale', paramType: 'dynamic' },
        { name: '[category]', paramName: 'category', paramType: 'dynamic' },
        {
          name: '[productId]',
          paramName: 'productId',
          paramType: 'dynamic',
        },
      ])
    })
  })

  describe('Edge Cases', () => {
    it('should return empty array for pathname with no dynamic segments', () => {
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('blog', {}, createLoaderTree('posts'))
      )
      const route = parseAppRoute('/blog/posts', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([])
    })

    it('should return empty array when no segments match pathname', () => {
      // Tree has dynamic segments but they don't match the pathname structure
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('api', {}, createLoaderTree('[version]'))
      )
      const route = parseAppRoute('/different/path', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([])
    })

    it('should handle empty segment in tree', () => {
      // Tree: '' -> [id]
      const loaderTree = createLoaderTree('', {}, createLoaderTree('[id]'))
      const route = parseAppRoute('/[id]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[id]', paramName: 'id', paramType: 'dynamic' },
      ])
    })

    it('should match segments by depth and param name', () => {
      // Tree: /[lang]/blog/[slug] but pathname is /[lang]/[slug]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '[lang]',
          {},
          createLoaderTree('blog', {}, createLoaderTree('[slug]'))
        )
      )
      const route = parseAppRoute('/[lang]/[slug]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      // Should match [lang] at depth 0 but not [slug] (wrong depth)
      expect(result).toEqual([
        { name: '[lang]', paramName: 'lang', paramType: 'dynamic' },
      ])
    })

    it('should handle optional catchall in parallel route', () => {
      // Tree: @sidebar/[[...optional]]
      const loaderTree = createLoaderTree('', {
        sidebar: createLoaderTree('[[...optional]]'),
      })
      const route = parseAppRoute('/[[...optional]]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        {
          name: '[[...optional]]',
          paramName: 'optional',
          paramType: 'optional-catchall',
        },
      ])
    })

    it('should handle multiple route groups in sequence', () => {
      // Tree: /(a)/(b)/(c)/[id]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          '(a)',
          {},
          createLoaderTree(
            '(b)',
            {},
            createLoaderTree('(c)', {}, createLoaderTree('[id]'))
          )
        )
      )
      const route = parseAppRoute('/[id]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[id]', paramName: 'id', paramType: 'dynamic' },
      ])
    })
  })

  describe('Static Segment Matching', () => {
    it('should not extract segments when static segments do not match', () => {
      // Tree: /blog/[slug] but pathname is /news/[slug]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('blog', {}, createLoaderTree('[slug]'))
      )
      const route = parseAppRoute('/news/[slug]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([])
    })

    it('should match when static segments align correctly', () => {
      // Tree: /api/v1/[endpoint] -> /api/v1/[endpoint]
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree(
          'api',
          {},
          createLoaderTree('v1', {}, createLoaderTree('[endpoint]'))
        )
      )
      const route = parseAppRoute('/api/v1/[endpoint]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([
        { name: '[endpoint]', paramName: 'endpoint', paramType: 'dynamic' },
      ])
    })

    it('should handle segments with values already present in the page', () => {
      // Tree: /blog/[slug] but pathname is /blog/my-slug
      const loaderTree = createLoaderTree(
        '',
        {
          sidebar: createLoaderTree('[[...catchAll]]'),
        },
        createLoaderTree('blog', {}, createLoaderTree('[slug]'))
      )
      const route = parseAppRoute('/blog/my-slug', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      expect(result).toEqual([])
    })
  })

  describe('Prefix Validation with Type Mismatch', () => {
    it('should NOT extract param when prefix has type mismatch (static vs dynamic)', () => {
      // Tree: /(.)photo -> @modal/[id]
      // Route: /[category]/[id]
      //
      // When checking @modal/[id] at depth 1:
      //   currentPath = [(.)photo] (STATIC segment)
      //   route.segments[0] = [category] (DYNAMIC segment)
      //   route.segments[1] = [id] (DYNAMIC segment)
      //
      // The [id] param matches at depth 1, BUT the prefix validation should fail
      // because (.)photo (static) doesn't match [category] (dynamic) at depth 0
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('(.)photo', {
          modal: createLoaderTree('[id]'),
        })
      )
      const route = parseAppRoute('/[category]/[id]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      // Should return empty array - [id] should NOT be extracted
      // Without the type check, validatePrefixMatch would incorrectly return true
      // because neither the static nor dynamic comparison would trigger
      expect(result).toEqual([])
    })

    it('should NOT extract param when prefix has type mismatch (dynamic vs static)', () => {
      // Tree: /[lang] -> @modal/[id]
      // Route: /photo/[id]
      //
      // When checking @modal/[id] at depth 1:
      //   currentPath = [lang] (DYNAMIC segment)
      //   route.segments[0] = photo (STATIC segment)
      //   route.segments[1] = [id] (DYNAMIC segment)
      //
      // The [id] param matches at depth 1, BUT the prefix validation should fail
      // because [lang] (dynamic) doesn't match photo (static) at depth 0
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('[lang]', {
          modal: createLoaderTree('[id]'),
        })
      )
      const route = parseAppRoute('/photo/[id]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      // Should return empty array - [id] should NOT be extracted
      // Without the type check, validatePrefixMatch would incorrectly return true
      expect(result).toEqual([])
    })

    it('should extract param when prefix types match correctly', () => {
      // Tree: /blog -> @modal/(.)photo/[id]
      // Route: /blog/(.)photo/[id]
      //
      // When checking @modal/(.)photo/[id]:
      //   currentPath at depth 1 = (.)photo (STATIC segment)
      //   route.segments at depth 1 = (.)photo (STATIC segment)
      //
      // Types match AND names match, so [id] should be extracted
      const loaderTree = createLoaderTree(
        '',
        {},
        createLoaderTree('blog', {
          modal: createLoaderTree('(.)photo', {}, createLoaderTree('[id]')),
        })
      )
      const route = parseAppRoute('/blog/(.)photo/[id]', true)
      const result = extractPathnameRouteParamSegmentsFromLoaderTree(
        loaderTree,
        route
      )

      // Should extract [id] because prefix validation succeeds
      expect(result).toEqual([
        {
          name: '[id]',
          paramName: 'id',
          paramType: 'dynamic',
        },
      ])
    })
  })
})
