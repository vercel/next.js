import { buildPrefetchSegmentDataRoute } from './build-prefetch-segment-data-route'

describe('buildPrefetchSegmentDataRoute', () => {
  it('should build a prefetch segment data route', () => {
    const route = buildPrefetchSegmentDataRoute('/blog/[...slug]')

    expect(route).toMatchInlineSnapshot(`
     {
       "dataRouteRegex": "^/blog/(.+?)\\.segments/(.+?)\\.segment\\.rsc(?:/)?$",
       "namedDataRouteRegex": "^/blog/(?<nxtPslug>.+?)\\.segments/(?<nxtPsegmentPath>.+?)\\.segment\\.rsc$",
       "page": "/blog/[...slug]",
       "routeKeys": {
         "nxtPsegmentPath": "nxtPsegmentPath",
         "nxtPslug": "nxtPslug",
       },
     }
    `)
  })
})
