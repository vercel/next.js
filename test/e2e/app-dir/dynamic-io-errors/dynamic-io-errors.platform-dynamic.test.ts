import { nextTestSetup } from 'e2e-utils'
import { assertNoErrorToast } from 'next-test-utils'
import { getPrerenderOutput } from './utils'

describe.each([
  { inPrerenderDebugMode: true, name: 'With --prerender-debug' },
  // { inPrerenderDebugMode: false, name: 'Without --prerender-debug' },
])('Dynamic IO Errors - $name', ({ inPrerenderDebugMode }) => {
  // We want to skip building and starting in start mode, and in dev mode when
  // prerender debug mode is enabled, which doesn't exist for `next dev`.
  const skipStart =
    process.env.NEXT_TEST_MODE === 'start' || inPrerenderDebugMode

  describe('Sync Dynamic - With Fallback - Math.random()', () => {
    const { next, isNextDev, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-random-with-fallback',
      skipStart,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      if (inPrerenderDebugMode) {
        it('prerender debug mode does not exist for `next dev`', () => {})
        return
      }

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
    const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-random-without-fallback',
      skipStart,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      if (inPrerenderDebugMode) {
        it('prerender debug mode does not exist for `next dev`', () => {})
        return
      }

      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/')

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "Route "/" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/page.tsx (35:23) @ RandomReadingComponent
         > 35 |   const random = Math.random()
              |                       ^",
           "stack": [
             "RandomReadingComponent app/page.tsx (35:23)",
             "LogSafely <anonymous> (0:0)",
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
                 at RandomReadingComponent (turbopack:///[project]/app/page.tsx:35:22)
               33 |     use(new Promise((r) => process.nextTick(r)))
               34 |   }
             > 35 |   const random = Math.random()
                  |                      ^
               36 |   return (
               37 |     <div>
               38 |       <span id="rand">{random}</span>
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                 at a (<next-dist-dir>)
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        } else {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                 at RandomReadingComponent (webpack:///app/page.tsx:35:22)
               33 |     use(new Promise((r) => process.nextTick(r)))
               34 |   }
             > 35 |   const random = Math.random()
                  |                      ^
               36 |   return (
               37 |     <div>
               38 |       <span id="rand">{random}</span>
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                 at a (<next-dist-dir>)
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        }
      })
    }
  })
})
