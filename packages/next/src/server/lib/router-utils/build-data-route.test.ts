import {
  addLocalePrefixToDataRouteRegex,
  buildDataRoute,
} from './build-data-route'

describe('buildDataRoute', () => {
  it('should build a dynamic data route', () => {
    const dataRoute = buildDataRoute('/[...slug]', '123')
    expect(dataRoute).toMatchInlineSnapshot(`
     {
       "dataRouteRegex": "^/_next/data/123/(.+?)\\.json$",
       "namedDataRouteRegex": "^/_next/data/123/(?<nxtPslug>.+?)\\.json$",
       "page": "/[...slug]",
       "routeKeys": {
         "nxtPslug": "nxtPslug",
       },
     }
    `)
  })

  it('should build a static data route', () => {
    const dataRoute = buildDataRoute('/about', '123')
    expect(dataRoute).toMatchInlineSnapshot(`
     {
       "dataRouteRegex": "^/_next/data/123/about\\.json$",
       "namedDataRouteRegex": undefined,
       "page": "/about",
       "routeKeys": undefined,
     }
    `)
  })
})

describe('addLocalePrefixToDataRouteRegex', () => {
  it('should add a non-capturing locale segment after the build id', () => {
    const dataRouteRegex = addLocalePrefixToDataRouteRegex(
      '^/_next/data/123/(.+?)\\.json$',
      '123'
    )
    const match = new RegExp(dataRouteRegex).exec(
      '/_next/data/123/nl-NL/another.json'
    )

    expect(dataRouteRegex).toBe('^/_next/data/123/(?:[^/]+?)/(.+?)\\.json$')
    expect(match?.[1]).toBe('another')
  })

  it('should support optional catch-all routes', () => {
    const dataRouteRegex = addLocalePrefixToDataRouteRegex(
      '^/_next/data/development(?:/(.+?))?\\.json$',
      'development'
    )

    expect(
      new RegExp(dataRouteRegex).exec('/_next/data/development/nl-NL.json')?.[1]
    ).toBeUndefined()
    expect(
      new RegExp(dataRouteRegex).exec(
        '/_next/data/development/nl-NL/another.json'
      )?.[1]
    ).toBe('another')
  })

  it('should locate regex-escaped build ids', () => {
    const route = buildDataRoute('/[...slug]', 'build.id')

    expect(
      addLocalePrefixToDataRouteRegex(route.dataRouteRegex, 'build.id')
    ).toBe('^/_next/data/build\\.id/(?:[^/]+?)/(.+?)\\.json$')
  })
})
