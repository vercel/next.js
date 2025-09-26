import {
  getDynamicParam,
  parseParameter,
  parseMatchedParameter,
  interpolateParallelRouteParams,
} from './get-dynamic-param'
import type { Params } from '../../../../server/request/params'
import { InvariantError } from '../../invariant-error'
import { createMockOpaqueFallbackRouteParams } from '../../../../server/app-render/postponed-state.test'
import type { LoaderTree } from '../../../../server/lib/app-dir-module'

describe('getDynamicParam', () => {
  describe('basic dynamic parameters (d, di)', () => {
    it('should handle simple string parameter', () => {
      const params: Params = { slug: 'hello-world' }
      const result = getDynamicParam(params, 'slug', 'd', null)

      expect(result).toEqual({
        param: 'slug',
        value: 'hello-world',
        type: 'd',
        treeSegment: ['slug', 'hello-world', 'd'],
      })
    })

    it('should encode special characters in string parameters', () => {
      const params: Params = { slug: 'hello world & stuff' }
      const result = getDynamicParam(params, 'slug', 'd', null)

      expect(result).toEqual({
        param: 'slug',
        value: 'hello%20world%20%26%20stuff',
        type: 'd',
        treeSegment: ['slug', 'hello%20world%20%26%20stuff', 'd'],
      })
    })

    it('should handle unicode characters', () => {
      const params: Params = { slug: 'caf�-na�ve' }
      const result = getDynamicParam(params, 'slug', 'd', null)

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
        getDynamicParam(params, 'slug', 'd', null)
      }).toThrow(InvariantError)
      expect(() => {
        getDynamicParam(params, 'slug', 'd', null)
      }).toThrow(
        `Invariant: Missing value for segment key: "slug" with dynamic param type: d. This is a bug in Next.js.`
      )
    })

    it('should throw InvariantError for dynamic intercepted parameter without value', () => {
      const params: Params = {}

      expect(() => {
        getDynamicParam(params, 'slug', 'di', null)
      }).toThrow(InvariantError)
      expect(() => {
        getDynamicParam(params, 'slug', 'di', null)
      }).toThrow(
        'Invariant: Missing value for segment key: "slug" with dynamic param type: di. This is a bug in Next.js.'
      )
    })
  })

  describe('catchall parameters (c, ci)', () => {
    it('should handle array of values for catchall', () => {
      const params: Params = { slug: ['docs', 'getting-started'] }
      const result = getDynamicParam(params, 'slug', 'c', null)

      expect(result).toEqual({
        param: 'slug',
        value: ['docs', 'getting-started'],
        type: 'c',
        treeSegment: ['slug', 'docs/getting-started', 'c'],
      })
    })

    it('should encode array values for catchall', () => {
      const params: Params = { slug: ['docs & guides', 'getting started'] }
      const result = getDynamicParam(params, 'slug', 'c', null)

      expect(result).toEqual({
        param: 'slug',
        value: ['docs%20%26%20guides', 'getting%20started'],
        type: 'c',
        treeSegment: ['slug', 'docs%20%26%20guides/getting%20started', 'c'],
      })
    })

    it('should handle single string value for catchall', () => {
      const params: Params = { slug: 'single-page' }
      const result = getDynamicParam(params, 'slug', 'c', null)

      expect(result).toEqual({
        param: 'slug',
        value: 'single-page',
        type: 'c',
        treeSegment: ['slug', 'single-page', 'c'],
      })
    })

    it('should handle catchall intercepted (ci) with array values', () => {
      const params: Params = { path: ['photo', '123'] }
      const result = getDynamicParam(params, 'path', 'ci', null)

      expect(result).toEqual({
        param: 'path',
        value: ['photo', '123'],
        type: 'ci',
        treeSegment: ['path', 'photo/123', 'ci'],
      })
    })

    it('should handle parallel routes with fallback params for catchall', () => {
      const params: Params = { category: 'electronics' }
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        slug: ['%%drp:slug:parallel123%%', 'd'],
      })
      const result = getDynamicParam(params, 'slug', 'd', fallbackParams)

      expect(result).toEqual({
        param: 'slug',
        value: '%%drp:slug:parallel123%%',
        type: 'd',
        treeSegment: ['slug', '%%drp:slug:parallel123%%', 'd'],
      })
    })
  })

  describe('optional catchall parameters (oc)', () => {
    it('should handle array of values for optional catchall', () => {
      const params: Params = { slug: ['api', 'users', 'create'] }
      const result = getDynamicParam(params, 'slug', 'oc', null)

      expect(result).toEqual({
        param: 'slug',
        value: ['api', 'users', 'create'],
        type: 'oc',
        treeSegment: ['slug', 'api/users/create', 'oc'],
      })
    })

    it('should return null value for optional catchall without value', () => {
      const params: Params = {}
      const result = getDynamicParam(params, 'slug', 'oc', null)

      expect(result).toEqual({
        param: 'slug',
        value: null,
        type: 'oc',
        treeSegment: ['slug', '', 'oc'],
      })
    })

    it('should encode array values for optional catchall', () => {
      const params: Params = { slug: ['hello world', 'caf�'] }
      const result = getDynamicParam(params, 'slug', 'oc', null)

      expect(result).toEqual({
        param: 'slug',
        value: ['hello%20world', 'caf%EF%BF%BD'],
        type: 'oc',
        treeSegment: ['slug', 'hello%20world/caf%EF%BF%BD', 'oc'],
      })
    })

    it('should handle single string value for optional catchall', () => {
      const params: Params = { slug: 'documentation' }
      const result = getDynamicParam(params, 'slug', 'oc', null)

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

        fallbackParams
      )

      expect(result.value).toBe('%%drp:slug:xyz789%%')
    })

    it('should use fallback params with catchall routes', () => {
      const params: Params = { slug: ['docs', 'api'] }
      const fallbackParams = createMockOpaqueFallbackRouteParams({
        slug: ['%%drp:slug:def456%%', 'c'],
      })

      const result = getDynamicParam(params, 'slug', 'c', fallbackParams)

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

      const result = getDynamicParam(params, 'slug', 'oc', fallbackParams)

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

        fallbackParams
      )

      expect(result.value).toBe('hello%20world')
    })
  })

  describe('edge cases', () => {
    it('should throw InvariantError for empty string values', () => {
      const params: Params = { slug: '' }

      expect(() => {
        getDynamicParam(params, 'slug', 'd', null)
      }).toThrow(InvariantError)
      expect(() => {
        getDynamicParam(params, 'slug', 'd', null)
      }).toThrow(
        `Invariant: Missing value for segment key: "slug" with dynamic param type: d. This is a bug in Next.js.`
      )
    })

    it('should handle undefined param values', () => {
      const params: Params = { slug: undefined }

      expect(() => {
        getDynamicParam(params, 'slug', 'd', null)
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

describe('interpolateParallelRouteParams', () => {
  it('should interpolate parallel route params', () => {
    const loaderTree = [
      '',
      {
        children: [
          'optional-catch-all',
          {
            children: [
              '[[...path]]',
              {
                children: [
                  '__PAGE__',
                  {},
                  {
                    page: [
                      null,
                      '/private/var/folders/xy/84vxj27s21x2brb851sdl_5c0000gn/T/next-install-1265b780415069863d37bb613af21623e2ce3eecc0c3a770cbbc66e0a4cf18aa/app/optional-catch-all/[[...path]]/page.tsx',
                    ],
                  },
                ],
              },
              {
                layout: [
                  null,
                  '/private/var/folders/xy/84vxj27s21x2brb851sdl_5c0000gn/T/next-install-1265b780415069863d37bb613af21623e2ce3eecc0c3a770cbbc66e0a4cf18aa/app/optional-catch-all/[[...path]]/layout.tsx',
                ],
              },
            ],
          },
          {},
        ],
      },
      {
        'global-error': [
          null,
          'next/dist/client/components/builtin/global-error.js',
        ],
        'not-found': [null, 'next/dist/client/components/builtin/not-found.js'],
        forbidden: [null, 'next/dist/client/components/builtin/forbidden.js'],
        unauthorized: [
          null,
          'next/dist/client/components/builtin/unauthorized.js',
        ],
      },
    ] as unknown as LoaderTree

    expect(
      interpolateParallelRouteParams(
        loaderTree,
        {},
        '/optional-catch-all/[[...path]]',
        null
      )
    ).toEqual({})
  })
})
