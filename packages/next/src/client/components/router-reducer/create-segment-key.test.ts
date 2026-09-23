import { createRouterCacheKey } from './create-router-cache-key'
import { createSegmentKey } from './create-segment-key'
import { createSegmentKey as createBrowserSegmentKey } from './create-segment-key.browser'

describe('createSegmentKey on the server', () => {
  it.each(['d', 'c', 'oc', 'di(.)', 'ci(.)'] as const)(
    'keeps %s keys stable between prerendering and resuming',
    (paramType) => {
      const fallbackKey = createSegmentKey([
        'slug',
        '%%drp:slug:abc123%%',
        paramType,
        null,
      ])

      expect(fallbackKey).toBe(`slug|${paramType}`)
      expect(createSegmentKey(['slug', 'first', paramType, null])).toBe(
        fallbackKey
      )
      expect(createSegmentKey(['slug', 'second/third', paramType, null])).toBe(
        fallbackKey
      )
    }
  )

  it('distinguishes param names and segment types', () => {
    const keys = [
      createSegmentKey(['slug', 'value', 'd', null]),
      createSegmentKey(['other', 'value', 'd', null]),
      createSegmentKey(['slug', 'value', 'c', null]),
      createSegmentKey(['slug', 'value', 'oc', null]),
      createSegmentKey(['slug', 'value', 'di(.)', null]),
      createSegmentKey(['slug', 'value', 'ci(.)', null]),
    ]

    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(['', 'catalog', '__DEFAULT__', '__PAGE__'])(
    'preserves the static segment %j',
    (segment) => {
      expect(createSegmentKey(segment)).toBe(segment)
    }
  )

  it.each([undefined, false, true])(
    'always omits search params, even with withoutSearchParameters=%s',
    (withoutSearchParameters) => {
      expect(
        createSegmentKey('__PAGE__?{"q":"first"}', withoutSearchParameters)
      ).toBe('__PAGE__')
      expect(
        createSegmentKey('__PAGE__?{"q":"second"}', withoutSearchParameters)
      ).toBe('__PAGE__')
    }
  )
})

describe('createSegmentKey in the browser', () => {
  it('re-exports the router cache key implementation', () => {
    expect(createBrowserSegmentKey).toBe(createRouterCacheKey)
  })

  it.each(['d', 'c', 'oc', 'di(.)', 'ci(.)'] as const)(
    'includes concrete param values in %s keys',
    (paramType) => {
      expect(createBrowserSegmentKey(['slug', 'first', paramType, null])).toBe(
        `slug|first|${paramType}`
      )
      expect(
        createBrowserSegmentKey(['slug', 'second/third', paramType, null])
      ).toBe(`slug|second/third|${paramType}`)
    }
  )

  it.each([undefined, false, true])(
    'respects withoutSearchParameters=%s',
    (withoutSearchParameters) => {
      const segment = '__PAGE__?{"q":"first"}'
      expect(createBrowserSegmentKey(segment, withoutSearchParameters)).toBe(
        withoutSearchParameters ? '__PAGE__' : segment
      )
    }
  )
})
