import { buildPrefetchSegmentDataRoute } from './build-prefetch-segment-data-route'

describe('buildPrefetchSegmentDataRoute', () => {
  it('should build a prefetch segment data route', () => {
    const route = buildPrefetchSegmentDataRoute(
      '/blog/[...slug]',
      '/$c$slug$[slug]/__PAGE__'
    )

    expect(route).toMatchInlineSnapshot(`
     {
       "destination": "/blog/[...slug].segments/$c$slug$[slug]/__PAGE__.segment.rsc",
       "source": "^/blog/(?<nxtPslug>.+?)\\.segments/\\$c\\$slug\\$\\k<nxtPslug>/__PAGE__\\.segment\\.rsc$",
     }
    `)
  })
})
