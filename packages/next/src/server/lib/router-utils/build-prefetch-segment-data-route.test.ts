import {
  buildInversePrefetchSegmentDataRoute,
  buildPrefetchSegmentDataRoute,
} from './build-prefetch-segment-data-route'

describe('buildPrefetchSegmentDataRoute', () => {
  it('should build a prefetch segment data route', () => {
    const route = buildPrefetchSegmentDataRoute(
      '/blog/[...slug]',
      '/$c$slug$[slug]/__PAGE__'
    )

    expect(route).toMatchInlineSnapshot(`
     {
       "destination": "/blog/[...slug].segments/$c$slug$[slug]/__PAGE__.segment.rsc",
       "routeKeys": {
         "nxtPslug": "nxtPslug",
       },
       "source": "^/blog/(?<nxtPslug>.+?)\\.segments/\\$c\\$slug\\$\\k<nxtPslug>/__PAGE__\\.segment\\.rsc$",
     }
    `)
  })
})

describe('buildInversePrefetchSegmentDataRoute', () => {
  it('should build an inverted prefetch segment data route', () => {
    const route = buildInversePrefetchSegmentDataRoute(
      '/blog/[...slug]',
      '/_tree'
    )

    expect(route).toMatchInlineSnapshot(`
     {
       "destination": "/blog/[...slug].prefetch.rsc",
       "routeKeys": {
         "nxtPslug": "nxtPslug",
       },
       "source": "^/blog/(?<nxtPslug>.+?)\\.segments/_tree\\.segment\\.rsc$",
     }
    `)
  })
})
