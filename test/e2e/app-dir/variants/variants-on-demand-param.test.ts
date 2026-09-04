import { isNextDev, nextTestSetup } from 'e2e-utils'

const CONTROL = '/control'
const DECLARED = '/declared'

// Variants are supported with Turbopack only, and enabling them rejects a
// webpack build, which `variants-webpack.test.ts` covers.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'variants with a param the build did not name',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/on-demand-param',
      // TODO(variants): enable this for a deployment. A platform serves a
      // combination from the routing rules the adapter emits, and those do not
      // exist yet, so every assertion here is about a self-hosted server.
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      // Dev prerenders nothing, so it has no entry to keep and no shell to
      // resume. The second test therefore cannot hold here at all. The first
      // would pass, but only because a dev render and an on-demand prerender
      // report the same sentinel, so it would prove nothing.
      it.skip('prerenders a param the build did not name', () => {})
      return
    }

    it('should prerender a param the build did not name for the request that asks', async () => {
      // `/control/[slug]` has the same shape and declares no combinations. If
      // both routes behave alike, the combinations are not the cause.
      //
      // The sentinel reports which render filled the entry, not which render
      // reads it. A request that resumes the empty shell replays what the build
      // wrote, and reports `buildtime`. The markup cannot report this, because
      // the page looks the same either way. The cache state cannot either,
      // because resuming a shell looks like serving a prerender.
      //
      // Two params are asked for, because there must be one prerender per
      // param. A single entry that ignored the param would answer for both, and
      // would serve one param's page under the other's URL. So each response's
      // own param is asserted too.
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
      const $ = await next.render$(`${DECLARED}/built`, undefined, {
        headers: { cookie: 'theme=dark' },
      })

      expect({
        slug: $('#slug').text(),
        theme: $('#theme').text(),
        cachedSentinel: $('#cached-sentinel').text(),
      }).toEqual({ slug: 'built', theme: 'dark', cachedSentinel: 'buildtime' })
    })
  }
)
