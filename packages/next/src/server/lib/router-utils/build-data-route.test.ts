import { buildDataRoute } from './build-data-route'

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
