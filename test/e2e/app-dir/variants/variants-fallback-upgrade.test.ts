import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Variants are supported with Turbopack only, and enabling them rejects a
// webpack build, which `variants-webpack.test.ts` covers.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'variants on an upgraded fallback shell',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/fallback-upgrade',
      // TODO(variants): enable this for a deployment. A platform serves a
      // combination from the routing rules the adapter emits, and those do not
      // exist yet, so every assertion here is about a self-hosted server.
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      // Dev prerenders nothing, so it has no fallback shell to upgrade.
      it.skip('upgrades the shell of each combination separately', () => {})
      return
    }

    it('should upgrade the shell of each combination separately', async () => {
      // `generateStaticParams` names `b` alone, so `/prefix/c` is served a
      // fallback shell where the param is a hole. That request triggers an
      // upgrade in the background, and a later one is served a shell built for
      // `c`. Partial Prefetching is what enables the upgrade, and nothing else
      // in this suite turns it on.
      //
      // The upgraded shell is rendered for one combination and bakes its theme,
      // so each combination needs an upgraded shell of its own. That is what
      // the prefix on the cache key provides. Without it the second combination
      // reads the first one's shell and is answered with its theme.
      for (const theme of ['dark', 'light']) {
        const fallback = await next.render$('/prefix/c', undefined, {
          headers: { cookie: `theme=${theme}` },
        })

        // `first()`, because a fallback shell emits the placeholder and the
        // resume then emits the value, so both elements carry this id.
        expect({
          theme: fallback('#theme').first().text(),
          one: fallback('#one').first().text(),
        }).toEqual({ theme, one: 'pending' })

        await retry(async () => {
          const upgraded = await next.render$('/prefix/c', undefined, {
            headers: { cookie: `theme=${theme}` },
          })

          expect({
            theme: upgraded('#theme').first().text(),
            one: upgraded('#one').first().text(),
          }).toEqual({ theme, one: 'c' })
        })
      }
    })
  }
)
