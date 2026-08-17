import { isNextDev, nextTestSetup } from 'e2e-utils'

const CONTROL = '/control'
const DECLARED = '/declared'

describe('variants with a param the build did not name', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/on-demand-param',
    skipDeployment: false,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    // Dev declares no combinations and prerenders nothing, so it has neither
    // the shell this is about nor a prerender to keep.
    it.skip('prerenders a param the build did not name', () => {})
    return
  }

  it('should prerender a param the build did not name for the request that asks', async () => {
    // Both routes read the param above every boundary, so the fallback shell of
    // each is empty and there is nothing to serve while the param resolves. A
    // param the build never named therefore has to be prerendered by the
    // request that asks for it.
    //
    // `/control/[slug]` is the same shape declaring no combinations, so it
    // states what a route without them does. Holding both to one rule is what
    // makes a difference between them attributable to the combinations rather
    // than to the shape.
    //
    // The cached sentinel is what reports this, because it carries the phase of
    // the render that filled it rather than of the render that reads it. A
    // request answered by resuming the empty shell replays the entry out of the
    // resume data cache the build wrote, and reports `buildtime`. Neither the
    // markup nor the cache state can report it: the page is identical either
    // way, since the param is resolved by the resume, and resuming a shell
    // reports the same cache state as serving a prerender.
    //
    // Two params are asked for, because a prerender per param is what has to
    // exist. One entry that no param partitions answers for every param, and
    // each param then either reports a param nobody asked for or reaches the
    // origin without one, so the param each response reports is asserted on as
    // well.
    for (const route of [CONTROL, DECLARED]) {
      for (const slug of ['unnamed-one', 'unnamed-two']) {
        const $ = await next.render$(`${route}/${slug}`, undefined, {
          headers: { cookie: 'theme=dark' },
        })

        expect({
          route,
          slug: $('#slug').text(),
          cachedSentinel: $('#cached-sentinel').text(),
        }).toEqual({ route, slug, cachedSentinel: 'runtime' })
      }
    }
  })

  it('should serve a param the build named from the prerender of its combination', async () => {
    // The counterpart: this param has an output under the prefix of the
    // combination already, so the request is served from it and the entry it
    // carries was filled by the build.
    const $ = await next.render$(`${DECLARED}/built`, undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect({
      slug: $('#slug').text(),
      theme: $('#theme').text(),
      cachedSentinel: $('#cached-sentinel').text(),
    }).toEqual({ slug: 'built', theme: 'dark', cachedSentinel: 'buildtime' })
  })
})
