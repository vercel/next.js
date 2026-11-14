import {
  getDynamicParam,
  interpolateParallelRouteParams,
} from './get-dynamic-param'
import type { Params } from '../../../../server/request/params'
import { InvariantError } from '../../invariant-error'
import { createMockOpaqueFallbackRouteParams } from '../../../../server/app-render/postponed-state.test'

describe('getDynamicParam', () => {
  describe('basic dynamic parameters (d, di)', () => {
    it('should handle simple string parameter', () => {
      const params: Params = { slug: 'hello-world' }
      const result = getDynamicParam(params, 'slug', 'd', null, null)

      expect(result).toEqual({
        param: 'slug',
        value: 'hello-world',
        type: 'd',
        treeSegment: ['slug', 'hello-world', 'd', null],
      })
    })

    it('should encode special characters in string parameters', () => {
      const params: Params = { slug: 'hello world & stuff' }
      const result = getDynamicParam(params, 'slug', 'd', null, null)

      expect(result).toEqual({
        param: 'slug',
        value: 'hello%20world%20%26%20stuff',
        type: 'd',
        treeSegment: ['slug', 'hello%20world%20%26%20stuff', 'd', null],
      })
    })

    it('should handle unicode characters', () => {
      const params: Params = { slug: 'caf�-na�ve' }
      const result = getDynamicParam(params, 'slug', 'd', null, null)

      expect(result).toEqual({
        param: 'slug',
        value: 'caf%EF%BF%BD-na%EF%BF%BDve',
        type: 'd',
        treeSegment: ['slug', 'caf%EF%BF%BD-na%EF%BF%BDve', 'd', null],
      })
    })

    it('should throw InvariantError for missing dynamic parameter', () => {
      const params: Params = {}

      expect(() => {
        getDynamicParam(params, 'slug', 'd', null, null)
      }).toThrow(InvariantError)
      expect(() => {
        getDynamicParam(params, 'slug', 'd', null, null)
      }).toThrow(
        `Invariant: Missing value for segment key: "slug" with dynamic param type: d. This is a bug in Next.js.`
      )
    })

    it('should throw InvariantError for dynamic intercepted parameter without value', () => {
      const params: Params = {}

      expect(() => {
        getDynamicParam(params, 'slug', 'di(..)(..)', null, null)
      }).toThrow(InvariantError)
      expect(() => {
        getDynamicParam(params, 'slug', 'di(..)(..)', null, null)
      }).toThrow(
        'Invariant: Missing value for segment key: "slug" with dynamic param type: di(..)(..). This is a bug in Next.js.'
      )
    })
  })

  describe('catchall parameters (c, ci)', () => {
    it('should handle array of values for catchall', () => {
      const params: Params = { slug: ['docs', 'getting-started'] }
      const result = getDynamicParam(params, 'slug', 'c', null, null)

      expect(result).toEqual({
        param: 'slug',
        value: ['docs', 'getting-started'],
        type: 'c',
        treeSegment: ['slug', 'docs/getting-started', 'c', null],
      })
    })

    it('should encode array values for catchall', () => {
      const params: Params = { slug: ['docs & guides', 'getting started'] }
      const result = getDynamicParam(params, 'slug', 'c', null, null)

      expect(result).toEqual({
        param: 'slug',
        value: ['docs%20%26%20guides', 'getting%20started'],
        type: 'c',
        treeSegment: [
          'slug',
          'docs%20%26%20guides/getting%20started',
          'c',
          null,
        ],
      })
    })

    it('should handle single string value for catchall', () => {
      const params: Params = { slug: 'single-page' }
      const result = getDynamicParam(params, 'slug', 'c', null, null)

      expect(result).toEqual({
        param: 'slug',
        value: 'single-page',
        type: 'c',
        treeSegment: ['slug', 'single-page', 'c', null],
      })
    })

    it('should handle catchall intercepted (ci) with array values', () => {
      const params: Params = { path: ['photo', '123'] }
      const result = getDynamicParam(params, 'path', 'ci(..)(..)', null, null)

      expect(result).toEqual({
        param: 'path',
        value: ['photo', '123'],
        type: 'ci(..)(..)',
        treeSegment: ['path', 'photo/123', 'ci(..)(..)', null],
      })
    })

    it('should handle parallel routes with fallback params for catchall', () => {
      const params: Params = { category: 'electronics' }
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        slug: '%%drp:slug:parallel123%%',
      })
      const result = getDynamicParam(params, 'slug', 'd', fallbackParams, null)

      expect(result).toEqual({
        param: 'slug',
        value: '%%drp:slug:parallel123%%',
        type: 'd',
        treeSegment: ['slug', '%%drp:slug:parallel123%%', 'd', null],
      })
    })
  })

  describe('optional catchall parameters (oc)', () => {
    it('should handle array of values for optional catchall', () => {
      const params: Params = { slug: ['api', 'users', 'create'] }
      const result = getDynamicParam(params, 'slug', 'oc', null, null)

      expect(result).toEqual({
        param: 'slug',
        value: ['api', 'users', 'create'],
        type: 'oc',
        treeSegment: ['slug', 'api/users/create', 'oc', null],
      })
    })

    it('should return null value for optional catchall without value', () => {
      const params: Params = {}
      const result = getDynamicParam(params, 'slug', 'oc', null, null)

      expect(result).toEqual({
        param: 'slug',
        value: null,
        type: 'oc',
        treeSegment: ['slug', '', 'oc', null],
      })
    })

    it('should encode array values for optional catchall', () => {
      const params: Params = { slug: ['hello world', 'caf�'] }
      const result = getDynamicParam(params, 'slug', 'oc', null, null)

      expect(result).toEqual({
        param: 'slug',
        value: ['hello%20world', 'caf%EF%BF%BD'],
        type: 'oc',
        treeSegment: ['slug', 'hello%20world/caf%EF%BF%BD', 'oc', null],
      })
    })

    it('should handle single string value for optional catchall', () => {
      const params: Params = { slug: 'documentation' }
      const result = getDynamicParam(params, 'slug', 'oc', null, null)

      expect(result).toEqual({
        param: 'slug',
        value: 'documentation',
        type: 'oc',
        treeSegment: ['slug', 'documentation', 'oc', null],
      })
    })
  })

  describe('fallback route parameters', () => {
    it('should use fallback param value when available', () => {
      const params: Params = { slug: 'original-value' }
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        slug: '%%drp:slug:abc123%%',
      })

      const result = getDynamicParam(params, 'slug', 'd', fallbackParams, null)

      expect(result).toEqual({
        param: 'slug',
        value: '%%drp:slug:abc123%%',
        type: 'd',
        treeSegment: ['slug', '%%drp:slug:abc123%%', 'd', null],
      })
    })

    it('should not encode fallback param values', () => {
      const params: Params = { slug: 'hello world' }
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        slug: '%%drp:slug:xyz789%%',
      })

      const result = getDynamicParam(params, 'slug', 'd', fallbackParams, null)

      expect(result.value).toBe('%%drp:slug:xyz789%%')
    })

    it('should use fallback params with catchall routes', () => {
      const params: Params = { slug: ['docs', 'api'] }
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        slug: '%%drp:slug:def456%%',
      })

      const result = getDynamicParam(params, 'slug', 'c', fallbackParams, null)

      expect(result).toEqual({
        param: 'slug',
        value: '%%drp:slug:def456%%',
        type: 'c',
        treeSegment: ['slug', '%%drp:slug:def456%%', 'c', null],
      })
    })

    it('should use fallback params with optional catchall routes', () => {
      const params: Params = {}
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        slug: '%%drp:slug:ghi789%%',
      })

      const result = getDynamicParam(params, 'slug', 'oc', fallbackParams, null)

      expect(result).toEqual({
        param: 'slug',
        value: '%%drp:slug:ghi789%%',
        type: 'oc',
        treeSegment: ['slug', '%%drp:slug:ghi789%%', 'oc', null],
      })
    })

    it('should fall back to regular encoding when param not in fallback', () => {
      const params: Params = { slug: 'hello world' }
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        other: '%%drp:other:abc123%%',
      })

      const result = getDynamicParam(params, 'slug', 'd', fallbackParams, null)

      expect(result.value).toBe('hello%20world')
    })
  })

  describe('edge cases', () => {
    it('should throw InvariantError for empty string values', () => {
      const params: Params = { slug: '' }

      expect(() => {
        getDynamicParam(params, 'slug', 'd', null, null)
      }).toThrow(InvariantError)
      expect(() => {
        getDynamicParam(params, 'slug', 'd', null, null)
      }).toThrow(
        `Invariant: Missing value for segment key: "slug" with dynamic param type: d. This is a bug in Next.js.`
      )
    })

    it('should handle undefined param values', () => {
      const params: Params = { slug: undefined }

      expect(() => {
        getDynamicParam(params, 'slug', 'd', null, null)
      }).toThrow(InvariantError)
    })
  })
})

// Helper to create LoaderTree structures for testing
type TestLoaderTree = [
  segment: string,
  parallelRoutes: { [key: string]: TestLoaderTree },
  modules: Record<string, unknown>,
  staticSiblings: readonly string[] | null,
]

function createLoaderTree(
  segment: string,
  parallelRoutes: { [key: string]: TestLoaderTree } = {},
  children?: TestLoaderTree
): TestLoaderTree {
  const routes = children ? { ...parallelRoutes, children } : parallelRoutes
  return [segment, routes, {}, null]
}

describe('interpolateParallelRouteParams', () => {
  it('should interpolate parallel route params', () => {
    const loaderTree = createLoaderTree(
      '',
      {},
      createLoaderTree(
        'optional-catch-all',
        {
          modal: createLoaderTree('[[...catchAll]]'),
        },
        createLoaderTree('[[...path]]')
      )
    )

    expect(
      interpolateParallelRouteParams(
        loaderTree,
        { path: ['foo', 'bar'] },
        '/optional-catch-all/[[...path]]',
        null
      )
    ).toEqual({ path: ['foo', 'bar'], catchAll: ['foo', 'bar'] })
  })
})
