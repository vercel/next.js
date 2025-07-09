import { isNextDev, nextTestSetup } from 'e2e-utils'
import { assertNoErrorToast } from 'next-test-utils'
import { getPrerenderOutput } from './utils'

describe('Dynamic IO Errors', () => {
  const { next, isTurbopack, isNextStart, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/default',
    skipStart: !isNextDev,
    skipDeployment: true,
  })

  let cliOutputLength: number

  beforeEach(async () => {
    cliOutputLength = next.cliOutput.length
  })

  afterEach(async () => {
    if (isNextStart) {
      await next.stop()
    }
  })

  const testCases: { inPrerenderDebugMode: boolean; name: string }[] = []

  if (isNextDev) {
    testCases.push({ inPrerenderDebugMode: false, name: 'Dev' })
  } else {
    // For Webpack, the snapshots can't be created for both modes at the same
    // time because of an issue in the typescript plugin for prettier. Defining
    // NEXT_TEST_PRERENDER_DEBUG allows us to run them sequentially, when we
    // need to update the snapshots.
    if (isTurbopack || process.env.NEXT_TEST_PRERENDER_DEBUG !== 'false') {
      testCases.push({
        inPrerenderDebugMode: true,
        name: 'Build With --prerender-debug',
      })
    }
    if (isTurbopack || process.env.NEXT_TEST_PRERENDER_DEBUG !== 'true') {
      testCases.push({
        inPrerenderDebugMode: false,
        name: 'Build Without --prerender-debug',
      })
    }
  }

  describe.each(testCases)('$name', ({ inPrerenderDebugMode }) => {
    const generate = async (pathname: string) => {
      const args = ['--experimental-build-mode', 'generate']

      if (inPrerenderDebugMode) {
        args.push('--debug-prerender')
      }

      await next.build({
        env: {
          NEXT_PRIVATE_APP_PATHS: JSON.stringify([`${pathname}/page.tsx`]),
        },
        args,
      })
    }

    beforeAll(async () => {
      if (isNextStart) {
        const args = ['--experimental-build-mode', 'compile']

        if (inPrerenderDebugMode) {
          args.push('--debug-prerender')
        }

        await next.build({ args })
      }
    })

    describe('Sync Dynamic - With Fallback - Math.random()', () => {
      const pathname = '/sync-random-with-fallback'

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should not show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)
          await assertNoErrorToast(browser)
        })
      } else {
        it('should not error the build when calling Math.random() if all dynamic access is inside a Suspense boundary', async () => {
          try {
            await generate(pathname)
          } catch (error) {
            throw new Error('expected build not to fail', { cause: error })
          }

          expect(next.cliOutput.slice(cliOutputLength)).toContain(
            `◐ ${pathname}`
          )

          await next.start({ skipBuild: true })
          const $ = await next.render$(pathname)
          expect($('[data-fallback]').length).toBe(2)
        })
      }
    })

    describe('Sync Dynamic - Without Fallback - Math.random()', () => {
      const pathname = '/sync-random-without-fallback'

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/sync-random-without-fallback" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/sync-random-without-fallback/page.tsx (32:15) @ getRandomNumber
           > 32 |   return Math.random()
                |               ^",
             "stack": [
               "getRandomNumber app/sync-random-without-fallback/page.tsx (32:15)",
               "RandomReadingComponent app/sync-random-without-fallback/page.tsx (40:18)",
               "Page app/sync-random-without-fallback/page.tsx (18:11)",
               "LogSafely <anonymous>",
             ],
           }
          `)
        })
      } else {
        it('should error the build if Math.random() happens before some component outside a Suspense boundary is complete', async () => {
          try {
            await generate(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !inPrerenderDebugMode }
          )

          if (isTurbopack) {
            if (inPrerenderDebugMode) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-random-without-fallback" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at getRandomNumber (turbopack:///[project]/app/sync-random-without-fallback/page.tsx:32:14)
                   at RandomReadingComponent (turbopack:///[project]/app/sync-random-without-fallback/page.tsx:40:17)
                 30 |
                 31 | function getRandomNumber() {
               > 32 |   return Math.random()
                    |              ^
                 33 | }
                 34 |
                 35 | function RandomReadingComponent() {
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-random-without-fallback" in your browser to investigate the error.
               Error occurred prerendering page "/sync-random-without-fallback". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-random-without-fallback/page: /sync-random-without-fallback"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-random-without-fallback" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-random-without-fallback" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-random-without-fallback". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-random-without-fallback/page: /sync-random-without-fallback, exiting the build."
              `)
            }
          } else {
            if (inPrerenderDebugMode) {
              expect(output).toMatchInlineSnapshot(`
               "Inlining static env ...
               Error: Route "/sync-random-without-fallback" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at getRandomNumber (webpack:///app/sync-random-without-fallback/page.tsx:32:14)
                   at RandomReadingComponent (webpack:///app/sync-random-without-fallback/page.tsx:40:17)
                 30 |
                 31 | function getRandomNumber() {
               > 32 |   return Math.random()
                    |              ^
                 33 | }
                 34 |
                 35 | function RandomReadingComponent() {
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-random-without-fallback" in your browser to investigate the error.
               Error occurred prerendering page "/sync-random-without-fallback". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-random-without-fallback/page: /sync-random-without-fallback"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Inlining static env ...
               Error: Route "/sync-random-without-fallback" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-random-without-fallback" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-random-without-fallback". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-random-without-fallback/page: /sync-random-without-fallback, exiting the build."
              `)
            }
          }
        })
      }
    })
  })
})
