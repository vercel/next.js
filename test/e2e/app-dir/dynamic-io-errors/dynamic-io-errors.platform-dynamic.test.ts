import { isNextDev, nextTestSetup } from 'e2e-utils'
import { assertNoErrorToast } from 'next-test-utils'
import { getPrerenderOutput } from './utils'

describe.each(
  isNextDev
    ? [
        {
          inPrerenderDebugMode: false,
          name: 'Dev',
        },
      ]
    : [
        {
          inPrerenderDebugMode: false,
          name: 'Build Without --prerender-debug',
        },
        {
          inPrerenderDebugMode: true,
          name: 'Build With --prerender-debug',
        },
      ]
)('Dynamic IO Errors - $name', ({ inPrerenderDebugMode }) => {
  describe('Sync Dynamic - With Fallback - Math.random()', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-random-with-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('should not show a collapsed redbox error', async () => {
        const browser = await next.browser('/')
        await assertNoErrorToast(browser)
      })
    } else {
      it('should not error the build when calling Math.random() if all dynamic access is inside a Suspense boundary', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail for fully static project')
        }

        expect(next.cliOutput).toContain('◐ / ')
        const $ = await next.render$('/')
        expect($('[data-fallback]').length).toBe(2)
      })
    }
  })

  describe('Sync Dynamic - Without Fallback - Math.random()', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-random-without-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/')

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "Route "/" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/page.tsx (32:15) @ getRandomNumber
         > 32 |   return Math.random()
              |               ^",
           "stack": [
             "getRandomNumber app/page.tsx (32:15)",
             "RandomReadingComponent app/page.tsx (40:18)",
             "Page app/page.tsx (18:11)",
             "LogSafely <anonymous>",
           ],
         }
        `)
      })
    } else {
      it('should error the build if Math.random() happens before some component outside a Suspense boundary is complete', async () => {
        try {
          await next.build()
        } catch {
          // we expect the build to fail
        }

        const output = getPrerenderOutput(next.cliOutput, {
          isMinified: !inPrerenderDebugMode,
        })

        if (isTurbopack) {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                 at getRandomNumber (turbopack:///[project]/app/page.tsx:32:14)
                 at RandomReadingComponent (turbopack:///[project]/app/page.tsx:40:17)
               30 |
               31 | function getRandomNumber() {
             > 32 |   return Math.random()
                  |              ^
               33 | }
               34 |
               35 | function RandomReadingComponent() {
             To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/" in your browser to investigate the error.
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                 at a (<next-dist-dir>)
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        } else {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                 at getRandomNumber (webpack:///app/page.tsx:32:14)
                 at RandomReadingComponent (webpack:///app/page.tsx:40:17)
               30 |
               31 | function getRandomNumber() {
             > 32 |   return Math.random()
                  |              ^
               33 | }
               34 |
               35 | function RandomReadingComponent() {
             To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/" in your browser to investigate the error.
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                 at a (<next-dist-dir>)
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        }
      })
    }
  })
})
