import {
  getDynamicParam,
  parseParameter,
  parseMatchedParameter,
} from './get-dynamic-param'
import type { Params } from '../../../../server/request/params'
import { InvariantError } from '../../invariant-error'
import { createMockOpaqueFallbackRouteParams } from '../../../../server/app-render/postponed-state.test'

describe('getDynamicParam', () => {
  describe('basic dynamic parameters (d, di)', () => {
    it('should handle simple string parameter', () => {
      const params: Params = { slug: 'hello-world' }
      const result = getDynamicParam(params, 'slug', 'd', '/blog/[slug]', null)

      expect(result).toEqual({
        param: 'slug',
        value: 'hello-world',
        type: 'd',
        treeSegment: ['slug', 'hello-world', 'd'],
      })
    })

    it('should encode special characters in string parameters', () => {
      const params: Params = { slug: 'hello world & stuff' }
      const result = getDynamicParam(params, 'slug', 'd', '/blog/[slug]', null)

      expect(result).toEqual({
        param: 'slug',
        value: 'hello%20world%20%26%20stuff',
        type: 'd',
        treeSegment: ['slug', 'hello%20world%20%26%20stuff', 'd'],
      })
    })

    it('should handle unicode characters', () => {
      const params: Params = { slug: 'caf�-na�ve' }
      const result = getDynamicParam(params, 'slug', 'd', '/blog/[slug]', null)

      expect(result).toEqual({
        param: 'slug',
        value: 'caf%EF%BF%BD-na%EF%BF%BDve',
        type: 'd',
        treeSegment: ['slug', 'caf%EF%BF%BD-na%EF%BF%BDve', 'd'],
      })
    })

    it('should throw InvariantError for missing dynamic parameter', () => {
      const params: Params = {}

      expect(() => {
        getDynamicParam(params, 'slug', 'd', '/blog/[slug]', null)
      }).toThrow(InvariantError)
      expect(() => {
        getDynamicParam(params, 'slug', 'd', '/blog/[slug]', null)
      }).toThrow('Unexpected dynamic param type: d')
    })

    it('should throw InvariantError for dynamic intercepted parameter without value', () => {
      const params: Params = {}

      expect(() => {
        getDynamicParam(params, 'slug', 'di', '/blog/[slug]', null)
      }).toThrow(InvariantError)
      expect(() => {
        getDynamicParam(params, 'slug', 'di', '/blog/[slug]', null)
      }).toThrow('Unexpected dynamic param type: di')
    })
  })

  describe('catchall parameters (c, ci)', () => {
    it('should handle array of values for catchall', () => {
      const params: Params = { slug: ['docs', 'getting-started'] }
      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/docs/[...slug]',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: ['docs', 'getting-started'],
        type: 'c',
        treeSegment: ['slug', 'docs/getting-started', 'c'],
      })
    })

    it('should encode array values for catchall', () => {
      const params: Params = { slug: ['docs & guides', 'getting started'] }
      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/docs/[...slug]',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: ['docs%20%26%20guides', 'getting%20started'],
        type: 'c',
        treeSegment: ['slug', 'docs%20%26%20guides/getting%20started', 'c'],
      })
    })

    it('should handle single string value for catchall', () => {
      const params: Params = { slug: 'single-page' }
      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/docs/[...slug]',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: 'single-page',
        type: 'c',
        treeSegment: ['slug', 'single-page', 'c'],
      })
    })

    it('should use pagePath fallback when catchall has no value', () => {
      const params: Params = {}
      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/dashboard/analytics/reports',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: ['dashboard', 'analytics', 'reports'],
        type: 'c',
        treeSegment: ['slug', 'dashboard/analytics/reports', 'c'],
      })
    })

    it('should handle catchall intercepted (ci) with array values', () => {
      const params: Params = { path: ['photo', '123'] }
      const result = getDynamicParam(
        params,
        'path',
        'ci',
        '/(.)photo/[...path]',
        null
      )

      expect(result).toEqual({
        param: 'path',
        value: ['photo', '123'],
        type: 'ci',
        treeSegment: ['path', 'photo/123', 'ci'],
      })
    })

    it('should parse pagePath with dynamic segments for catchall fallback', () => {
      const params: Params = { category: 'electronics' }
      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/shop/[category]/products',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: ['shop', 'electronics', 'products'],
        type: 'c',
        treeSegment: ['slug', 'shop/electronics/products', 'c'],
      })
    })

    it('should handle pagePath with parallel routes for catchall', () => {
      const params: Params = { category: 'books' }
      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/shop/[category]/@modal/product-details',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: ['shop', 'books', '@modal', 'product-details'],
        type: 'c',
        treeSegment: ['slug', 'shop/books/@modal/product-details', 'c'],
      })
    })

    it('should handle pagePath with multiple parallel routes for catchall', () => {
      const params: Params = {
        category: 'electronics',
        brand: 'apple',
      }
      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/shop/[category]/[brand]/@sidebar/@modal/details',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: [
          'shop',
          'electronics',
          'apple',
          '@sidebar',
          '@modal',
          'details',
        ],
        type: 'c',
        treeSegment: [
          'slug',
          'shop/electronics/apple/@sidebar/@modal/details',
          'c',
        ],
      })
    })

    it('should handle pagePath with parallel routes and static segments for optional catchall when param missing', () => {
      const params: Params = { userId: '123' }
      const result = getDynamicParam(
        params,
        'path',
        'oc',
        '/dashboard/[userId]/@analytics/reports/monthly',
        null
      )

      expect(result).toEqual({
        param: 'path',
        value: null,
        type: 'oc',
        treeSegment: ['path', '', 'oc'],
      })
    })

    it('should handle parallel routes with fallback params for catchall', () => {
      const params: Params = { category: 'electronics' }
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        slug: ['%%drp:slug:parallel123%%', 'd'],
      })
      const result = getDynamicParam(
        params,
        'slug',
        'd',
        '/shop/[category]/@modal/@sidebar/product',
        fallbackParams
      )

      expect(result).toEqual({
        param: 'slug',
        value: '%%drp:slug:parallel123%%',
        type: 'd',
        treeSegment: ['slug', '%%drp:slug:parallel123%%', 'd'],
      })
    })

    it('should handle parallel routes with catchall parameters in the parallel segment', () => {
      const params: Params = {
        category: 'books',
        modalPath: ['details', 'reviews', 'summary'],
      }
      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/shop/[category]/@modal/[...modalPath]/content',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: [
          'shop',
          'books',
          '@modal',
          'details',
          'reviews',
          'summary',
          'content',
        ],
        type: 'c',
        treeSegment: [
          'slug',
          'shop/books/@modal/details/reviews/summary/content',
          'c',
        ],
      })
    })

    it('should handle parallel routes with optional catchall in parallel segment', () => {
      const params: Params = {
        userId: '456',
        tabPath: ['settings', 'profile'],
      }
      const result = getDynamicParam(
        params,
        'content',
        'c',
        '/dashboard/[userId]/@tabs/[[...tabPath]]/layout',
        null
      )

      expect(result).toEqual({
        param: 'content',
        value: ['dashboard', '456', '@tabs', 'settings', 'profile', 'layout'],
        type: 'c',
        treeSegment: [
          'content',
          'dashboard/456/@tabs/settings/profile/layout',
          'c',
        ],
      })
    })

    it('should handle multiple parallel routes each with catchall segments', () => {
      const params: Params = {
        category: 'electronics',
        modalPath: ['photo', 'gallery'],
        sidebarPath: ['filters', 'brands'],
      }
      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/shop/[category]/@modal/[...modalPath]/@sidebar/[...sidebarPath]/page',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: [
          'shop',
          'electronics',
          '@modal',
          'photo',
          'gallery',
          '@sidebar',
          'filters',
          'brands',
          'page',
        ],
        type: 'c',
        treeSegment: [
          'slug',
          'shop/electronics/@modal/photo/gallery/@sidebar/filters/brands/page',
          'c',
        ],
      })
    })

    it('should handle parallel routes with missing catchall in parallel segment', () => {
      const params: Params = {
        category: 'electronics',
        // modalPath is missing
      }
      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/shop/[category]/@modal/[...modalPath]/content',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: ['shop', 'electronics', '@modal', 'modalPath', 'content'],
        type: 'c',
        treeSegment: ['slug', 'shop/electronics/@modal/modalPath/content', 'c'],
      })
    })
  })

  describe('optional catchall parameters (oc)', () => {
    it('should handle array of values for optional catchall', () => {
      const params: Params = { slug: ['api', 'users', 'create'] }
      const result = getDynamicParam(
        params,
        'slug',
        'oc',
        '/api/[[...slug]]',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: ['api', 'users', 'create'],
        type: 'oc',
        treeSegment: ['slug', 'api/users/create', 'oc'],
      })
    })

    it('should return null value for optional catchall without value', () => {
      const params: Params = {}
      const result = getDynamicParam(
        params,
        'slug',
        'oc',
        '/api/[[...slug]]',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: null,
        type: 'oc',
        treeSegment: ['slug', '', 'oc'],
      })
    })

    it('should encode array values for optional catchall', () => {
      const params: Params = { slug: ['hello world', 'caf�'] }
      const result = getDynamicParam(
        params,
        'slug',
        'oc',
        '/api/[[...slug]]',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: ['hello%20world', 'caf%EF%BF%BD'],
        type: 'oc',
        treeSegment: ['slug', 'hello%20world/caf%EF%BF%BD', 'oc'],
      })
    })

    it('should handle single string value for optional catchall', () => {
      const params: Params = { slug: 'documentation' }
      const result = getDynamicParam(
        params,
        'slug',
        'oc',
        '/docs/[[...slug]]',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: 'documentation',
        type: 'oc',
        treeSegment: ['slug', 'documentation', 'oc'],
      })
    })
  })

  describe('fallback route parameters', () => {
    it('should use fallback param value when available', () => {
      const params: Params = { slug: 'original-value' }
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        slug: ['%%drp:slug:abc123%%', 'd'],
      })

      const result = getDynamicParam(
        params,
        'slug',
        'd',
        '/blog/[slug]',
        fallbackParams
      )

      expect(result).toEqual({
        param: 'slug',
        value: '%%drp:slug:abc123%%',
        type: 'd',
        treeSegment: ['slug', '%%drp:slug:abc123%%', 'd'],
      })
    })

    it('should not encode fallback param values', () => {
      const params: Params = { slug: 'hello world' }
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        slug: ['%%drp:slug:xyz789%%', 'd'],
      })

      const result = getDynamicParam(
        params,
        'slug',
        'd',
        '/blog/[slug]',
        fallbackParams
      )

      expect(result.value).toBe('%%drp:slug:xyz789%%')
    })

    it('should use fallback params with catchall routes', () => {
      const params: Params = { slug: ['docs', 'api'] }
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        slug: ['%%drp:slug:def456%%', 'c'],
      })

      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/docs/[...slug]',
        fallbackParams
      )

      expect(result).toEqual({
        param: 'slug',
        value: '%%drp:slug:def456%%',
        type: 'c',
        treeSegment: ['slug', '%%drp:slug:def456%%', 'c'],
      })
    })

    it('should use fallback params with optional catchall routes', () => {
      const params: Params = {}
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        slug: ['%%drp:slug:ghi789%%', 'oc'],
      })

      const result = getDynamicParam(
        params,
        'slug',
        'oc',
        '/api/[[...slug]]',
        fallbackParams
      )

      expect(result).toEqual({
        param: 'slug',
        value: '%%drp:slug:ghi789%%',
        type: 'oc',
        treeSegment: ['slug', '%%drp:slug:ghi789%%', 'oc'],
      })
    })

    it('should fall back to regular encoding when param not in fallback', () => {
      const params: Params = { slug: 'hello world' }
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        other: ['%%drp:other:abc123%%', 'd'],
      })

      const result = getDynamicParam(
        params,
        'slug',
        'd',
        '/blog/[slug]',
        fallbackParams
      )

      expect(result.value).toBe('hello%20world')
    })
  })

  describe('edge cases', () => {
    it('should throw InvariantError for empty string values', () => {
      const params: Params = { slug: '' }

      expect(() => {
        getDynamicParam(params, 'slug', 'd', '/blog/[slug]', null)
      }).toThrow(InvariantError)
      expect(() => {
        getDynamicParam(params, 'slug', 'd', '/blog/[slug]', null)
      }).toThrow('Unexpected dynamic param type: d')
    })

    it('should handle empty array for catchall', () => {
      const params: Params = { slug: [] }
      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/docs/guide/tutorial',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: [],
        type: 'c',
        treeSegment: ['slug', '', 'c'],
      })
    })

    it('should handle complex pagePath parsing for catchall', () => {
      const params: Params = {
        category: 'electronics',
        brand: 'apple',
      }
      const result = getDynamicParam(
        params,
        'slug',
        'c',
        '/shop/[category]/[brand]/products/featured',
        null
      )

      expect(result).toEqual({
        param: 'slug',
        value: ['shop', 'electronics', 'apple', 'products', 'featured'],
        type: 'c',
        treeSegment: ['slug', 'shop/electronics/apple/products/featured', 'c'],
      })
    })

    it('should handle root path for catchall without value', () => {
      const params: Params = {}
      const result = getDynamicParam(params, 'slug', 'c', '/', null)

      expect(result).toEqual({
        param: 'slug',
        value: [''],
        type: 'c',
        treeSegment: ['slug', '', 'c'],
      })
    })

    it('should handle undefined param values', () => {
      const params: Params = { slug: undefined }

      expect(() => {
        getDynamicParam(params, 'slug', 'd', '/blog/[slug]', null)
      }).toThrow(InvariantError)
    })
  })
})

