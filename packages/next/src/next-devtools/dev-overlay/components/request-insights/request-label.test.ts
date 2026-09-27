import {
  formatRequestRouteParams,
  getRequestDisplayUrl,
  getRequestListDisplayUrl,
  getRequestRouteParams,
} from './request-label'

describe('request insight request labels', () => {
  it('prefers the concrete URL and hides the transport-only RSC query', () => {
    const request = {
      requestId: 'request-1',
      route: '/products/[id]',
      url: '/products/blue?tab=details&_rsc=redacted#summary',
    }

    expect(getRequestDisplayUrl(request)).toBe(
      '/products/blue?tab=details&_rsc=redacted#summary'
    )
    expect(getRequestListDisplayUrl(request, true)).toBe(
      '/products/blue?tab=details#summary'
    )
    expect(getRequestListDisplayUrl(request, false)).toBe(
      '/products/blue?tab=details&_rsc=redacted#summary'
    )
    expect(
      getRequestListDisplayUrl(
        {
          requestId: 'request-2',
          route: '/products/[id]',
          url: '//example.test/products/blue?_rsc=redacted',
        },
        true
      )
    ).toBe('//example.test/products/blue')
  })

  it('extracts dynamic, catch-all, and optional catch-all parameters', () => {
    expect(
      getRequestRouteParams({
        route: '/products/[category]/[...slug]',
        url: '/products/widgets/blue/large?sort=redacted',
      })
    ).toEqual([
      { name: 'category', value: 'widgets' },
      { name: 'slug', value: ['blue', 'large'] },
    ])
    expect(
      getRequestRouteParams({
        route: '/docs/[[...slug]]',
        url: '/docs',
      })
    ).toEqual([{ name: 'slug', value: [] }])
  })

  it('handles base paths and encoded route values', () => {
    const params = getRequestRouteParams(
      {
        route: '/products/[category]/[...slug]',
        url: '/shop/products/home%20goods/blue%2Flarge',
      },
      '/shop'
    )

    expect(params).toEqual([
      { name: 'category', value: 'home goods' },
      { name: 'slug', value: ['blue/large'] },
    ])
    expect(formatRequestRouteParams(params!)).toBe(
      '{\n  "category": "home goods",\n  "slug": [\n    "blue/large"\n  ]\n}'
    )
  })

  it('does not guess parameters from malformed or mismatched routes', () => {
    expect(
      getRequestRouteParams({ route: '/products/[id]', url: '/users/1' })
    ).toBeUndefined()
    expect(
      getRequestRouteParams({ route: '/products/[id]', url: '/products/%zz' })
    ).toBeUndefined()
    expect(
      getRequestRouteParams({
        route: '/products/[id]/[id]',
        url: '/products/one/two',
      })
    ).toBeUndefined()
  })
})
