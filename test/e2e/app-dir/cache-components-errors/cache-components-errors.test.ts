import { isNextDev, nextTestSetup } from 'e2e-utils'
import { assertNoErrorToast } from 'next-test-utils'
import { getPrerenderOutput } from './utils'

describe('Cache Components Errors', () => {
  const { next, isTurbopack, isNextStart, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/default',
    skipStart: !isNextDev,
    skipDeployment: true,
  })
  const isRspack = !!process.env.NEXT_RSPACK

  if (skipped) {
    return
  }

  let cliOutputLength: number

  beforeEach(async () => {
    cliOutputLength = next.cliOutput.length
  })

  afterEach(async () => {
    if (isNextStart) {
      await next.stop()
    }
  })

  const testCases: { isDebugPrerender: boolean; name: string }[] = []

  if (isNextDev) {
    testCases.push({ isDebugPrerender: false, name: 'Dev' })
  } else {
    const prerenderMode = process.env.NEXT_TEST_DEBUG_PRERENDER
    // The snapshots can't be created for both modes at the same time because of
    // an issue in the typescript plugin for prettier. Defining
    // NEXT_TEST_DEBUG_PRERENDER allows us to run them sequentially, when we
    // need to update the snapshots.
    if (!prerenderMode || prerenderMode === 'true') {
      testCases.push({
        isDebugPrerender: true,
        name: 'Build With --prerender-debug',
      })
    }
    if (!prerenderMode || prerenderMode === 'false') {
      testCases.push({
        isDebugPrerender: false,
        name: 'Build Without --prerender-debug',
      })
    }
  }

  describe.each(testCases)('$name', ({ isDebugPrerender }) => {
    beforeAll(async () => {
      if (isNextStart) {
        const args = ['--experimental-build-mode', 'compile']

        if (isDebugPrerender) {
          args.push('--debug-prerender')
        }

        await next.build({ args })
      }
    })

    const prerender = async (pathname: string) => {
      const args = ['--experimental-build-mode', 'generate']

      if (isDebugPrerender) {
        args.push('--debug-prerender')
      }

      await next.build({
        env: {
          NEXT_PRIVATE_APP_PATHS: JSON.stringify([`${pathname}/page.tsx`]),
        },
        args,
      })
    }

    describe('Dynamic Metadata - Static Route', () => {
      const pathname = '/dynamic-metadata-static-route'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/dynamic-metadata-static-route" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": null,
             "stack": [
               "LogSafely <anonymous>",
             ],
           }
          `)
        })
      } else {
        it('should error the build if generateMetadata is dynamic when the rest of the route is prerenderable', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-metadata-static-route" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
               Error occurred prerendering page "/dynamic-metadata-static-route". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/dynamic-metadata-static-route/page: /dynamic-metadata-static-route"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-metadata-static-route" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
               Error occurred prerendering page "/dynamic-metadata-static-route". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-metadata-static-route/page: /dynamic-metadata-static-route, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-metadata-static-route" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
               Error occurred prerendering page "/dynamic-metadata-static-route". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/dynamic-metadata-static-route/page: /dynamic-metadata-static-route"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-metadata-static-route" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
               Error occurred prerendering page "/dynamic-metadata-static-route". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-metadata-static-route/page: /dynamic-metadata-static-route, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Dynamic Metadata - Error Route', () => {
      const pathname = '/dynamic-metadata-error-route'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/dynamic-metadata-error-route": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/dynamic-metadata-error-route/page.tsx (20:16) @ Dynamic
           > 20 | async function Dynamic() {
                |                ^",
             "stack": [
               "Dynamic app/dynamic-metadata-error-route/page.tsx (20:16)",
               "Page app/dynamic-metadata-error-route/page.tsx (15:7)",
               "LogSafely <anonymous>",
             ],
           }
          `)
        })
      } else {
        // This test is just here because there was a bug when dynamic metadata was used alongside another cache components violation which caused the validation to be skipped.
        it('should error the build for the correct reason when there is a cache components violation alongside dynamic metadata', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-metadata-error-route": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-metadata-error-route" in your browser to investigate the error.
               Error occurred prerendering page "/dynamic-metadata-error-route". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/dynamic-metadata-error-route/page: /dynamic-metadata-error-route"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-metadata-error-route": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/dynamic-metadata-error-route" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/dynamic-metadata-error-route". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-metadata-error-route/page: /dynamic-metadata-error-route, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-metadata-error-route": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at InnerLayoutRouter (bundler:///<next-src>)
                   at RedirectErrorBoundary (bundler:///<next-src>)
                   at RedirectBoundary (bundler:///<next-src>)
                   at HTTPAccessFallbackBoundary (bundler:///<next-src>)
                   at LoadingBoundary (bundler:///<next-src>)
                   at ErrorBoundary (bundler:///<next-src>)
                   at InnerScrollAndFocusHandler (bundler:///<next-src>)
                   at ScrollAndFocusHandler (bundler:///<next-src>)
                   at RenderFromTemplateContext (bundler:///<next-src>)
                   at OuterLayoutRouter (bundler:///<next-src>)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                   at InnerLayoutRouter (bundler:///<next-src>)
                   at RedirectErrorBoundary (bundler:///<next-src>)
                   at RedirectBoundary (bundler:///<next-src>)
                   at HTTPAccessFallbackErrorBoundary (bundler:///<next-src>)
                   at HTTPAccessFallbackBoundary (bundler:///<next-src>)
                   at LoadingBoundary (bundler:///<next-src>)
                   at ErrorBoundary (bundler:///<next-src>)
                   at InnerScrollAndFocusHandler (bundler:///<next-src>)
                   at ScrollAndFocusHandler (bundler:///<next-src>)
                   at RenderFromTemplateContext (bundler:///<next-src>)
                   at OuterLayoutRouter (bundler:///<next-src>)
                 340 |  */
                 341 | function InnerLayoutRouter({
               > 342 |   tree,
                     |   ^
                 343 |   segmentPath,
                 344 |   debugNameContext,
                 345 |   cacheNode,
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-metadata-error-route" in your browser to investigate the error.
               Error occurred prerendering page "/dynamic-metadata-error-route". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/dynamic-metadata-error-route/page: /dynamic-metadata-error-route"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-metadata-error-route": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>)
                   at c (<next-dist-dir>)
                   at d (<next-dist-dir>)
                   at e (<next-dist-dir>)
                   at f (<next-dist-dir>)
                   at g (<next-dist-dir>)
                   at h (<next-dist-dir>)
                   at i (<next-dist-dir>)
                   at j (<next-dist-dir>)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                   at k (<next-dist-dir>)
                   at l (<next-dist-dir>)
                   at m (<next-dist-dir>)
                   at n (<next-dist-dir>)
                   at o (<next-dist-dir>)
                   at p (<next-dist-dir>)
                   at q (<next-dist-dir>)
                   at r (<next-dist-dir>)
                   at s (<next-dist-dir>)
                   at t (<next-dist-dir>)
                   at u (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/dynamic-metadata-error-route" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/dynamic-metadata-error-route". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-metadata-error-route/page: /dynamic-metadata-error-route, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Dynamic Metadata - Static Route With Suspense', () => {
      const pathname = '/dynamic-metadata-static-with-suspense'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/dynamic-metadata-static-with-suspense" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": null,
             "stack": [
               "LogSafely <anonymous>",
             ],
           }
          `)
        })
      } else {
        it('should error the build if generateMetadata is dynamic when the rest of the route is prerenderable', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-metadata-static-with-suspense" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
               Error occurred prerendering page "/dynamic-metadata-static-with-suspense". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/dynamic-metadata-static-with-suspense/page: /dynamic-metadata-static-with-suspense"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-metadata-static-with-suspense" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
               Error occurred prerendering page "/dynamic-metadata-static-with-suspense". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-metadata-static-with-suspense/page: /dynamic-metadata-static-with-suspense, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-metadata-static-with-suspense" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
               Error occurred prerendering page "/dynamic-metadata-static-with-suspense". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/dynamic-metadata-static-with-suspense/page: /dynamic-metadata-static-with-suspense"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-metadata-static-with-suspense" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
               Error occurred prerendering page "/dynamic-metadata-static-with-suspense". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-metadata-static-with-suspense/page: /dynamic-metadata-static-with-suspense, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Dynamic Metadata - Dynamic Route', () => {
      const pathname = '/dynamic-metadata-dynamic-route'

      if (isNextDev) {
        it('should not show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)
          await assertNoErrorToast(browser)
        })
      } else {
        it('should partially prerender when all dynamic components are inside a Suspense boundary', async () => {
          try {
            await prerender(pathname)
          } catch (error) {
            throw new Error('expected build not to fail', { cause: error })
          }

          expect(next.cliOutput).toContain(`◐ ${pathname}`)
          await next.start({ skipBuild: true })
          const $ = await next.render$(pathname)
          expect($('#dynamic').text()).toBe('Dynamic')
          expect($('[data-fallback]').length).toBe(1)
        })
      }
    })

    describe('Dynamic Viewport - Static Route', () => {
      const pathname = '/dynamic-viewport-static-route'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/dynamic-viewport-static-route" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": null,
             "stack": [
               "LogSafely <anonymous>",
             ],
           }
          `)
        })
      } else {
        it('should error the build if generateViewport is dynamic', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-viewport-static-route" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               Error occurred prerendering page "/dynamic-viewport-static-route". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/dynamic-viewport-static-route/page: /dynamic-viewport-static-route"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-viewport-static-route" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               Error occurred prerendering page "/dynamic-viewport-static-route". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-viewport-static-route/page: /dynamic-viewport-static-route, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-viewport-static-route" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               Error occurred prerendering page "/dynamic-viewport-static-route". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/dynamic-viewport-static-route/page: /dynamic-viewport-static-route"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-viewport-static-route" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               Error occurred prerendering page "/dynamic-viewport-static-route". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-viewport-static-route/page: /dynamic-viewport-static-route, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Dynamic Viewport - Dynamic Route', () => {
      const pathname = '/dynamic-viewport-dynamic-route'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/dynamic-viewport-dynamic-route" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": null,
             "stack": [
               "LogSafely <anonymous>",
             ],
           }
          `)
        })
      } else {
        it('should error the build if generateViewport is dynamic even if there are other uses of dynamic on the page', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-viewport-dynamic-route" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               Error occurred prerendering page "/dynamic-viewport-dynamic-route". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/dynamic-viewport-dynamic-route/page: /dynamic-viewport-dynamic-route"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-viewport-dynamic-route" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               Error occurred prerendering page "/dynamic-viewport-dynamic-route". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-viewport-dynamic-route/page: /dynamic-viewport-dynamic-route, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-viewport-dynamic-route" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               Error occurred prerendering page "/dynamic-viewport-dynamic-route". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/dynamic-viewport-dynamic-route/page: /dynamic-viewport-dynamic-route"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Route "/dynamic-viewport-dynamic-route" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               Error occurred prerendering page "/dynamic-viewport-dynamic-route". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-viewport-dynamic-route/page: /dynamic-viewport-dynamic-route, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Static Route', () => {
      const pathname = '/static'

      if (isNextDev) {
        it('should not show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)
          await assertNoErrorToast(browser)
        })
      } else {
        it('should not error the build when all routes are static', async () => {
          try {
            await prerender(pathname)
          } catch (error) {
            throw new Error('expected build not to fail', { cause: error })
          }
        })
      }
    })

    describe('Dynamic Root', () => {
      const pathname = '/dynamic-root'

      if (isNextDev) {
        it('should show a collapsed redbox with two errors', async () => {
          const browser = await next.browser(pathname)

          if (isTurbopack) {
            await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "description": "Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/dynamic-root/page.tsx (59:26) @ fetchRandom
             > 59 |   const response = await fetch(
                  |                          ^",
                 "stack": [
                   "fetchRandom app/dynamic-root/page.tsx (59:26)",
                   "FetchingComponent app/dynamic-root/page.tsx (45:56)",
                   "Page app/dynamic-root/page.tsx (22:9)",
                   "LogSafely <anonymous>",
                 ],
               },
               {
                 "description": "Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/dynamic-root/page.tsx (59:26) @ fetchRandom
             > 59 |   const response = await fetch(
                  |                          ^",
                 "stack": [
                   "fetchRandom app/dynamic-root/page.tsx (59:26)",
                   "FetchingComponent app/dynamic-root/page.tsx (45:56)",
                   "Page app/dynamic-root/page.tsx (27:7)",
                   "LogSafely <anonymous>",
                 ],
               },
             ]
            `)
          } else {
            await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "description": "Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/dynamic-root/page.tsx (59:26) @ fetchRandom
             > 59 |   const response = await fetch(
                  |                          ^",
                 "stack": [
                   "fetchRandom app/dynamic-root/page.tsx (59:26)",
                   "FetchingComponent app/dynamic-root/page.tsx (45:56)",
                   "Page app/dynamic-root/page.tsx (22:9)",
                   "LogSafely <anonymous>",
                 ],
               },
               {
                 "description": "Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/dynamic-root/page.tsx (59:26) @ fetchRandom
             > 59 |   const response = await fetch(
                  |                          ^",
                 "stack": [
                   "fetchRandom app/dynamic-root/page.tsx (59:26)",
                   "FetchingComponent app/dynamic-root/page.tsx (45:56)",
                   "Page app/dynamic-root/page.tsx (27:7)",
                   "LogSafely <anonymous>",
                 ],
               },
             ]
            `)
          }
        })
      } else {
        it('should error the build if cache components happens in the root (outside a Suspense)', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at IndirectionTwo (bundler:///app/dynamic-root/indirection.tsx:7:34)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                  5 | }
                  6 |
               >  7 | export function IndirectionTwo({ children }) {
                    |                                  ^
                  8 |   return children
                  9 | }
                 10 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
               Error: Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
               Error occurred prerendering page "/dynamic-root". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/dynamic-root/page: /dynamic-root"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at a (bundler:///app/dynamic-root/indirection.tsx:7:34)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                  5 | }
                  6 |
               >  7 | export function IndirectionTwo({ children }) {
                    |                                  ^
                  8 |   return children
                  9 | }
                 10 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/dynamic-root". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-root/page: /dynamic-root, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at IndirectionTwo (bundler:///app/dynamic-root/indirection.tsx:7:34)
                   at InnerLayoutRouter (bundler:///<next-src>)
                   at RedirectErrorBoundary (bundler:///<next-src>)
                   at RedirectBoundary (bundler:///<next-src>)
                   at HTTPAccessFallbackBoundary (bundler:///<next-src>)
                   at LoadingBoundary (bundler:///<next-src>)
                   at ErrorBoundary (bundler:///<next-src>)
                   at InnerScrollAndFocusHandler (bundler:///<next-src>)
                   at ScrollAndFocusHandler (bundler:///<next-src>)
                   at RenderFromTemplateContext (bundler:///<next-src>)
                   at OuterLayoutRouter (bundler:///<next-src>)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                   at InnerLayoutRouter (bundler:///<next-src>)
                   at RedirectErrorBoundary (bundler:///<next-src>)
                   at RedirectBoundary (bundler:///<next-src>)
                   at HTTPAccessFallbackErrorBoundary (bundler:///<next-src>)
                   at HTTPAccessFallbackBoundary (bundler:///<next-src>)
                   at LoadingBoundary (bundler:///<next-src>)
                   at ErrorBoundary (bundler:///<next-src>)
                   at InnerScrollAndFocusHandler (bundler:///<next-src>)
                   at ScrollAndFocusHandler (bundler:///<next-src>)
                   at RenderFromTemplateContext (bundler:///<next-src>)
                   at OuterLayoutRouter (bundler:///<next-src>)
                  5 | }
                  6 |
               >  7 | export function IndirectionTwo({ children }) {
                    |                                  ^
                  8 |   return children
                  9 | }
                 10 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
               Error: Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at InnerLayoutRouter (bundler:///<next-src>)
                   at RedirectErrorBoundary (bundler:///<next-src>)
                   at RedirectBoundary (bundler:///<next-src>)
                   at HTTPAccessFallbackBoundary (bundler:///<next-src>)
                   at LoadingBoundary (bundler:///<next-src>)
                   at ErrorBoundary (bundler:///<next-src>)
                   at InnerScrollAndFocusHandler (bundler:///<next-src>)
                   at ScrollAndFocusHandler (bundler:///<next-src>)
                   at RenderFromTemplateContext (bundler:///<next-src>)
                   at OuterLayoutRouter (bundler:///<next-src>)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                   at InnerLayoutRouter (bundler:///<next-src>)
                   at RedirectErrorBoundary (bundler:///<next-src>)
                   at RedirectBoundary (bundler:///<next-src>)
                   at HTTPAccessFallbackErrorBoundary (bundler:///<next-src>)
                   at HTTPAccessFallbackBoundary (bundler:///<next-src>)
                   at LoadingBoundary (bundler:///<next-src>)
                   at ErrorBoundary (bundler:///<next-src>)
                   at InnerScrollAndFocusHandler (bundler:///<next-src>)
                   at ScrollAndFocusHandler (bundler:///<next-src>)
                   at RenderFromTemplateContext (bundler:///<next-src>)
                   at OuterLayoutRouter (bundler:///<next-src>)
                 340 |  */
                 341 | function InnerLayoutRouter({
               > 342 |   tree,
                     |   ^
                 343 |   segmentPath,
                 344 |   debugNameContext,
                 345 |   cacheNode,
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
               Error occurred prerendering page "/dynamic-root". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/dynamic-root/page: /dynamic-root"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>)
                   at c (<next-dist-dir>)
                   at d (<next-dist-dir>)
                   at e (<next-dist-dir>)
                   at f (<next-dist-dir>)
                   at g (<next-dist-dir>)
                   at h (<next-dist-dir>)
                   at i (<next-dist-dir>)
                   at j (<next-dist-dir>)
                   at k (<next-dist-dir>)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                   at l (<next-dist-dir>)
                   at m (<next-dist-dir>)
                   at n (<next-dist-dir>)
                   at o (<next-dist-dir>)
                   at p (<next-dist-dir>)
                   at q (<next-dist-dir>)
                   at r (<next-dist-dir>)
                   at s (<next-dist-dir>)
                   at t (<next-dist-dir>)
                   at u (<next-dist-dir>)
                   at v (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at w (<next-dist-dir>)
                   at x (<next-dist-dir>)
                   at y (<next-dist-dir>)
                   at z (<next-dist-dir>)
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>)
                   at c (<next-dist-dir>)
                   at d (<next-dist-dir>)
                   at e (<next-dist-dir>)
                   at f (<next-dist-dir>)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                   at g (<next-dist-dir>)
                   at h (<next-dist-dir>)
                   at i (<next-dist-dir>)
                   at j (<next-dist-dir>)
                   at k (<next-dist-dir>)
                   at l (<next-dist-dir>)
                   at m (<next-dist-dir>)
                   at n (<next-dist-dir>)
                   at o (<next-dist-dir>)
                   at p (<next-dist-dir>)
                   at q (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/dynamic-root". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-root/page: /dynamic-root, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Dynamic Boundary', () => {
      const pathname = '/dynamic-boundary'

      if (isNextDev) {
        it('should not show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)
          await assertNoErrorToast(browser)
        })
      } else {
        it('should partially prerender when all dynamic components are inside a Suspense boundary', async () => {
          try {
            await prerender(pathname)
          } catch (error) {
            throw new Error('expected build not to fail', { cause: error })
          }

          expect(next.cliOutput).toContain(`◐ ${pathname}`)
          await next.start({ skipBuild: true })
          const $ = await next.render$(pathname)
          expect($('[data-fallback]').length).toBe(2)
        })
      }
    })

    describe('Sync Dynamic Platform', () => {
      describe('With Fallback - Math.random()', () => {
        const pathname = '/sync-random-with-fallback'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should show a collapsed redbox error', async () => {
            const browser = await next.browser(pathname)

            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-random-with-fallback" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/sync-random-with-fallback/page.tsx (37:23) @ RandomReadingComponent
             > 37 |   const random = Math.random()
                  |                       ^",
               "stack": [
                 "RandomReadingComponent app/sync-random-with-fallback/page.tsx (37:23)",
                 "Page app/sync-random-with-fallback/page.tsx (18:11)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          })
        } else {
          it('should error the build if Math.random() happens before some component outside a Suspense boundary is complete', async () => {
            try {
              await prerender(pathname)
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-with-fallback" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                     at RandomReadingComponent (bundler:///app/sync-random-with-fallback/page.tsx:37:23)
                   35 |     use(new Promise((r) => process.nextTick(r)))
                   36 |   }
                 > 37 |   const random = Math.random()
                      |                       ^
                   38 |   return (
                   39 |     <div>
                   40 |       <span id="rand">{random}</span>
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-random-with-fallback" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-random-with-fallback". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/sync-random-with-fallback/page: /sync-random-with-fallback"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-with-fallback" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                     at a (bundler:///app/sync-random-with-fallback/page.tsx:37:23)
                   35 |     use(new Promise((r) => process.nextTick(r)))
                   36 |   }
                 > 37 |   const random = Math.random()
                      |                       ^
                   38 |   return (
                   39 |     <div>
                   40 |       <span id="rand">{random}</span>
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-random-with-fallback" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-random-with-fallback". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-random-with-fallback/page: /sync-random-with-fallback, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-with-fallback" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                     at RandomReadingComponent (bundler:///app/sync-random-with-fallback/page.tsx:37:23)
                   35 |     use(new Promise((r) => process.nextTick(r)))
                   36 |   }
                 > 37 |   const random = Math.random()
                      |                       ^
                   38 |   return (
                   39 |     <div>
                   40 |       <span id="rand">{random}</span>
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-random-with-fallback" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-random-with-fallback". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/sync-random-with-fallback/page: /sync-random-with-fallback"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-with-fallback" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                     at a (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-random-with-fallback" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-random-with-fallback". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-random-with-fallback/page: /sync-random-with-fallback, exiting the build."
                `)
              }
            }
          })
        }
      })

      describe('Without Fallback - Math.random()', () => {
        const pathname = '/sync-random-without-fallback'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should show a collapsed redbox error', async () => {
            const browser = await next.browser(pathname)

            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-random-without-fallback" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
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
              await prerender(pathname)
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-without-fallback" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                     at getRandomNumber (bundler:///app/sync-random-without-fallback/page.tsx:32:15)
                     at RandomReadingComponent (bundler:///app/sync-random-without-fallback/page.tsx:40:18)
                   30 |
                   31 | function getRandomNumber() {
                 > 32 |   return Math.random()
                      |               ^
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
                 "Error: Route "/sync-random-without-fallback" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                     at a (bundler:///app/sync-random-without-fallback/page.tsx:32:15)
                   30 |
                   31 | function getRandomNumber() {
                 > 32 |   return Math.random()
                      |               ^
                   33 | }
                   34 |
                   35 | function RandomReadingComponent() {
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-random-without-fallback" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-random-without-fallback". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-random-without-fallback/page: /sync-random-without-fallback, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-without-fallback" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                     at getRandomNumber (bundler:///app/sync-random-without-fallback/page.tsx:32:15)
                     at RandomReadingComponent (bundler:///app/sync-random-without-fallback/page.tsx:40:18)
                   30 |
                   31 | function getRandomNumber() {
                 > 32 |   return Math.random()
                      |               ^
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
                 "Error: Route "/sync-random-without-fallback" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
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

    describe('Sync Dynamic Request', () => {
      describe('client searchParams', () => {
        const pathname = '/sync-client-search'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should return `undefined` for `searchParams.foo`', async () => {
            const browser = await next.browser(`${pathname}?foo=test`)

            expect(await browser.elementById('foo-param').text()).toBe(
              'undefined'
            )
          })

          it('should show a collapsed redbox with a sync access error', async () => {
            const browser = await next.browser(`${pathname}?foo=test`)

            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "A searchParam property was accessed directly with \`searchParams.foo\`. \`searchParams\` is a Promise and must be unwrapped with \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": null,
               "label": "Console Error",
               "source": "app/sync-client-search/page.tsx (23:42) @ SearchParamsReadingComponent
             > 23 |   const fooParam = (searchParams as any).foo
                  |                                          ^",
               "stack": [
                 "SearchParamsReadingComponent app/sync-client-search/page.tsx (23:42)",
                 "Page app/sync-client-search/page.tsx (12:7)",
               ],
             }
            `)
          })
        }
      })

      describe('server searchParams', () => {
        const pathname = '/sync-server-search'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should return `undefined` for `searchParams.foo`', async () => {
            const browser = await next.browser(`${pathname}?foo=test`)

            expect(await browser.elementById('foo-param').text()).toBe(
              'undefined'
            )
          })

          it('should show a collapsed redbox with a sync access error', async () => {
            const browser = await next.browser(`${pathname}?foo=test`)

            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-server-search" used \`searchParams.foo\`. \`searchParams\` is a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/sync-server-search/page.tsx (29:42) @ SearchParamsReadingComponent
             > 29 |   const fooParam = (searchParams as any).foo
                  |                                          ^",
               "stack": [
                 "SearchParamsReadingComponent app/sync-server-search/page.tsx (29:42)",
                 "Page app/sync-server-search/page.tsx (15:7)",
               ],
             }
            `)
          })
        }
      })

      describe('cookies', () => {
        const pathname = '/sync-cookies'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should show a redbox with a sync access error and a runtime error', async () => {
            const browser = await next.browser(`${pathname}`)

            if (isTurbopack) {
              await expect(browser).toDisplayRedbox(`
               [
                 {
                   "description": "Route "/sync-cookies" used \`cookies().get\`. \`cookies()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                   "environmentLabel": "Prerender",
                   "label": "Console Error",
                   "source": "app/sync-cookies/page.tsx (18:25) @ CookiesReadingComponent
               > 18 |   const token = (cookies() as any).get('token')
                    |                         ^",
                   "stack": [
                     "CookiesReadingComponent app/sync-cookies/page.tsx (18:25)",
                     "Page app/sync-cookies/page.tsx (11:7)",
                   ],
                 },
                 {
                   "description": "(0 , <turbopack-module-id>.cookies)(...).get is not a function",
                   "environmentLabel": "Prerender",
                   "label": "Runtime TypeError",
                   "source": "app/sync-cookies/page.tsx (18:36) @ CookiesReadingComponent
               > 18 |   const token = (cookies() as any).get('token')
                    |                                    ^",
                   "stack": [
                     "CookiesReadingComponent app/sync-cookies/page.tsx (18:36)",
                   ],
                 },
               ]
              `)
            } else if (isRspack) {
              await expect(browser).toDisplayRedbox(`
               [
                 {
                   "description": "Route "/sync-cookies" used \`cookies().get\`. \`cookies()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                   "environmentLabel": "Prerender",
                   "label": "Console Error",
                   "source": "app/sync-cookies/page.tsx (18:25) @ CookiesReadingComponent
               > 18 |   const token = (cookies() as any).get('token')
                    |                         ^",
                   "stack": [
                     "CookiesReadingComponent app/sync-cookies/page.tsx (18:25)",
                     "Page app/sync-cookies/page.tsx (11:7)",
                   ],
                 },
                 {
                   "description": "(0 , <webpack-module-id>.cookies)(...).get is not a function",
                   "environmentLabel": "Prerender",
                   "label": "Runtime TypeError",
                   "source": "app/sync-cookies/page.tsx (18:36) @ CookiesReadingComponent
               > 18 |   const token = (cookies() as any).get('token')
                    |                                    ^",
                   "stack": [
                     "CookiesReadingComponent app/sync-cookies/page.tsx (18:36)",
                   ],
                 },
               ]
              `)
            } else {
              await expect(browser).toDisplayRedbox(`
               [
                 {
                   "description": "Route "/sync-cookies" used \`cookies().get\`. \`cookies()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                   "environmentLabel": "Prerender",
                   "label": "Console Error",
                   "source": "app/sync-cookies/page.tsx (18:17) @ CookiesReadingComponent
               > 18 |   const token = (cookies() as any).get('token')
                    |                 ^",
                   "stack": [
                     "CookiesReadingComponent app/sync-cookies/page.tsx (18:17)",
                     "Page app/sync-cookies/page.tsx (11:7)",
                   ],
                 },
                 {
                   "description": "(0 , <webpack-module-id>.cookies)(...).get is not a function",
                   "environmentLabel": "Prerender",
                   "label": "Runtime TypeError",
                   "source": "app/sync-cookies/page.tsx (18:36) @ CookiesReadingComponent
               > 18 |   const token = (cookies() as any).get('token')
                    |                                    ^",
                   "stack": [
                     "CookiesReadingComponent app/sync-cookies/page.tsx (18:36)",
                   ],
                 },
               ]
              `)
            }
          })
        } else {
          it('should error the build with a runtime error', async () => {
            try {
              await prerender(pathname)
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-cookies". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at CookiesReadingComponent (bundler:///app/sync-cookies/page.tsx:18:36)
                     at stringify (<anonymous>)
                   16 | async function CookiesReadingComponent() {
                   17 |   // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
                 > 18 |   const token = (cookies() as any).get('token')
                      |                                    ^
                   19 |
                   20 |   return (
                   21 |     <div> {
                   digest: '<error-digest>'
                 }

                 > Export encountered errors on following paths:
                 	/sync-cookies/page: /sync-cookies"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-cookies". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at a (bundler:///app/sync-cookies/page.tsx:18:36)
                     at b (<anonymous>)
                   16 | async function CookiesReadingComponent() {
                   17 |   // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
                 > 18 |   const token = (cookies() as any).get('token')
                      |                                    ^
                   19 |
                   20 |   return (
                   21 |     <div> {
                   digest: '<error-digest>'
                 }
                 Export encountered an error on /sync-cookies/page: /sync-cookies, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-cookies". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at CookiesReadingComponent (bundler:///app/sync-cookies/page.tsx:18:36)
                     at stringify (<anonymous>)
                   16 | async function CookiesReadingComponent() {
                   17 |   // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
                 > 18 |   const token = (cookies() as any).get('token')
                      |                                    ^
                   19 |
                   20 |   return (
                   21 |     <div> {
                   digest: '<error-digest>'
                 }

                 > Export encountered errors on following paths:
                 	/sync-cookies/page: /sync-cookies"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-cookies". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at a (<next-dist-dir>)
                     at b (<anonymous>) {
                   digest: '<error-digest>'
                 }
                 Export encountered an error on /sync-cookies/page: /sync-cookies, exiting the build."
                `)
              }
            }
          })
        }
      })

      describe('cookies at runtime', () => {
        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should show a redbox with a sync access error and a runtime error', async () => {
            const browser = await next.browser('/sync-cookies-runtime')

            if (isTurbopack) {
              await expect(browser).toDisplayRedbox(`
               [
                 {
                   "description": "Route "/sync-cookies-runtime" used \`cookies().get\`. \`cookies()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                   "environmentLabel": "Server",
                   "label": "Console Error",
                   "source": "app/sync-cookies-runtime/page.tsx (24:25) @ CookiesReadingComponent
               > 24 |   const token = (cookies() as any).get('token')
                    |                         ^",
                   "stack": [
                     "CookiesReadingComponent app/sync-cookies-runtime/page.tsx (24:25)",
                     "Page app/sync-cookies-runtime/page.tsx (14:9)",
                   ],
                 },
                 {
                   "description": "(0 , <turbopack-module-id>.cookies)(...).get is not a function",
                   "environmentLabel": "Server",
                   "label": "Runtime TypeError",
                   "source": "app/sync-cookies-runtime/page.tsx (24:36) @ CookiesReadingComponent
               > 24 |   const token = (cookies() as any).get('token')
                    |                                    ^",
                   "stack": [
                     "CookiesReadingComponent app/sync-cookies-runtime/page.tsx (24:36)",
                   ],
                 },
               ]
              `)
            } else if (isRspack) {
              await expect(browser).toDisplayRedbox(`
               [
                 {
                   "description": "Route "/sync-cookies-runtime" used \`cookies().get\`. \`cookies()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                   "environmentLabel": "Server",
                   "label": "Console Error",
                   "source": "app/sync-cookies-runtime/page.tsx (24:25) @ CookiesReadingComponent
               > 24 |   const token = (cookies() as any).get('token')
                    |                         ^",
                   "stack": [
                     "CookiesReadingComponent app/sync-cookies-runtime/page.tsx (24:25)",
                     "Page app/sync-cookies-runtime/page.tsx (14:9)",
                   ],
                 },
                 {
                   "description": "(0 , <webpack-module-id>.cookies)(...).get is not a function",
                   "environmentLabel": "Server",
                   "label": "Runtime TypeError",
                   "source": "app/sync-cookies-runtime/page.tsx (24:36) @ CookiesReadingComponent
               > 24 |   const token = (cookies() as any).get('token')
                    |                                    ^",
                   "stack": [
                     "CookiesReadingComponent app/sync-cookies-runtime/page.tsx (24:36)",
                   ],
                 },
               ]
              `)
            } else {
              await expect(browser).toDisplayRedbox(`
               [
                 {
                   "description": "Route "/sync-cookies-runtime" used \`cookies().get\`. \`cookies()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                   "environmentLabel": "Server",
                   "label": "Console Error",
                   "source": "app/sync-cookies-runtime/page.tsx (24:17) @ CookiesReadingComponent
               > 24 |   const token = (cookies() as any).get('token')
                    |                 ^",
                   "stack": [
                     "CookiesReadingComponent app/sync-cookies-runtime/page.tsx (24:17)",
                     "Page app/sync-cookies-runtime/page.tsx (14:9)",
                   ],
                 },
                 {
                   "description": "(0 , <webpack-module-id>.cookies)(...).get is not a function",
                   "environmentLabel": "Server",
                   "label": "Runtime TypeError",
                   "source": "app/sync-cookies-runtime/page.tsx (24:36) @ CookiesReadingComponent
               > 24 |   const token = (cookies() as any).get('token')
                    |                                    ^",
                   "stack": [
                     "CookiesReadingComponent app/sync-cookies-runtime/page.tsx (24:36)",
                   ],
                 },
               ]
              `)
            }
          })
        }
      })

      describe('draftMode', () => {
        const pathname = '/sync-draft-mode'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should return `undefined` for `draftMode().isEnabled`', async () => {
            const browser = await next.browser(`${pathname}`)

            expect(await browser.elementById('draft-mode').text()).toBe(
              'undefined'
            )
          })

          it('should show a collapsed redbox with a sync access error', async () => {
            const browser = await next.browser(`${pathname}`)

            if (isTurbopack) {
              await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "description": "Route "/sync-draft-mode" used \`draftMode().isEnabled\`. \`draftMode()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                 "environmentLabel": "Prerender",
                 "label": "Console Error",
                 "source": "app/sync-draft-mode/page.tsx (24:31) @ DraftModeReadingComponent
               > 24 |   const isEnabled = (draftMode() as any).isEnabled
                    |                               ^",
                 "stack": [
                   "DraftModeReadingComponent app/sync-draft-mode/page.tsx (24:31)",
                   "Page app/sync-draft-mode/page.tsx (13:7)",
                 ],
               }
              `)
            } else if (isRspack) {
              await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "description": "Route "/sync-draft-mode" used \`draftMode().isEnabled\`. \`draftMode()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                 "environmentLabel": "Prerender",
                 "label": "Console Error",
                 "source": "app/sync-draft-mode/page.tsx (24:31) @ DraftModeReadingComponent
               > 24 |   const isEnabled = (draftMode() as any).isEnabled
                    |                               ^",
                 "stack": [
                   "DraftModeReadingComponent app/sync-draft-mode/page.tsx (24:31)",
                   "Page app/sync-draft-mode/page.tsx (13:7)",
                 ],
               }
              `)
            } else {
              await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "description": "Route "/sync-draft-mode" used \`draftMode().isEnabled\`. \`draftMode()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                 "environmentLabel": "Prerender",
                 "label": "Console Error",
                 "source": "app/sync-draft-mode/page.tsx (24:21) @ DraftModeReadingComponent
               > 24 |   const isEnabled = (draftMode() as any).isEnabled
                    |                     ^",
                 "stack": [
                   "DraftModeReadingComponent app/sync-draft-mode/page.tsx (24:21)",
                   "Page app/sync-draft-mode/page.tsx (13:7)",
                 ],
               }
              `)
            }
          })
        }
      })

      describe('headers', () => {
        const pathname = '/sync-headers'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should show a redbox with a sync access error and a runtime error', async () => {
            const browser = await next.browser(`${pathname}`)

            if (isTurbopack) {
              await expect(browser).toDisplayRedbox(`
               [
                 {
                   "description": "Route "/sync-headers" used \`headers().get\`. \`headers()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                   "environmentLabel": "Prerender",
                   "label": "Console Error",
                   "source": "app/sync-headers/page.tsx (18:29) @ HeadersReadingComponent
               > 18 |   const userAgent = (headers() as any).get('user-agent')
                    |                             ^",
                   "stack": [
                     "HeadersReadingComponent app/sync-headers/page.tsx (18:29)",
                     "Page app/sync-headers/page.tsx (11:7)",
                   ],
                 },
                 {
                   "description": "(0 , <turbopack-module-id>.headers)(...).get is not a function",
                   "environmentLabel": "Prerender",
                   "label": "Runtime TypeError",
                   "source": "app/sync-headers/page.tsx (18:40) @ HeadersReadingComponent
               > 18 |   const userAgent = (headers() as any).get('user-agent')
                    |                                        ^",
                   "stack": [
                     "HeadersReadingComponent app/sync-headers/page.tsx (18:40)",
                   ],
                 },
               ]
              `)
            } else if (isRspack) {
              await expect(browser).toDisplayRedbox(`
               [
                 {
                   "description": "Route "/sync-headers" used \`headers().get\`. \`headers()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                   "environmentLabel": "Prerender",
                   "label": "Console Error",
                   "source": "app/sync-headers/page.tsx (18:29) @ HeadersReadingComponent
               > 18 |   const userAgent = (headers() as any).get('user-agent')
                    |                             ^",
                   "stack": [
                     "HeadersReadingComponent app/sync-headers/page.tsx (18:29)",
                     "Page app/sync-headers/page.tsx (11:7)",
                   ],
                 },
                 {
                   "description": "(0 , <webpack-module-id>.headers)(...).get is not a function",
                   "environmentLabel": "Prerender",
                   "label": "Runtime TypeError",
                   "source": "app/sync-headers/page.tsx (18:40) @ HeadersReadingComponent
               > 18 |   const userAgent = (headers() as any).get('user-agent')
                    |                                        ^",
                   "stack": [
                     "HeadersReadingComponent app/sync-headers/page.tsx (18:40)",
                   ],
                 },
               ]
              `)
            } else {
              await expect(browser).toDisplayRedbox(`
               [
                 {
                   "description": "Route "/sync-headers" used \`headers().get\`. \`headers()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                   "environmentLabel": "Prerender",
                   "label": "Console Error",
                   "source": "app/sync-headers/page.tsx (18:21) @ HeadersReadingComponent
               > 18 |   const userAgent = (headers() as any).get('user-agent')
                    |                     ^",
                   "stack": [
                     "HeadersReadingComponent app/sync-headers/page.tsx (18:21)",
                     "Page app/sync-headers/page.tsx (11:7)",
                   ],
                 },
                 {
                   "description": "(0 , <webpack-module-id>.headers)(...).get is not a function",
                   "environmentLabel": "Prerender",
                   "label": "Runtime TypeError",
                   "source": "app/sync-headers/page.tsx (18:40) @ HeadersReadingComponent
               > 18 |   const userAgent = (headers() as any).get('user-agent')
                    |                                        ^",
                   "stack": [
                     "HeadersReadingComponent app/sync-headers/page.tsx (18:40)",
                   ],
                 },
               ]
              `)
            }
          })
        } else {
          it('should error the build with a runtime error', async () => {
            try {
              await prerender(pathname)
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-headers". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at HeadersReadingComponent (bundler:///app/sync-headers/page.tsx:18:40)
                     at stringify (<anonymous>)
                   16 | async function HeadersReadingComponent() {
                   17 |   // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
                 > 18 |   const userAgent = (headers() as any).get('user-agent')
                      |                                        ^
                   19 |   return (
                   20 |     <div>
                   21 |       this component reads the \`user-agent\` header synchronously: {userAgent} {
                   digest: '<error-digest>'
                 }

                 > Export encountered errors on following paths:
                 	/sync-headers/page: /sync-headers"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-headers". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at a (bundler:///app/sync-headers/page.tsx:18:40)
                     at b (<anonymous>)
                   16 | async function HeadersReadingComponent() {
                   17 |   // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
                 > 18 |   const userAgent = (headers() as any).get('user-agent')
                      |                                        ^
                   19 |   return (
                   20 |     <div>
                   21 |       this component reads the \`user-agent\` header synchronously: {userAgent} {
                   digest: '<error-digest>'
                 }
                 Export encountered an error on /sync-headers/page: /sync-headers, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-headers". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at HeadersReadingComponent (bundler:///app/sync-headers/page.tsx:18:40)
                     at stringify (<anonymous>)
                   16 | async function HeadersReadingComponent() {
                   17 |   // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
                 > 18 |   const userAgent = (headers() as any).get('user-agent')
                      |                                        ^
                   19 |   return (
                   20 |     <div>
                   21 |       this component reads the \`user-agent\` header synchronously: {userAgent} {
                   digest: '<error-digest>'
                 }

                 > Export encountered errors on following paths:
                 	/sync-headers/page: /sync-headers"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-headers". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at a (<next-dist-dir>)
                     at b (<anonymous>) {
                   digest: '<error-digest>'
                 }
                 Export encountered an error on /sync-headers/page: /sync-headers, exiting the build."
                `)
              }
            }
          })
        }
      })

      describe('headers at runtime', () => {
        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should show a redbox with a sync access error and a runtime error', async () => {
            const browser = await next.browser('/sync-headers-runtime')

            if (isTurbopack) {
              await expect(browser).toDisplayRedbox(`
               [
                 {
                   "description": "Route "/sync-headers-runtime" used \`headers().get\`. \`headers()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                   "environmentLabel": "Server",
                   "label": "Console Error",
                   "source": "app/sync-headers-runtime/page.tsx (24:29) @ HeadersReadingComponent
               > 24 |   const userAgent = (headers() as any).get('user-agent')
                    |                             ^",
                   "stack": [
                     "HeadersReadingComponent app/sync-headers-runtime/page.tsx (24:29)",
                     "Page app/sync-headers-runtime/page.tsx (14:9)",
                   ],
                 },
                 {
                   "description": "(0 , <turbopack-module-id>.headers)(...).get is not a function",
                   "environmentLabel": "Server",
                   "label": "Runtime TypeError",
                   "source": "app/sync-headers-runtime/page.tsx (24:40) @ HeadersReadingComponent
               > 24 |   const userAgent = (headers() as any).get('user-agent')
                    |                                        ^",
                   "stack": [
                     "HeadersReadingComponent app/sync-headers-runtime/page.tsx (24:40)",
                   ],
                 },
               ]
              `)
            } else if (isRspack) {
              await expect(browser).toDisplayRedbox(`
               [
                 {
                   "description": "Route "/sync-headers-runtime" used \`headers().get\`. \`headers()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                   "environmentLabel": "Server",
                   "label": "Console Error",
                   "source": "app/sync-headers-runtime/page.tsx (24:29) @ HeadersReadingComponent
               > 24 |   const userAgent = (headers() as any).get('user-agent')
                    |                             ^",
                   "stack": [
                     "HeadersReadingComponent app/sync-headers-runtime/page.tsx (24:29)",
                     "Page app/sync-headers-runtime/page.tsx (14:9)",
                   ],
                 },
                 {
                   "description": "(0 , <webpack-module-id>.headers)(...).get is not a function",
                   "environmentLabel": "Server",
                   "label": "Runtime TypeError",
                   "source": "app/sync-headers-runtime/page.tsx (24:40) @ HeadersReadingComponent
               > 24 |   const userAgent = (headers() as any).get('user-agent')
                    |                                        ^",
                   "stack": [
                     "HeadersReadingComponent app/sync-headers-runtime/page.tsx (24:40)",
                   ],
                 },
               ]
              `)
            } else {
              await expect(browser).toDisplayRedbox(`
               [
                 {
                   "description": "Route "/sync-headers-runtime" used \`headers().get\`. \`headers()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                   "environmentLabel": "Server",
                   "label": "Console Error",
                   "source": "app/sync-headers-runtime/page.tsx (24:21) @ HeadersReadingComponent
               > 24 |   const userAgent = (headers() as any).get('user-agent')
                    |                     ^",
                   "stack": [
                     "HeadersReadingComponent app/sync-headers-runtime/page.tsx (24:21)",
                     "Page app/sync-headers-runtime/page.tsx (14:9)",
                   ],
                 },
                 {
                   "description": "(0 , <webpack-module-id>.headers)(...).get is not a function",
                   "environmentLabel": "Server",
                   "label": "Runtime TypeError",
                   "source": "app/sync-headers-runtime/page.tsx (24:40) @ HeadersReadingComponent
               > 24 |   const userAgent = (headers() as any).get('user-agent')
                    |                                        ^",
                   "stack": [
                     "HeadersReadingComponent app/sync-headers-runtime/page.tsx (24:40)",
                   ],
                 },
               ]
              `)
            }
          })
        }
      })

      describe('client params', () => {
        const pathname = '/sync-client-params'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should return `undefined` for `params.slug`', async () => {
            const browser = await next.browser(`${pathname}/test`)

            expect(await browser.elementById('param').text()).toBe('undefined')
          })

          it('should show a collapsed redbox with a sync access error', async () => {
            const browser = await next.browser(`${pathname}/test`)

            if (isTurbopack) {
              await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "description": "A param property was accessed directly with \`params.slug\`. \`params\` is a Promise and must be unwrapped with \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                 "environmentLabel": null,
                 "label": "Console Error",
                 "source": "app/sync-client-params/[slug]/page.tsx (20:39) @ ParamsReadingComponent
               > 20 |       <span id="param">{String(params.slug)}</span>
                    |                                       ^",
                 "stack": [
                   "ParamsReadingComponent app/sync-client-params/[slug]/page.tsx (20:39)",
                   "Page app/sync-client-params/[slug]/page.tsx (11:7)",
                 ],
               }
              `)
            } else {
              await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "description": "A param property was accessed directly with \`params.slug\`. \`params\` is a Promise and must be unwrapped with \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                 "environmentLabel": null,
                 "label": "Console Error",
                 "source": "app/sync-client-params/[slug]/page.tsx (20:39) @ ParamsReadingComponent
               > 20 |       <span id="param">{String(params.slug)}</span>
                    |                                       ^",
                 "stack": [
                   "ParamsReadingComponent app/sync-client-params/[slug]/page.tsx (20:39)",
                   "Page app/sync-client-params/[slug]/page.tsx (11:7)",
                 ],
               }
              `)
            }
          })
        }
      })

      describe('server params', () => {
        const pathname = '/sync-server-params'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should return `undefined` for `params.slug`', async () => {
            const browser = await next.browser(`${pathname}/test`)

            expect(await browser.elementById('param').text()).toBe('undefined')
          })

          it('should show a collapsed redbox with a sync access error', async () => {
            const browser = await next.browser(`${pathname}/test`)

            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-server-params/[slug]" used \`params.slug\`. \`params\` is a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/sync-server-params/[slug]/page.tsx (24:39) @ ParamsReadingComponent
             > 24 |       <span id="param">{String(params.slug)}</span>
                  |                                       ^",
               "stack": [
                 "ParamsReadingComponent app/sync-server-params/[slug]/page.tsx (24:39)",
                 "Page app/sync-server-params/[slug]/page.tsx (12:7)",
               ],
             }
            `)
          })
        }
      })
    })

    describe('Error Attribution with Sync IO', () => {
      describe('Guarded RSC with guarded Client sync IO', () => {
        const pathname = '/sync-attribution/guarded-async-guarded-clientsync'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('does not show a validation error in the dev overlay', async () => {
            const browser = await next.browser(pathname)
            await assertNoErrorToast(browser)
          })
        } else {
          it('should not error the build sync IO is used inside a Suspense Boundary in a client Component and nothing else is dynamic', async () => {
            try {
              await prerender(pathname)
            } catch (error) {
              throw new Error('expected build not to fail', { cause: error })
            }

            expect(next.cliOutput).toContain(`◐ ${pathname}`)
          })
        }
      })

      describe('Guarded RSC with unguarded Client sync IO', () => {
        const pathname = '/sync-attribution/guarded-async-unguarded-clientsync'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should show a collapsed redbox error', async () => {
            const browser = await next.browser(pathname)

            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-attribution/guarded-async-unguarded-clientsync" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx (5:16) @ SyncIO
             > 5 |   const data = new Date().toISOString()
                 |                ^",
               "stack": [
                 "SyncIO app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx (5:16)",
                 "Page app/sync-attribution/guarded-async-unguarded-clientsync/page.tsx (22:9)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          })
        } else {
          it('should error the build with a reason related to sync IO access', async () => {
            try {
              await prerender(pathname)
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/guarded-async-unguarded-clientsync" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
                     at SyncIO (bundler:///app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx:5:16)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |                ^
                   6 |
                   7 |   return (
                   8 |     <main>
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-attribution/guarded-async-unguarded-clientsync" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-attribution/guarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/sync-attribution/guarded-async-unguarded-clientsync/page: /sync-attribution/guarded-async-unguarded-clientsync"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/guarded-async-unguarded-clientsync" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
                     at a (bundler:///app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx:5:16)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |                ^
                   6 |
                   7 |   return (
                   8 |     <main>
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-attribution/guarded-async-unguarded-clientsync" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-attribution/guarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-attribution/guarded-async-unguarded-clientsync/page: /sync-attribution/guarded-async-unguarded-clientsync, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/guarded-async-unguarded-clientsync" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
                     at SyncIO (bundler:///app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx:5:16)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |                ^
                   6 |
                   7 |   return (
                   8 |     <main>
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-attribution/guarded-async-unguarded-clientsync" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-attribution/guarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/sync-attribution/guarded-async-unguarded-clientsync/page: /sync-attribution/guarded-async-unguarded-clientsync"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/guarded-async-unguarded-clientsync" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
                     at a (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-attribution/guarded-async-unguarded-clientsync" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-attribution/guarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-attribution/guarded-async-unguarded-clientsync/page: /sync-attribution/guarded-async-unguarded-clientsync, exiting the build."
                `)
              }
            }
          })
        }
      })

      describe('Unguarded RSC with guarded Client sync IO', () => {
        const pathname = '/sync-attribution/unguarded-async-guarded-clientsync'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should show a collapsed redbox error', async () => {
            const browser = await next.browser(pathname)

            if (isTurbopack) {
              await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "description": "Route "/sync-attribution/unguarded-async-guarded-clientsync": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx (34:18) @ RequestData
               > 34 |   ;(await cookies()).get('foo')
                    |                  ^",
                 "stack": [
                   "RequestData app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx (34:18)",
                   "Page app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx (27:9)",
                   "LogSafely <anonymous>",
                 ],
               }
              `)
            } else {
              await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "description": "Route "/sync-attribution/unguarded-async-guarded-clientsync": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx (34:18) @ RequestData
               > 34 |   ;(await cookies()).get('foo')
                    |                  ^",
                 "stack": [
                   "RequestData app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx (34:18)",
                   "Page app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx (27:9)",
                   "LogSafely <anonymous>",
                 ],
               }
              `)
            }
          })
        } else {
          it('should error the build with a reason related dynamic data', async () => {
            try {
              await prerender(pathname)
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-guarded-clientsync": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                     at section (<anonymous>)
                     at main (<anonymous>)
                     at RenderFromTemplateContext (<anonymous>)
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                     at RenderFromTemplateContext (<anonymous>)
                     at RenderFromTemplateContext (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-guarded-clientsync" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-guarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/sync-attribution/unguarded-async-guarded-clientsync/page: /sync-attribution/unguarded-async-guarded-clientsync"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-guarded-clientsync": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                     at a (<anonymous>)
                     at main (<anonymous>)
                     at b (<anonymous>)
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                     at c (<anonymous>)
                     at d (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-guarded-clientsync" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-guarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-attribution/unguarded-async-guarded-clientsync/page: /sync-attribution/unguarded-async-guarded-clientsync, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-guarded-clientsync": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                     at section (<anonymous>)
                     at main (<anonymous>)
                     at InnerLayoutRouter (bundler:///<next-src>)
                     at RedirectErrorBoundary (bundler:///<next-src>)
                     at RedirectBoundary (bundler:///<next-src>)
                     at HTTPAccessFallbackBoundary (bundler:///<next-src>)
                     at LoadingBoundary (bundler:///<next-src>)
                     at ErrorBoundary (bundler:///<next-src>)
                     at InnerScrollAndFocusHandler (bundler:///<next-src>)
                     at ScrollAndFocusHandler (bundler:///<next-src>)
                     at RenderFromTemplateContext (<anonymous>)
                     at OuterLayoutRouter (bundler:///<next-src>)
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                     at InnerLayoutRouter (bundler:///<next-src>)
                     at RedirectErrorBoundary (bundler:///<next-src>)
                     at RedirectBoundary (bundler:///<next-src>)
                     at HTTPAccessFallbackBoundary (bundler:///<next-src>)
                     at LoadingBoundary (bundler:///<next-src>)
                     at ErrorBoundary (bundler:///<next-src>)
                     at InnerScrollAndFocusHandler (bundler:///<next-src>)
                     at ScrollAndFocusHandler (bundler:///<next-src>)
                     at RenderFromTemplateContext (<anonymous>)
                     at OuterLayoutRouter (bundler:///<next-src>)
                     at InnerLayoutRouter (bundler:///<next-src>)
                     at RedirectErrorBoundary (bundler:///<next-src>)
                     at RedirectBoundary (bundler:///<next-src>)
                     at HTTPAccessFallbackErrorBoundary (bundler:///<next-src>)
                     at HTTPAccessFallbackBoundary (bundler:///<next-src>)
                     at LoadingBoundary (bundler:///<next-src>)
                     at ErrorBoundary (bundler:///<next-src>)
                     at InnerScrollAndFocusHandler (bundler:///<next-src>)
                     at ScrollAndFocusHandler (bundler:///<next-src>)
                     at RenderFromTemplateContext (<anonymous>)
                     at OuterLayoutRouter (bundler:///<next-src>)
                   340 |  */
                   341 | function InnerLayoutRouter({
                 > 342 |   tree,
                       |   ^
                   343 |   segmentPath,
                   344 |   debugNameContext,
                   345 |   cacheNode,
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-guarded-clientsync" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-guarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/sync-attribution/unguarded-async-guarded-clientsync/page: /sync-attribution/unguarded-async-guarded-clientsync"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-guarded-clientsync": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                     at a (<anonymous>)
                     at main (<anonymous>)
                     at b (<next-dist-dir>)
                     at c (<next-dist-dir>)
                     at d (<next-dist-dir>)
                     at e (<next-dist-dir>)
                     at f (<next-dist-dir>)
                     at g (<next-dist-dir>)
                     at h (<next-dist-dir>)
                     at i (<next-dist-dir>)
                     at j (<anonymous>)
                     at k (<next-dist-dir>)
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                     at l (<next-dist-dir>)
                     at m (<next-dist-dir>)
                     at n (<next-dist-dir>)
                     at o (<next-dist-dir>)
                     at p (<next-dist-dir>)
                     at q (<next-dist-dir>)
                     at r (<next-dist-dir>)
                     at s (<next-dist-dir>)
                     at t (<anonymous>)
                     at u (<next-dist-dir>)
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
                     at c (<next-dist-dir>)
                     at d (<next-dist-dir>)
                     at e (<anonymous>)
                     at f (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-guarded-clientsync" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-guarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-attribution/unguarded-async-guarded-clientsync/page: /sync-attribution/unguarded-async-guarded-clientsync, exiting the build."
                `)
              }
            }
          })
        }
      })

      describe('unguarded RSC with unguarded Client sync IO', () => {
        const pathname =
          '/sync-attribution/unguarded-async-unguarded-clientsync'

        if (skipped) {
          return
        }

        if (isNextDev) {
          it('should show a collapsed redbox error', async () => {
            const browser = await next.browser(pathname)

            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-attribution/unguarded-async-unguarded-clientsync" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx (5:16) @ SyncIO
             > 5 |   const data = new Date().toISOString()
                 |                ^",
               "stack": [
                 "SyncIO app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx (5:16)",
                 "Page app/sync-attribution/unguarded-async-unguarded-clientsync/page.tsx (22:9)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          })
        } else {
          it('should error the build with a reason related to sync IO access', async () => {
            try {
              await prerender(pathname)
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-unguarded-clientsync" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
                     at SyncIO (bundler:///app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx:5:16)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |                ^
                   6 |
                   7 |   return (
                   8 |     <main>
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-unguarded-clientsync" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/sync-attribution/unguarded-async-unguarded-clientsync/page: /sync-attribution/unguarded-async-unguarded-clientsync"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-unguarded-clientsync" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
                     at a (bundler:///app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx:5:16)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |                ^
                   6 |
                   7 |   return (
                   8 |     <main>
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-unguarded-clientsync" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-attribution/unguarded-async-unguarded-clientsync/page: /sync-attribution/unguarded-async-unguarded-clientsync, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-unguarded-clientsync" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
                     at SyncIO (bundler:///app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx:5:16)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |                ^
                   6 |
                   7 |   return (
                   8 |     <main>
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-unguarded-clientsync" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/sync-attribution/unguarded-async-unguarded-clientsync/page: /sync-attribution/unguarded-async-unguarded-clientsync"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-unguarded-clientsync" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
                     at a (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-unguarded-clientsync" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-attribution/unguarded-async-unguarded-clientsync/page: /sync-attribution/unguarded-async-unguarded-clientsync, exiting the build."
                `)
              }
            }
          })
        }
      })
    })

    describe('Inside `use cache`', () => {
      describe('cookies', () => {
        const pathname = '/use-cache-cookies'

        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser(pathname)

            if (isTurbopack) {
              await expect(browser).toDisplayRedbox(`
               {
                 "description": "Route /use-cache-cookies used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-cookies/page.tsx (22:18) @ CookiesReadingComponent
               > 22 |     await cookies()
                    |                  ^",
                 "stack": [
                   "CookiesReadingComponent app/use-cache-cookies/page.tsx (22:18)",
                 ],
               }
              `)
            } else {
              await expect(browser).toDisplayRedbox(`
               {
                 "description": "Route /use-cache-cookies used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-cookies/page.tsx (22:18) @ CookiesReadingComponent
               > 22 |     await cookies()
                    |                  ^",
                 "stack": [
                   "CookiesReadingComponent app/use-cache-cookies/page.tsx (22:18)",
                 ],
               }
              `)
            }
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender(pathname)
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-cookies used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at CookiesReadingComponent (bundler:///app/use-cache-cookies/page.tsx:22:18)
                   20 |   // in userland.
                   21 |   try {
                 > 22 |     await cookies()
                      |                  ^
                   23 |   } catch {}
                   24 |
                   25 |   return null
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-cookies" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-cookies". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-cookies/page: /use-cache-cookies"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-cookies used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at <unknown> (bundler:///app/use-cache-cookies/page.tsx:22:11)
                   20 |   // in userland.
                   21 |   try {
                 > 22 |     await cookies()
                      |           ^
                   23 |   } catch {}
                   24 |
                   25 |   return null
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-cookies" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-cookies". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-cookies/page: /use-cache-cookies, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-cookies used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at CookiesReadingComponent (bundler:///app/use-cache-cookies/page.tsx:22:18)
                     at <unknown> (bundler:///<next-src>)
                   20 |   // in userland.
                   21 |   try {
                 > 22 |     await cookies()
                      |                  ^
                   23 |   } catch {}
                   24 |
                   25 |   return null
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-cookies" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-cookies". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-cookies/page: /use-cache-cookies"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-cookies used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
                     at c (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-cookies" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-cookies". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-cookies/page: /use-cache-cookies, exiting the build."
                `)
              }
            }
          })
        }
      })

      describe('draftMode', () => {
        const pathname = '/use-cache-draft-mode'

        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser(pathname)

            if (isTurbopack) {
              await expect(browser).toDisplayRedbox(`
               {
                 "description": "Route /use-cache-draft-mode used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-draft-mode/page.tsx (20:26) @ DraftModeEnablingComponent
               > 20 |     ;(await draftMode()).enable()
                    |                          ^",
                 "stack": [
                   "DraftModeEnablingComponent app/use-cache-draft-mode/page.tsx (20:26)",
                 ],
               }
              `)
            } else {
              await expect(browser).toDisplayRedbox(`
               {
                 "description": "Route /use-cache-draft-mode used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-draft-mode/page.tsx (20:26) @ DraftModeEnablingComponent
               > 20 |     ;(await draftMode()).enable()
                    |                          ^",
                 "stack": [
                   "DraftModeEnablingComponent app/use-cache-draft-mode/page.tsx (20:26)",
                 ],
               }
              `)
            }
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender(pathname)
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-draft-mode used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at DraftModeEnablingComponent (bundler:///app/use-cache-draft-mode/page.tsx:20:26)
                   18 |   // here to ensure that this error is shown even when it's caught in userland.
                   19 |   try {
                 > 20 |     ;(await draftMode()).enable()
                      |                          ^
                   21 |   } catch {}
                   22 |
                   23 |   return null
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-draft-mode" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-draft-mode". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-draft-mode/page: /use-cache-draft-mode"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-draft-mode used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at <unknown> (bundler:///app/use-cache-draft-mode/page.tsx:20:26)
                   18 |   // here to ensure that this error is shown even when it's caught in userland.
                   19 |   try {
                 > 20 |     ;(await draftMode()).enable()
                      |                          ^
                   21 |   } catch {}
                   22 |
                   23 |   return null
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-draft-mode" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-draft-mode". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-draft-mode/page: /use-cache-draft-mode, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-draft-mode used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at DraftModeEnablingComponent (bundler:///app/use-cache-draft-mode/page.tsx:20:26)
                   18 |   // here to ensure that this error is shown even when it's caught in userland.
                   19 |   try {
                 > 20 |     ;(await draftMode()).enable()
                      |                          ^
                   21 |   } catch {}
                   22 |
                   23 |   return null
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-draft-mode" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-draft-mode". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-draft-mode/page: /use-cache-draft-mode"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-draft-mode used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at a (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-draft-mode" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-draft-mode". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-draft-mode/page: /use-cache-draft-mode, exiting the build."
                `)
              }
            }
          })
        }
      })

      describe('headers', () => {
        const pathname = '/use-cache-headers'

        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser(pathname)

            if (isTurbopack) {
              await expect(browser).toDisplayRedbox(`
               {
                 "description": "Route /use-cache-headers used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-headers/page.tsx (21:18) @ HeadersReadingComponent
               > 21 |     await headers()
                    |                  ^",
                 "stack": [
                   "HeadersReadingComponent app/use-cache-headers/page.tsx (21:18)",
                 ],
               }
              `)
            } else {
              await expect(browser).toDisplayRedbox(`
               {
                 "description": "Route /use-cache-headers used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-headers/page.tsx (21:18) @ HeadersReadingComponent
               > 21 |     await headers()
                    |                  ^",
                 "stack": [
                   "HeadersReadingComponent app/use-cache-headers/page.tsx (21:18)",
                 ],
               }
              `)
            }
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender(pathname)
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-headers used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at HeadersReadingComponent (bundler:///app/use-cache-headers/page.tsx:21:18)
                   19 |   // to ensure that this error is shown even when it's caught in userland.
                   20 |   try {
                 > 21 |     await headers()
                      |                  ^
                   22 |   } catch {}
                   23 |
                   24 |   return null
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-headers" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-headers". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-headers/page: /use-cache-headers"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-headers used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at <unknown> (bundler:///app/use-cache-headers/page.tsx:21:11)
                   19 |   // to ensure that this error is shown even when it's caught in userland.
                   20 |   try {
                 > 21 |     await headers()
                      |           ^
                   22 |   } catch {}
                   23 |
                   24 |   return null
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-headers" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-headers". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-headers/page: /use-cache-headers, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-headers used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at HeadersReadingComponent (bundler:///app/use-cache-headers/page.tsx:21:18)
                     at <unknown> (bundler:///<next-src>)
                   19 |   // to ensure that this error is shown even when it's caught in userland.
                   20 |   try {
                 > 21 |     await headers()
                      |                  ^
                   22 |   } catch {}
                   23 |
                   24 |   return null
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-headers" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-headers". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-headers/page: /use-cache-headers"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-headers used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
                     at c (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-headers" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-headers". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-headers/page: /use-cache-headers, exiting the build."
                `)
              }
            }
          })
        }
      })
    })

    describe('With `use cache: private`', () => {
      describe('in `unstable_cache`', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser(
              '/use-cache-private-in-unstable-cache'
            )

            if (isTurbopack) {
              await expect(browser).toDisplayRedbox(`
               {
                 "description": ""use cache: private" must not be used within \`unstable_cache()\`.",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-private-in-unstable-cache/page.tsx (21:38) @ module evaluation
               > 21 | const getCachedData = unstable_cache(async () => {
                    |                                      ^",
                 "stack": [
                   "module evaluation app/use-cache-private-in-unstable-cache/page.tsx (21:38)",
                   "<FIXME-next-dist-dir>",
                 ],
               }
              `)
            } else if (isRspack) {
              await expect(browser).toDisplayRedbox(`
               {
                 "description": ""use cache: private" must not be used within \`unstable_cache()\`.",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-private-in-unstable-cache/page.tsx (21:38) @ eval
               > 21 | const getCachedData = unstable_cache(async () => {
                    |                                      ^",
                 "stack": [
                   "eval app/use-cache-private-in-unstable-cache/page.tsx (21:38)",
                   "<FIXME-next-dist-dir>",
                   "<FIXME-next-dist-dir>",
                 ],
               }
              `)
            } else {
              await expect(browser).toDisplayRedbox(`
               {
                 "description": ""use cache: private" must not be used within \`unstable_cache()\`.",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-private-in-unstable-cache/page.tsx (21:38) @ eval
               > 21 | const getCachedData = unstable_cache(async () => {
                    |                                      ^",
                 "stack": [
                   "eval app/use-cache-private-in-unstable-cache/page.tsx (21:38)",
                   "<FIXME-next-dist-dir>",
                 ],
               }
              `)
            }
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-private-in-unstable-cache')
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within \`unstable_cache()\`.
                     at module evaluation (bundler:///app/use-cache-private-in-unstable-cache/page.tsx:21:38)
                     at a (<next-dist-dir>)
                   19 | }
                   20 |
                 > 21 | const getCachedData = unstable_cache(async () => {
                      |                                      ^
                   22 |   'use cache: private'
                   23 |
                   24 |   return fetch('https://next-data-api-endpoint.vercel.app/api/random').then(
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-unstable-cache" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-in-unstable-cache". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-private-in-unstable-cache/page: /use-cache-private-in-unstable-cache"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within \`unstable_cache()\`.
                     at module evaluation (bundler:///app/use-cache-private-in-unstable-cache/page.tsx:21:38)
                   19 | }
                   20 |
                 > 21 | const getCachedData = unstable_cache(async () => {
                      |                                      ^
                   22 |   'use cache: private'
                   23 |
                   24 |   return fetch('https://next-data-api-endpoint.vercel.app/api/random').then(
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-unstable-cache" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-in-unstable-cache". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-in-unstable-cache/page: /use-cache-private-in-unstable-cache, exiting the build."
                `)
              }
            } else if (isRspack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within \`unstable_cache()\`.
                     at 0 (bundler:///app/use-cache-private-in-unstable-cache/page.tsx:21:38)
                     at a (<next-dist-dir>)
                   19 | }
                   20 |
                 > 21 | const getCachedData = unstable_cache(async () => {
                      |                                      ^
                   22 |   'use cache: private'
                   23 |
                   24 |   return fetch('https://next-data-api-endpoint.vercel.app/api/random').then(
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-unstable-cache" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-in-unstable-cache". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-private-in-unstable-cache/page: /use-cache-private-in-unstable-cache"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within \`unstable_cache()\`.
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-unstable-cache" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-in-unstable-cache". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-in-unstable-cache/page: /use-cache-private-in-unstable-cache, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within \`unstable_cache()\`.
                     at 0 (bundler:///app/use-cache-private-in-unstable-cache/page.tsx:21:38)
                   19 | }
                   20 |
                 > 21 | const getCachedData = unstable_cache(async () => {
                      |                                      ^
                   22 |   'use cache: private'
                   23 |
                   24 |   return fetch('https://next-data-api-endpoint.vercel.app/api/random').then(
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-unstable-cache" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-in-unstable-cache". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-private-in-unstable-cache/page: /use-cache-private-in-unstable-cache"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within \`unstable_cache()\`.
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-unstable-cache" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-in-unstable-cache". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-in-unstable-cache/page: /use-cache-private-in-unstable-cache, exiting the build."
                `)
              }
            }
          })
        }
      })

      describe('in `use cache`', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser(
              '/use-cache-private-in-use-cache'
            )

            if (isTurbopack) {
              await expect(browser).toDisplayRedbox(`
               {
                 "description": ""use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-private-in-use-cache/page.tsx (15:1) @ module evaluation
               > 15 | async function Private() {
                    | ^",
                 "stack": [
                   "module evaluation app/use-cache-private-in-use-cache/page.tsx (15:1)",
                   "<FIXME-next-dist-dir>",
                 ],
               }
              `)
            } else if (isRspack) {
              await expect(browser).toDisplayRedbox(`
               {
                 "description": ""use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-private-in-use-cache/page.tsx (15:1) @ eval
               > 15 | async function Private() {
                    | ^",
                 "stack": [
                   "eval app/use-cache-private-in-use-cache/page.tsx (15:1)",
                   "<FIXME-next-dist-dir>",
                   "<FIXME-next-dist-dir>",
                 ],
               }
              `)
            } else {
              await expect(browser).toDisplayRedbox(`
               {
                 "description": ""use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-private-in-use-cache/page.tsx (15:1) @ eval
               > 15 | async function Private() {
                    | ^",
                 "stack": [
                   "eval app/use-cache-private-in-use-cache/page.tsx (15:1)",
                   "<FIXME-next-dist-dir>",
                 ],
               }
              `)
            }
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-private-in-use-cache')
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            // TODO: Ideally, the error should only be shown once.
            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at module evaluation (bundler:///app/use-cache-private-in-use-cache/page.tsx:15:1)
                     at a (<next-dist-dir>)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p>
                 Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at module evaluation (bundler:///app/use-cache-private-in-use-cache/page.tsx:15:1)
                     at b (<next-dist-dir>)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p>
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-use-cache" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-in-use-cache". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-private-in-use-cache/page: /use-cache-private-in-use-cache"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at module evaluation (bundler:///app/use-cache-private-in-use-cache/page.tsx:15:1)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p>
                 Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at module evaluation (bundler:///app/use-cache-private-in-use-cache/page.tsx:15:1)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p>
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-use-cache" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-in-use-cache". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-in-use-cache/page: /use-cache-private-in-use-cache, exiting the build."
                `)
              }
            } else if (isRspack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at 0 (bundler:///app/use-cache-private-in-use-cache/page.tsx:15:1)
                     at a (<next-dist-dir>)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p>
                 Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at 1 (bundler:///app/use-cache-private-in-use-cache/page.tsx:15:1)
                     at b (<next-dist-dir>)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p>
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-use-cache" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-in-use-cache". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-private-in-use-cache/page: /use-cache-private-in-use-cache"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
                 Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at c (<next-dist-dir>)
                     at d (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-use-cache" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-in-use-cache". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-in-use-cache/page: /use-cache-private-in-use-cache, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at 0 (bundler:///app/use-cache-private-in-use-cache/page.tsx:15:1)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p>
                 Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at 1 (bundler:///app/use-cache-private-in-use-cache/page.tsx:15:1)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p>
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-use-cache" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-in-use-cache". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-private-in-use-cache/page: /use-cache-private-in-use-cache"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
                 Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at c (<next-dist-dir>)
                     at d (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-use-cache" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-in-use-cache". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-in-use-cache/page: /use-cache-private-in-use-cache, exiting the build."
                `)
              }
            }
          })
        }
      })

      describe('without Suspense', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser(
              '/use-cache-private-without-suspense'
            )

            if (isTurbopack) {
              await expect(browser).toDisplayCollapsedRedbox(
                `"Redbox did not open."`
              )
            } else {
              await expect(browser).toDisplayCollapsedRedbox(
                `"Redbox did not open."`
              )
            }
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-private-without-suspense')
            } catch {
              // we expect the build to fail
            }

            const output = getPrerenderOutput(
              next.cliOutput.slice(cliOutputLength),
              { isMinified: !isDebugPrerender }
            )

            if (isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/use-cache-private-without-suspense": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-without-suspense" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-without-suspense". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-private-without-suspense/page: /use-cache-private-without-suspense"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/use-cache-private-without-suspense": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-without-suspense" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-without-suspense". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-without-suspense/page: /use-cache-private-without-suspense, exiting the build."
                `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/use-cache-private-without-suspense": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                     at InnerLayoutRouter (bundler:///<next-src>)
                     at RedirectErrorBoundary (bundler:///<next-src>)
                     at RedirectBoundary (bundler:///<next-src>)
                     at HTTPAccessFallbackBoundary (bundler:///<next-src>)
                     at LoadingBoundary (bundler:///<next-src>)
                     at ErrorBoundary (bundler:///<next-src>)
                     at InnerScrollAndFocusHandler (bundler:///<next-src>)
                     at ScrollAndFocusHandler (bundler:///<next-src>)
                     at RenderFromTemplateContext (bundler:///<next-src>)
                     at OuterLayoutRouter (bundler:///<next-src>)
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                     at InnerLayoutRouter (bundler:///<next-src>)
                     at RedirectErrorBoundary (bundler:///<next-src>)
                     at RedirectBoundary (bundler:///<next-src>)
                     at HTTPAccessFallbackErrorBoundary (bundler:///<next-src>)
                     at HTTPAccessFallbackBoundary (bundler:///<next-src>)
                     at LoadingBoundary (bundler:///<next-src>)
                     at ErrorBoundary (bundler:///<next-src>)
                     at InnerScrollAndFocusHandler (bundler:///<next-src>)
                     at ScrollAndFocusHandler (bundler:///<next-src>)
                     at RenderFromTemplateContext (bundler:///<next-src>)
                     at OuterLayoutRouter (bundler:///<next-src>)
                   340 |  */
                   341 | function InnerLayoutRouter({
                 > 342 |   tree,
                       |   ^
                   343 |   segmentPath,
                   344 |   debugNameContext,
                   345 |   cacheNode,
                 To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-without-suspense" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-without-suspense". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on following paths:
                 	/use-cache-private-without-suspense/page: /use-cache-private-without-suspense"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/use-cache-private-without-suspense": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
                     at c (<next-dist-dir>)
                     at d (<next-dist-dir>)
                     at e (<next-dist-dir>)
                     at f (<next-dist-dir>)
                     at g (<next-dist-dir>)
                     at h (<next-dist-dir>)
                     at i (<next-dist-dir>)
                     at j (<next-dist-dir>)
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                     at k (<next-dist-dir>)
                     at l (<next-dist-dir>)
                     at m (<next-dist-dir>)
                     at n (<next-dist-dir>)
                     at o (<next-dist-dir>)
                     at p (<next-dist-dir>)
                     at q (<next-dist-dir>)
                     at r (<next-dist-dir>)
                     at s (<next-dist-dir>)
                     at t (<next-dist-dir>)
                     at u (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-without-suspense" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-without-suspense". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-without-suspense/page: /use-cache-private-without-suspense, exiting the build."
                `)
              }
            }
          })
        }
      })

      describe('with `connection()`', () => {
        if (isNextDev) {
          // TODO(restart-on-cache-miss): This error is written to `workStore.invalidDynamicUsageError`.
          // There's currently a race on whether these show up as
          // - a runtime error (thrown from `renderToHTMLOrFlightImpl`, after the RSC render)
          // - a console error (from inside `spawnDynamicValidationInDev`)
          // - nothing (if the error happens after SSR starts and after the prospective validation render finishes)
          // Ideally, these would always be a runtime error, but some recent timing changes break it.
          it.skip('should show a redbox error', async () => {
            const browser = await next.browser('/use-cache-private-connection')

            if (isTurbopack) {
              await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "description": "Route /use-cache-private-connection used \`connection()\` inside "use cache: private". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual navigation request, but caches must be able to be produced before a navigation request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-private-connection/page.tsx (25:21) @ Private
               > 25 |     await connection()
                    |                     ^",
                 "stack": [
                   "Private app/use-cache-private-connection/page.tsx (25:21)",
                 ],
               }
              `)
            } else {
              await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "description": "Route /use-cache-private-connection used \`connection()\` inside "use cache: private". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual navigation request, but caches must be able to be produced before a navigation request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-private-connection/page.tsx (25:21) @ Private
               > 25 |     await connection()
                    |                     ^",
                 "stack": [
                   "Private app/use-cache-private-connection/page.tsx (25:21)",
                 ],
               }
              `)
            }
          })
        } else {
          // TODO: With prefetch sentinels this should yield a build error.
          it('should not fail the build and show no runtime error (caught in userland)', async () => {
            await prerender('/use-cache-private-connection')
            await next.start({ skipBuild: true })

            const browser = await next.browser(
              '/use-cache-private-connection',
              { pushErrorAsConsoleLog: true }
            )

            expect(await browser.elementById('private').text()).toBe('Private')

            expect(await browser.log()).not.toContainEqual(
              expect.objectContaining({ source: 'error' })
            )

            expect(next.cliOutput.slice(cliOutputLength)).not.toInclude('Error')
          })
        }
      })
    })

    describe('Sync IO - Current Time - Date()', () => {
      const pathname = '/sync-io-current-time/date'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/sync-io-current-time/date" used \`Date()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/sync-io-current-time/date/page.tsx (19:16) @ DateReadingComponent
           > 19 |   return <div>{Date()}</div>
                |                ^",
             "stack": [
               "DateReadingComponent app/sync-io-current-time/date/page.tsx (19:16)",
               "Page app/sync-io-current-time/date/page.tsx (11:9)",
               "LogSafely <anonymous>",
             ],
           }
          `)
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date" used \`Date()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time
                   at DateReadingComponent (bundler:///app/sync-io-current-time/date/page.tsx:19:16)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Date()}</div>
                    |                ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/date" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-current-time/date". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-current-time/date/page: /sync-io-current-time/date"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date" used \`Date()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time
                   at a (bundler:///app/sync-io-current-time/date/page.tsx:19:16)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Date()}</div>
                    |                ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/date" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-current-time/date". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-current-time/date/page: /sync-io-current-time/date, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date" used \`Date()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time
                   at DateReadingComponent (bundler:///app/sync-io-current-time/date/page.tsx:19:16)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Date()}</div>
                    |                ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/date" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-current-time/date". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-current-time/date/page: /sync-io-current-time/date"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date" used \`Date()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/date" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-current-time/date". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-current-time/date/page: /sync-io-current-time/date, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Current Time - Date.now()', () => {
      const pathname = '/sync-io-current-time/date-now'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/sync-io-current-time/date-now" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/sync-io-current-time/date-now/page.tsx (19:21) @ DateReadingComponent
           > 19 |   return <div>{Date.now()}</div>
                |                     ^",
             "stack": [
               "DateReadingComponent app/sync-io-current-time/date-now/page.tsx (19:21)",
               "Page app/sync-io-current-time/date-now/page.tsx (11:9)",
               "LogSafely <anonymous>",
             ],
           }
          `)
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date-now" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time
                   at DateReadingComponent (bundler:///app/sync-io-current-time/date-now/page.tsx:19:21)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Date.now()}</div>
                    |                     ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/date-now" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-current-time/date-now". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-current-time/date-now/page: /sync-io-current-time/date-now"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date-now" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time
                   at a (bundler:///app/sync-io-current-time/date-now/page.tsx:19:21)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Date.now()}</div>
                    |                     ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/date-now" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-current-time/date-now". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-current-time/date-now/page: /sync-io-current-time/date-now, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date-now" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time
                   at DateReadingComponent (bundler:///app/sync-io-current-time/date-now/page.tsx:19:21)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Date.now()}</div>
                    |                     ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/date-now" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-current-time/date-now". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-current-time/date-now/page: /sync-io-current-time/date-now"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date-now" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/date-now" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-current-time/date-now". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-current-time/date-now/page: /sync-io-current-time/date-now, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Current Time - new Date()', () => {
      const pathname = '/sync-io-current-time/new-date'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/sync-io-current-time/new-date" used \`new Date()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/sync-io-current-time/new-date/page.tsx (19:16) @ DateReadingComponent
           > 19 |   return <div>{new Date().toString()}</div>
                |                ^",
             "stack": [
               "DateReadingComponent app/sync-io-current-time/new-date/page.tsx (19:16)",
               "Page app/sync-io-current-time/new-date/page.tsx (11:9)",
               "LogSafely <anonymous>",
             ],
           }
          `)
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/new-date" used \`new Date()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time
                   at DateReadingComponent (bundler:///app/sync-io-current-time/new-date/page.tsx:19:16)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{new Date().toString()}</div>
                    |                ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/new-date" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-current-time/new-date". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-current-time/new-date/page: /sync-io-current-time/new-date"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/new-date" used \`new Date()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time
                   at a (bundler:///app/sync-io-current-time/new-date/page.tsx:19:16)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{new Date().toString()}</div>
                    |                ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/new-date" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-current-time/new-date". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-current-time/new-date/page: /sync-io-current-time/new-date, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/new-date" used \`new Date()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time
                   at DateReadingComponent (bundler:///app/sync-io-current-time/new-date/page.tsx:19:16)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{new Date().toString()}</div>
                    |                ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/new-date" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-current-time/new-date". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-current-time/new-date/page: /sync-io-current-time/new-date"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/new-date" used \`new Date()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/new-date" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-current-time/new-date". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-current-time/new-date/page: /sync-io-current-time/new-date, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Random - Math.random()', () => {
      const pathname = '/sync-io-random/math-random'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/sync-io-random/math-random" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/sync-io-random/math-random/page.tsx (19:21) @ SyncIOComponent
           > 19 |   return <div>{Math.random()}</div>
                |                     ^",
             "stack": [
               "SyncIOComponent app/sync-io-random/math-random/page.tsx (19:21)",
               "Page app/sync-io-random/math-random/page.tsx (11:9)",
               "LogSafely <anonymous>",
             ],
           }
          `)
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-random/math-random" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-random/math-random/page.tsx:19:21)
                 17 | async function SyncIOComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Math.random()}</div>
                    |                     ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-random/math-random" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-random/math-random". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-random/math-random/page: /sync-io-random/math-random"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-random/math-random" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (bundler:///app/sync-io-random/math-random/page.tsx:19:21)
                 17 | async function SyncIOComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Math.random()}</div>
                    |                     ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-random/math-random" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-random/math-random". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-random/math-random/page: /sync-io-random/math-random, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-random/math-random" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-random/math-random/page.tsx:19:21)
                 17 | async function SyncIOComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Math.random()}</div>
                    |                     ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-random/math-random" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-random/math-random". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-random/math-random/page: /sync-io-random/math-random"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-random/math-random" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-random/math-random" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-random/math-random". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-random/math-random/page: /sync-io-random/math-random, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Web Crypto - getRandomValue()', () => {
      const pathname = '/sync-io-web-crypto/get-random-value'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/sync-io-web-crypto/get-random-value" used \`crypto.getRandomValues()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/sync-io-web-crypto/get-random-value/page.tsx (20:10) @ SyncIOComponent
           > 20 |   crypto.getRandomValues(buffer)
                |          ^",
             "stack": [
               "SyncIOComponent app/sync-io-web-crypto/get-random-value/page.tsx (20:10)",
               "Page app/sync-io-web-crypto/get-random-value/page.tsx (11:9)",
               "LogSafely <anonymous>",
             ],
           }
          `)
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/get-random-value" used \`crypto.getRandomValues()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto
                   at SyncIOComponent (bundler:///app/sync-io-web-crypto/get-random-value/page.tsx:20:10)
                 18 |   await new Promise((r) => process.nextTick(r))
                 19 |   const buffer = new Uint8Array(8)
               > 20 |   crypto.getRandomValues(buffer)
                    |          ^
                 21 |   return <div>{buffer.toString()}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-web-crypto/get-random-value" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-web-crypto/get-random-value". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-web-crypto/get-random-value/page: /sync-io-web-crypto/get-random-value"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/get-random-value" used \`crypto.getRandomValues()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto
                   at a (bundler:///app/sync-io-web-crypto/get-random-value/page.tsx:20:10)
                 18 |   await new Promise((r) => process.nextTick(r))
                 19 |   const buffer = new Uint8Array(8)
               > 20 |   crypto.getRandomValues(buffer)
                    |          ^
                 21 |   return <div>{buffer.toString()}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-web-crypto/get-random-value" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-web-crypto/get-random-value". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-web-crypto/get-random-value/page: /sync-io-web-crypto/get-random-value, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/get-random-value" used \`crypto.getRandomValues()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto
                   at SyncIOComponent (bundler:///app/sync-io-web-crypto/get-random-value/page.tsx:20:10)
                 18 |   await new Promise((r) => process.nextTick(r))
                 19 |   const buffer = new Uint8Array(8)
               > 20 |   crypto.getRandomValues(buffer)
                    |          ^
                 21 |   return <div>{buffer.toString()}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-web-crypto/get-random-value" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-web-crypto/get-random-value". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-web-crypto/get-random-value/page: /sync-io-web-crypto/get-random-value"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/get-random-value" used \`crypto.getRandomValues()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-web-crypto/get-random-value" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-web-crypto/get-random-value". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-web-crypto/get-random-value/page: /sync-io-web-crypto/get-random-value, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Web Crypto - randomUUID()', () => {
      const pathname = '/sync-io-web-crypto/random-uuid'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/sync-io-web-crypto/random-uuid" used \`crypto.randomUUID()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/sync-io-web-crypto/random-uuid/page.tsx (19:23) @ SyncIOComponent
           > 19 |   return <div>{crypto.randomUUID()}</div>
                |                       ^",
             "stack": [
               "SyncIOComponent app/sync-io-web-crypto/random-uuid/page.tsx (19:23)",
               "Page app/sync-io-web-crypto/random-uuid/page.tsx (11:9)",
               "LogSafely <anonymous>",
             ],
           }
          `)
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/random-uuid" used \`crypto.randomUUID()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto
                   at SyncIOComponent (bundler:///app/sync-io-web-crypto/random-uuid/page.tsx:19:23)
                 17 | async function SyncIOComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{crypto.randomUUID()}</div>
                    |                       ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-web-crypto/random-uuid" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-web-crypto/random-uuid". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-web-crypto/random-uuid/page: /sync-io-web-crypto/random-uuid"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/random-uuid" used \`crypto.randomUUID()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto
                   at a (bundler:///app/sync-io-web-crypto/random-uuid/page.tsx:19:23)
                 17 | async function SyncIOComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{crypto.randomUUID()}</div>
                    |                       ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-web-crypto/random-uuid" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-web-crypto/random-uuid". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-web-crypto/random-uuid/page: /sync-io-web-crypto/random-uuid, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/random-uuid" used \`crypto.randomUUID()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto
                   at SyncIOComponent (bundler:///app/sync-io-web-crypto/random-uuid/page.tsx:19:23)
                 17 | async function SyncIOComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{crypto.randomUUID()}</div>
                    |                       ^
                 20 | }
                 21 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-web-crypto/random-uuid" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-web-crypto/random-uuid". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-web-crypto/random-uuid/page: /sync-io-web-crypto/random-uuid"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/random-uuid" used \`crypto.randomUUID()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-web-crypto/random-uuid" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-web-crypto/random-uuid". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-web-crypto/random-uuid/page: /sync-io-web-crypto/random-uuid, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Node Crypto - generateKeyPairSync()', () => {
      const pathname = '/sync-io-node-crypto/generate-key-pair-sync'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          if (isTurbopack) {
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-io-node-crypto/generate-key-pair-sync" used \`require('node:crypto').generateKeyPairSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/sync-io-node-crypto/generate-key-pair-sync/page.tsx (20:24) @ SyncIOComponent
             > 20 |   const first = crypto.generateKeyPairSync('rsa', keyGenOptions)
                  |                        ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/generate-key-pair-sync/page.tsx (20:24)",
                 "Page app/sync-io-node-crypto/generate-key-pair-sync/page.tsx (12:9)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          } else {
            await expect(browser).toDisplayCollapsedRedbox(`
                        {
                          "description": "Route "/sync-io-node-crypto/generate-key-pair-sync" used \`require('node:crypto').generateKeyPairSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
                          "environmentLabel": "Server",
                          "label": "Console Error",
                          "source": "app/sync-io-node-crypto/generate-key-pair-sync/page.tsx (20:17) @ SyncIOComponent
                        > 20 |   const first = crypto.generateKeyPairSync('rsa', keyGenOptions)
                             |                 ^",
                          "stack": [
                            "SyncIOComponent app/sync-io-node-crypto/generate-key-pair-sync/page.tsx (20:17)",
                            "Page app/sync-io-node-crypto/generate-key-pair-sync/page.tsx (12:9)",
                            "LogSafely <anonymous>",
                          ],
                        }
                      `)
          }
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-key-pair-sync" used \`require('node:crypto').generateKeyPairSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/generate-key-pair-sync/page.tsx:20:24)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.generateKeyPairSync('rsa', keyGenOptions)
                    |                        ^
                 21 |   return <div>{first.publicKey}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-key-pair-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/generate-key-pair-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/generate-key-pair-sync/page: /sync-io-node-crypto/generate-key-pair-sync"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-key-pair-sync" used \`require('node:crypto').generateKeyPairSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (bundler:///app/sync-io-node-crypto/generate-key-pair-sync/page.tsx:20:24)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.generateKeyPairSync('rsa', keyGenOptions)
                    |                        ^
                 21 |   return <div>{first.publicKey}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-key-pair-sync" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/generate-key-pair-sync". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/generate-key-pair-sync/page: /sync-io-node-crypto/generate-key-pair-sync, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-key-pair-sync" used \`require('node:crypto').generateKeyPairSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/generate-key-pair-sync/page.tsx:20:17)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.generateKeyPairSync('rsa', keyGenOptions)
                    |                 ^
                 21 |   return <div>{first.publicKey}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-key-pair-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/generate-key-pair-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/generate-key-pair-sync/page: /sync-io-node-crypto/generate-key-pair-sync"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-key-pair-sync" used \`require('node:crypto').generateKeyPairSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-key-pair-sync" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/generate-key-pair-sync". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/generate-key-pair-sync/page: /sync-io-node-crypto/generate-key-pair-sync, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Node Crypto - generateKeySync()', () => {
      const pathname = '/sync-io-node-crypto/generate-key-sync'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          if (isTurbopack) {
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-io-node-crypto/generate-key-sync" used \`require('node:crypto').generateKeySync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/sync-io-node-crypto/generate-key-sync/page.tsx (21:6) @ SyncIOComponent
             > 21 |     .generateKeySync('hmac', {
                  |      ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/generate-key-sync/page.tsx (21:6)",
                 "Page app/sync-io-node-crypto/generate-key-sync/page.tsx (12:9)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          } else {
            await expect(browser).toDisplayCollapsedRedbox(`
                        {
                          "description": "Route "/sync-io-node-crypto/generate-key-sync" used \`require('node:crypto').generateKeySync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
                          "environmentLabel": "Server",
                          "label": "Console Error",
                          "source": "app/sync-io-node-crypto/generate-key-sync/page.tsx (20:17) @ SyncIOComponent
                        > 20 |   const first = crypto
                             |                 ^",
                          "stack": [
                            "SyncIOComponent app/sync-io-node-crypto/generate-key-sync/page.tsx (20:17)",
                            "Page app/sync-io-node-crypto/generate-key-sync/page.tsx (12:9)",
                            "LogSafely <anonymous>",
                          ],
                        }
                      `)
          }
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-key-sync" used \`require('node:crypto').generateKeySync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/generate-key-sync/page.tsx:21:6)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = crypto
               > 21 |     .generateKeySync('hmac', {
                    |      ^
                 22 |       length: 512,
                 23 |     })
                 24 |     .export()
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-key-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/generate-key-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/generate-key-sync/page: /sync-io-node-crypto/generate-key-sync"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-key-sync" used \`require('node:crypto').generateKeySync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (bundler:///app/sync-io-node-crypto/generate-key-sync/page.tsx:21:6)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = crypto
               > 21 |     .generateKeySync('hmac', {
                    |      ^
                 22 |       length: 512,
                 23 |     })
                 24 |     .export()
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-key-sync" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/generate-key-sync". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/generate-key-sync/page: /sync-io-node-crypto/generate-key-sync, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-key-sync" used \`require('node:crypto').generateKeySync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/generate-key-sync/page.tsx:20:17)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto
                    |                 ^
                 21 |     .generateKeySync('hmac', {
                 22 |       length: 512,
                 23 |     })
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-key-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/generate-key-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/generate-key-sync/page: /sync-io-node-crypto/generate-key-sync"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-key-sync" used \`require('node:crypto').generateKeySync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-key-sync" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/generate-key-sync". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/generate-key-sync/page: /sync-io-node-crypto/generate-key-sync, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Node Crypto - generatePrimeSync()', () => {
      const pathname = '/sync-io-node-crypto/generate-prime-sync'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          if (isTurbopack) {
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-io-node-crypto/generate-prime-sync" used \`require('node:crypto').generatePrimeSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/sync-io-node-crypto/generate-prime-sync/page.tsx (20:39) @ SyncIOComponent
             > 20 |   const first = new Uint8Array(crypto.generatePrimeSync(128))
                  |                                       ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/generate-prime-sync/page.tsx (20:39)",
                 "Page app/sync-io-node-crypto/generate-prime-sync/page.tsx (12:9)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          } else {
            await expect(browser).toDisplayCollapsedRedbox(`
                        {
                          "description": "Route "/sync-io-node-crypto/generate-prime-sync" used \`require('node:crypto').generatePrimeSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
                          "environmentLabel": "Server",
                          "label": "Console Error",
                          "source": "app/sync-io-node-crypto/generate-prime-sync/page.tsx (20:32) @ SyncIOComponent
                        > 20 |   const first = new Uint8Array(crypto.generatePrimeSync(128))
                             |                                ^",
                          "stack": [
                            "SyncIOComponent app/sync-io-node-crypto/generate-prime-sync/page.tsx (20:32)",
                            "Page app/sync-io-node-crypto/generate-prime-sync/page.tsx (12:9)",
                            "LogSafely <anonymous>",
                          ],
                        }
                      `)
          }
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-prime-sync" used \`require('node:crypto').generatePrimeSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/generate-prime-sync/page.tsx:20:39)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = new Uint8Array(crypto.generatePrimeSync(128))
                    |                                       ^
                 21 |   return <div>{first.toString()}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-prime-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/generate-prime-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/generate-prime-sync/page: /sync-io-node-crypto/generate-prime-sync"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-prime-sync" used \`require('node:crypto').generatePrimeSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (bundler:///app/sync-io-node-crypto/generate-prime-sync/page.tsx:20:39)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = new Uint8Array(crypto.generatePrimeSync(128))
                    |                                       ^
                 21 |   return <div>{first.toString()}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-prime-sync" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/generate-prime-sync". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/generate-prime-sync/page: /sync-io-node-crypto/generate-prime-sync, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-prime-sync" used \`require('node:crypto').generatePrimeSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/generate-prime-sync/page.tsx:20:32)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = new Uint8Array(crypto.generatePrimeSync(128))
                    |                                ^
                 21 |   return <div>{first.toString()}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-prime-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/generate-prime-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/generate-prime-sync/page: /sync-io-node-crypto/generate-prime-sync"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-prime-sync" used \`require('node:crypto').generatePrimeSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-prime-sync" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/generate-prime-sync". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/generate-prime-sync/page: /sync-io-node-crypto/generate-prime-sync, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Node Crypto - getRandomValues()', () => {
      const pathname = '/sync-io-node-crypto/get-random-values'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          if (isTurbopack) {
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-io-node-crypto/get-random-values" used \`crypto.getRandomValues()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/sync-io-node-crypto/get-random-values/page.tsx (21:10) @ SyncIOComponent
             > 21 |   crypto.getRandomValues(first)
                  |          ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/get-random-values/page.tsx (21:10)",
                 "Page app/sync-io-node-crypto/get-random-values/page.tsx (12:9)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          } else {
            await expect(browser).toDisplayCollapsedRedbox(`
                        {
                          "description": "Route "/sync-io-node-crypto/get-random-values" used \`crypto.getRandomValues()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto",
                          "environmentLabel": "Server",
                          "label": "Console Error",
                          "source": "app/sync-io-node-crypto/get-random-values/page.tsx (21:3) @ SyncIOComponent
                        > 21 |   crypto.getRandomValues(first)
                             |   ^",
                          "stack": [
                            "SyncIOComponent app/sync-io-node-crypto/get-random-values/page.tsx (21:3)",
                            "Page app/sync-io-node-crypto/get-random-values/page.tsx (12:9)",
                            "LogSafely <anonymous>",
                          ],
                        }
                      `)
          }
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/get-random-values" used \`crypto.getRandomValues()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/get-random-values/page.tsx:21:10)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = new Uint8Array(8)
               > 21 |   crypto.getRandomValues(first)
                    |          ^
                 22 |   return <div>{first.toString()}</div>
                 23 | }
                 24 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/get-random-values" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/get-random-values". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/get-random-values/page: /sync-io-node-crypto/get-random-values"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/get-random-values" used \`crypto.getRandomValues()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto
                   at a (bundler:///app/sync-io-node-crypto/get-random-values/page.tsx:21:10)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = new Uint8Array(8)
               > 21 |   crypto.getRandomValues(first)
                    |          ^
                 22 |   return <div>{first.toString()}</div>
                 23 | }
                 24 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/get-random-values" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/get-random-values". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/get-random-values/page: /sync-io-node-crypto/get-random-values, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/get-random-values" used \`crypto.getRandomValues()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/get-random-values/page.tsx:21:3)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = new Uint8Array(8)
               > 21 |   crypto.getRandomValues(first)
                    |   ^
                 22 |   return <div>{first.toString()}</div>
                 23 | }
                 24 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/get-random-values" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/get-random-values". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/get-random-values/page: /sync-io-node-crypto/get-random-values"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/get-random-values" used \`crypto.getRandomValues()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/get-random-values" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/get-random-values". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/get-random-values/page: /sync-io-node-crypto/get-random-values, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Node Crypto - random-bytes()', () => {
      const pathname = '/sync-io-node-crypto/random-bytes'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          if (isTurbopack) {
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-io-node-crypto/random-bytes" used \`require('node:crypto').randomBytes(size)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/sync-io-node-crypto/random-bytes/page.tsx (20:24) @ SyncIOComponent
             > 20 |   const first = crypto.randomBytes(8)
                  |                        ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-bytes/page.tsx (20:24)",
                 "Page app/sync-io-node-crypto/random-bytes/page.tsx (12:9)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          } else {
            await expect(browser).toDisplayCollapsedRedbox(`
                        {
                          "description": "Route "/sync-io-node-crypto/random-bytes" used \`require('node:crypto').randomBytes(size)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
                          "environmentLabel": "Server",
                          "label": "Console Error",
                          "source": "app/sync-io-node-crypto/random-bytes/page.tsx (20:17) @ SyncIOComponent
                        > 20 |   const first = crypto.randomBytes(8)
                             |                 ^",
                          "stack": [
                            "SyncIOComponent app/sync-io-node-crypto/random-bytes/page.tsx (20:17)",
                            "Page app/sync-io-node-crypto/random-bytes/page.tsx (12:9)",
                            "LogSafely <anonymous>",
                          ],
                        }
                      `)
          }
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-bytes" used \`require('node:crypto').randomBytes(size)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/random-bytes/page.tsx:20:24)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomBytes(8)
                    |                        ^
                 21 |   return <div>{first.toString()}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-bytes" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-bytes". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/random-bytes/page: /sync-io-node-crypto/random-bytes"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-bytes" used \`require('node:crypto').randomBytes(size)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (bundler:///app/sync-io-node-crypto/random-bytes/page.tsx:20:24)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomBytes(8)
                    |                        ^
                 21 |   return <div>{first.toString()}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-bytes" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/random-bytes". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/random-bytes/page: /sync-io-node-crypto/random-bytes, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-bytes" used \`require('node:crypto').randomBytes(size)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/random-bytes/page.tsx:20:17)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomBytes(8)
                    |                 ^
                 21 |   return <div>{first.toString()}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-bytes" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-bytes". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/random-bytes/page: /sync-io-node-crypto/random-bytes"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-bytes" used \`require('node:crypto').randomBytes(size)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-bytes" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/random-bytes". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/random-bytes/page: /sync-io-node-crypto/random-bytes, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Node Crypto - random-fill-sync()', () => {
      const pathname = '/sync-io-node-crypto/random-fill-sync'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          if (isTurbopack) {
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-io-node-crypto/random-fill-sync" used \`require('node:crypto').randomFillSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/sync-io-node-crypto/random-fill-sync/page.tsx (21:10) @ SyncIOComponent
             > 21 |   crypto.randomFillSync(first, 4, 8)
                  |          ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-fill-sync/page.tsx (21:10)",
                 "Page app/sync-io-node-crypto/random-fill-sync/page.tsx (12:9)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          } else {
            await expect(browser).toDisplayCollapsedRedbox(`
                        {
                          "description": "Route "/sync-io-node-crypto/random-fill-sync" used \`require('node:crypto').randomFillSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
                          "environmentLabel": "Server",
                          "label": "Console Error",
                          "source": "app/sync-io-node-crypto/random-fill-sync/page.tsx (21:3) @ SyncIOComponent
                        > 21 |   crypto.randomFillSync(first, 4, 8)
                             |   ^",
                          "stack": [
                            "SyncIOComponent app/sync-io-node-crypto/random-fill-sync/page.tsx (21:3)",
                            "Page app/sync-io-node-crypto/random-fill-sync/page.tsx (12:9)",
                            "LogSafely <anonymous>",
                          ],
                        }
                      `)
          }
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-fill-sync" used \`require('node:crypto').randomFillSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/random-fill-sync/page.tsx:21:10)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = new Uint8Array(16)
               > 21 |   crypto.randomFillSync(first, 4, 8)
                    |          ^
                 22 |   return <div>{first.toString()}</div>
                 23 | }
                 24 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-fill-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-fill-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/random-fill-sync/page: /sync-io-node-crypto/random-fill-sync"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-fill-sync" used \`require('node:crypto').randomFillSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (bundler:///app/sync-io-node-crypto/random-fill-sync/page.tsx:21:10)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = new Uint8Array(16)
               > 21 |   crypto.randomFillSync(first, 4, 8)
                    |          ^
                 22 |   return <div>{first.toString()}</div>
                 23 | }
                 24 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-fill-sync" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/random-fill-sync". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/random-fill-sync/page: /sync-io-node-crypto/random-fill-sync, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-fill-sync" used \`require('node:crypto').randomFillSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/random-fill-sync/page.tsx:21:3)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = new Uint8Array(16)
               > 21 |   crypto.randomFillSync(first, 4, 8)
                    |   ^
                 22 |   return <div>{first.toString()}</div>
                 23 | }
                 24 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-fill-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-fill-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/random-fill-sync/page: /sync-io-node-crypto/random-fill-sync"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-fill-sync" used \`require('node:crypto').randomFillSync(...)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-fill-sync" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/random-fill-sync". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/random-fill-sync/page: /sync-io-node-crypto/random-fill-sync, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Node Crypto - random-int-between()', () => {
      const pathname = '/sync-io-node-crypto/random-int-between'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          if (isTurbopack) {
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-io-node-crypto/random-int-between" used \`require('node:crypto').randomInt(min, max)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/sync-io-node-crypto/random-int-between/page.tsx (20:24) @ SyncIOComponent
             > 20 |   const first = crypto.randomInt(128, 256)
                  |                        ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-int-between/page.tsx (20:24)",
                 "Page app/sync-io-node-crypto/random-int-between/page.tsx (12:9)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          } else {
            await expect(browser).toDisplayCollapsedRedbox(`
                        {
                          "description": "Route "/sync-io-node-crypto/random-int-between" used \`require('node:crypto').randomInt(min, max)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
                          "environmentLabel": "Server",
                          "label": "Console Error",
                          "source": "app/sync-io-node-crypto/random-int-between/page.tsx (20:17) @ SyncIOComponent
                        > 20 |   const first = crypto.randomInt(128, 256)
                             |                 ^",
                          "stack": [
                            "SyncIOComponent app/sync-io-node-crypto/random-int-between/page.tsx (20:17)",
                            "Page app/sync-io-node-crypto/random-int-between/page.tsx (12:9)",
                            "LogSafely <anonymous>",
                          ],
                        }
                      `)
          }
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-int-between" used \`require('node:crypto').randomInt(min, max)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/random-int-between/page.tsx:20:24)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomInt(128, 256)
                    |                        ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-int-between" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-int-between". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/random-int-between/page: /sync-io-node-crypto/random-int-between"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-int-between" used \`require('node:crypto').randomInt(min, max)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (bundler:///app/sync-io-node-crypto/random-int-between/page.tsx:20:24)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomInt(128, 256)
                    |                        ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-int-between" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/random-int-between". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/random-int-between/page: /sync-io-node-crypto/random-int-between, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-int-between" used \`require('node:crypto').randomInt(min, max)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/random-int-between/page.tsx:20:17)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomInt(128, 256)
                    |                 ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-int-between" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-int-between". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/random-int-between/page: /sync-io-node-crypto/random-int-between"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-int-between" used \`require('node:crypto').randomInt(min, max)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-int-between" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/random-int-between". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/random-int-between/page: /sync-io-node-crypto/random-int-between, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Node Crypto - random-int-up-to()', () => {
      const pathname = '/sync-io-node-crypto/random-int-up-to'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          if (isTurbopack) {
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-io-node-crypto/random-int-up-to" used \`require('node:crypto').randomInt(min, max)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/sync-io-node-crypto/random-int-up-to/page.tsx (20:24) @ SyncIOComponent
             > 20 |   const first = crypto.randomInt(128)
                  |                        ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-int-up-to/page.tsx (20:24)",
                 "Page app/sync-io-node-crypto/random-int-up-to/page.tsx (12:9)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          } else {
            await expect(browser).toDisplayCollapsedRedbox(`
                        {
                          "description": "Route "/sync-io-node-crypto/random-int-up-to" used \`require('node:crypto').randomInt(min, max)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
                          "environmentLabel": "Server",
                          "label": "Console Error",
                          "source": "app/sync-io-node-crypto/random-int-up-to/page.tsx (20:17) @ SyncIOComponent
                        > 20 |   const first = crypto.randomInt(128)
                             |                 ^",
                          "stack": [
                            "SyncIOComponent app/sync-io-node-crypto/random-int-up-to/page.tsx (20:17)",
                            "Page app/sync-io-node-crypto/random-int-up-to/page.tsx (12:9)",
                            "LogSafely <anonymous>",
                          ],
                        }
                      `)
          }
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-int-up-to" used \`require('node:crypto').randomInt(min, max)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/random-int-up-to/page.tsx:20:24)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomInt(128)
                    |                        ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-int-up-to" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-int-up-to". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/random-int-up-to/page: /sync-io-node-crypto/random-int-up-to"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-int-up-to" used \`require('node:crypto').randomInt(min, max)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (bundler:///app/sync-io-node-crypto/random-int-up-to/page.tsx:20:24)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomInt(128)
                    |                        ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-int-up-to" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/random-int-up-to". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/random-int-up-to/page: /sync-io-node-crypto/random-int-up-to, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-int-up-to" used \`require('node:crypto').randomInt(min, max)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/random-int-up-to/page.tsx:20:17)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomInt(128)
                    |                 ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-int-up-to" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-int-up-to". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/random-int-up-to/page: /sync-io-node-crypto/random-int-up-to"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-int-up-to" used \`require('node:crypto').randomInt(min, max)\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-int-up-to" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/random-int-up-to". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/random-int-up-to/page: /sync-io-node-crypto/random-int-up-to, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('Sync IO - Node Crypto - random-uuid', () => {
      const pathname = '/sync-io-node-crypto/random-uuid'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          if (isTurbopack) {
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/sync-io-node-crypto/random-uuid" used \`require('node:crypto').randomUUID()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/sync-io-node-crypto/random-uuid/page.tsx (20:24) @ SyncIOComponent
             > 20 |   const first = crypto.randomUUID()
                  |                        ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-uuid/page.tsx (20:24)",
                 "Page app/sync-io-node-crypto/random-uuid/page.tsx (12:9)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          } else {
            await expect(browser).toDisplayCollapsedRedbox(`
                        {
                          "description": "Route "/sync-io-node-crypto/random-uuid" used \`require('node:crypto').randomUUID()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
                          "environmentLabel": "Server",
                          "label": "Console Error",
                          "source": "app/sync-io-node-crypto/random-uuid/page.tsx (20:17) @ SyncIOComponent
                        > 20 |   const first = crypto.randomUUID()
                             |                 ^",
                          "stack": [
                            "SyncIOComponent app/sync-io-node-crypto/random-uuid/page.tsx (20:17)",
                            "Page app/sync-io-node-crypto/random-uuid/page.tsx (12:9)",
                            "LogSafely <anonymous>",
                          ],
                        }
                      `)
          }
        })
      } else {
        it('should error the build if sync IO is used in a Server Component while prerendering', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-uuid" used \`require('node:crypto').randomUUID()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/random-uuid/page.tsx:20:24)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomUUID()
                    |                        ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-uuid" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-uuid". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/random-uuid/page: /sync-io-node-crypto/random-uuid"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-uuid" used \`require('node:crypto').randomUUID()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (bundler:///app/sync-io-node-crypto/random-uuid/page.tsx:20:24)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomUUID()
                    |                        ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-uuid" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/random-uuid". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/random-uuid/page: /sync-io-node-crypto/random-uuid, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-uuid" used \`require('node:crypto').randomUUID()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at SyncIOComponent (bundler:///app/sync-io-node-crypto/random-uuid/page.tsx:20:17)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomUUID()
                    |                 ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-uuid" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-uuid". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on following paths:
               	/sync-io-node-crypto/random-uuid/page: /sync-io-node-crypto/random-uuid"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-uuid" used \`require('node:crypto').randomUUID()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
                   at a (<next-dist-dir>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-uuid" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/sync-io-node-crypto/random-uuid". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /sync-io-node-crypto/random-uuid/page: /sync-io-node-crypto/random-uuid, exiting the build."
              `)
            }
          }
        })
      }
    })

    // TODO(restart-on-cache-miss): Figure out how to test this without flakiness
    describe.skip('Unhandled Rejection Suppression', () => {
      const pathname = '/unhandled-rejection'

      if (isNextDev) {
        it('should suppress unhandled rejections during prerender validation in dev', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           [
             {
               "description": "BOOM",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "Page <anonymous>",
               ],
             },
             {
               "description": " ⨯ "unhandledRejection:" "BOOM"",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "Page <anonymous>",
               ],
             },
             {
               "description": " ⨯ "unhandledRejection: " "BOOM"",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "Page <anonymous>",
               ],
             },
             {
               "description": "BAM",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "Page <anonymous>",
               ],
             },
             {
               "description": " ⨯ "unhandledRejection:" "BAM"",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "Page <anonymous>",
               ],
             },
             {
               "description": " ⨯ "unhandledRejection: " "BAM"",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "Page <anonymous>",
               ],
             },
           ]
          `)
        })
      } else {
        it('should suppress unhandled rejections after prerender abort', async () => {
          try {
            await prerender(pathname)
          } catch {}

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          expect(output).toMatchInlineSnapshot(`
             "BOOM
             BOOM"
            `)
        })
      }
    })
  })
})