describe('parseParameter', () => {
  it('should parse simple dynamic parameter', () => {
    expect(parseParameter('[slug]')).toEqual({
      key: 'slug',
      repeat: false,
      optional: false,
    })
  })

  it('should parse optional parameter', () => {
    expect(parseParameter('[[slug]]')).toEqual({
      key: 'slug',
      repeat: false,
      optional: true,
    })
  })

  it('should parse catchall parameter', () => {
    expect(parseParameter('[...slug]')).toEqual({
      key: 'slug',
      repeat: true,
      optional: false,
    })
  })

  it('should parse optional catchall parameter', () => {
    expect(parseParameter('[[...slug]]')).toEqual({
      key: 'slug',
      repeat: true,
      optional: true,
    })
  })

  it('should parse static segment as non-optional, non-repeat', () => {
    expect(parseParameter('static-page')).toEqual({
      key: 'static-page',
      repeat: false,
      optional: false,
    })
  })

  it('should handle complex parameter names', () => {
    expect(parseParameter('[product-id]')).toEqual({
      key: 'product-id',
      repeat: false,
      optional: false,
    })
  })

  it('should parse parameter with prefix/suffix', () => {
    expect(parseParameter('prefix[slug]suffix')).toEqual({
      key: 'slug',
      repeat: false,
      optional: false,
    })
  })
})

describe('parseMatchedParameter', () => {
  it('should parse matched simple parameter', () => {
    expect(parseMatchedParameter('slug')).toEqual({
      key: 'slug',
      repeat: false,
      optional: false,
    })
  })

  it('should parse matched optional parameter', () => {
    expect(parseMatchedParameter('[slug]')).toEqual({
      key: 'slug',
      repeat: false,
      optional: true,
    })
  })

  it('should parse matched catchall parameter', () => {
    expect(parseMatchedParameter('...slug')).toEqual({
      key: 'slug',
      repeat: true,
      optional: false,
    })
  })

  it('should parse matched optional catchall parameter', () => {
    expect(parseMatchedParameter('[...slug]')).toEqual({
      key: 'slug',
      repeat: true,
      optional: true,
    })
  })

  it('should handle parameter names with special characters', () => {
    expect(parseMatchedParameter('[product_id-123]')).toEqual({
      key: 'product_id-123',
      repeat: false,
      optional: true,
    })
  })
})
