import { nextTestSetup } from 'e2e-utils'

describe('conflicting-search-and-route-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle conflicting search and route params on page', async () => {
    const browser = await next.browser('/render/123?id=456')

    const routeParamText = await browser.elementByCss('#route-param').text()
    expect(routeParamText).toContain('Route param id: 123')

    const searchParamText = await browser.elementByCss('#search-param').text()
    expect(searchParamText).toContain('Search param id: 456')
  })

  it('should handle conflicting search and route params on API route', async () => {
    // Test with route param "789" and search param "abc"
    const response = await next.fetch('/api/789?id=abc')
    const data = await response.json()

    expect(data).toEqual({
      routeParam: '789',
      searchParam: 'abc',
    })
  })
})
