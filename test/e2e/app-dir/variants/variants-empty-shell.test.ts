import { isNextDev, nextTestSetup } from 'e2e-utils'

// Variants are supported with Turbopack only, and enabling them rejects a
// webpack build, which `variants-webpack.test.ts` covers.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'variants with a variant read above every boundary',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/empty-shell',
      // Every route of this fixture exists to fail the build, so the harness
      // must not build or start it. Both modes below drive Next.js by hand, and
      // a deployment cannot run a build that fails.
      skipStart: true,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('should report the read above a Suspense boundary in the dev overlay', async () => {
        await next.start()

        const browser = await next.browser('/above-boundary')

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "Next.js encountered runtime data during prerendering.",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/above-boundary/page.tsx (10:36) @ Page
         > 10 |   return <p id="theme">{await theme()}</p>
              |                                    ^",
           "stack": [
             "Page app/above-boundary/page.tsx (10:36)",
           ],
         }
        `)
      })

      return
    }

    // Each route is built on its own, because a build of both stops at
    // whichever fails first.
    it.each([['above-boundary'], ['runtime-above-boundary']])(
      'should fail the build for %s',
      async (route) => {
        const { exitCode, cliOutput } = await next.build({
          args: ['--debug-build-paths', `app/${route}/page.tsx`],
        })

        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(
          `Error occurred prerendering page "/${route}"`
        )
        expect(cliOutput).toContain(
          'Next.js encountered uncached or runtime data during prerendering'
        )
      }
    )
  }
)
