import { isNextDev, nextTestSetup } from 'e2e-utils'
import { assertNoErrorToast } from 'next-test-utils'
import { getPrerenderOutput } from './utils'

describe('Dynamic IO Errors', () => {
  const { next, isTurbopack, isNextStart, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/default',
    skipStart: !isNextDev,
    skipDeployment: true,
  })

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

          if (isTurbopack) {
            // TODO(veil): Source mapping breaks due to double-encoding of the
            // square brackets.
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/dynamic-metadata-error-route": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "<FIXME-file-protocol>",
                 "<FIXME-file-protocol>",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          } else {
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/dynamic-metadata-error-route": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/dynamic-metadata-error-route/page.tsx (21:9) @ Dynamic
             > 21 |   await new Promise((r) => setTimeout(r))
                  |         ^",
               "stack": [
                 "Dynamic app/dynamic-metadata-error-route/page.tsx (21:9)",
                 "Page app/dynamic-metadata-error-route/page.tsx (15:7)",
                 "LogSafely <anonymous>",
               ],
             }
            `)
          }
        })
      } else {
        // This test is just here because there was a bug when dynamic metadata was used alongside another dynamic IO violation which caused the validation to be skipped.
        it('should error the build for the correct reason when there is a dynamic IO violation alongside dynamic metadata', async () => {
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
                   at InnerLayoutRouter (webpack://<next-src>)
                   at RedirectErrorBoundary (webpack://<next-src>)
                   at RedirectBoundary (webpack://<next-src>)
                   at HTTPAccessFallbackBoundary (webpack://<next-src>)
                   at LoadingBoundary (webpack://<next-src>)
                   at ErrorBoundary (webpack://<next-src>)
                   at InnerScrollAndFocusHandler (webpack://<next-src>)
                   at ScrollAndFocusHandler (webpack://<next-src>)
                   at RenderFromTemplateContext (webpack://<next-src>)
                   at OuterLayoutRouter (webpack://<next-src>)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                   at InnerLayoutRouter (webpack://<next-src>)
                   at RedirectErrorBoundary (webpack://<next-src>)
                   at RedirectBoundary (webpack://<next-src>)
                   at HTTPAccessFallbackErrorBoundary (webpack://<next-src>)
                   at HTTPAccessFallbackBoundary (webpack://<next-src>)
                   at LoadingBoundary (webpack://<next-src>)
                   at ErrorBoundary (webpack://<next-src>)
                   at InnerScrollAndFocusHandler (webpack://<next-src>)
                   at ScrollAndFocusHandler (webpack://<next-src>)
                   at RenderFromTemplateContext (webpack://<next-src>)
                   at OuterLayoutRouter (webpack://<next-src>)
                 332 |  */
                 333 | function InnerLayoutRouter({
               > 334 |   tree,
                     |  ^
                 335 |   segmentPath,
                 336 |   cacheNode,
                 337 |   url,
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
            // TODO(veil): Source mapping breaks due to double-encoding of the
            // square brackets.
            await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "description": "Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": null,
                 "stack": [
                   "<FIXME-file-protocol>",
                   "<FIXME-file-protocol>",
                   "LogSafely <anonymous>",
                 ],
               },
               {
                 "description": "Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": null,
                 "stack": [
                   "<FIXME-file-protocol>",
                   "<FIXME-file-protocol>",
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
        it('should error the build if dynamic IO happens in the root (outside a Suspense)', async () => {
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
                   at IndirectionTwo (turbopack:///[project]/app/dynamic-root/indirection.tsx:7:33)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                  5 | }
                  6 |
               >  7 | export function IndirectionTwo({ children }) {
                    |                                 ^
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
                   at c (turbopack:///[project]/app/dynamic-root/indirection.tsx:9:0)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                  7 | export function IndirectionTwo({ children }) {
                  8 |   return children
               >  9 | }
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
                   at IndirectionTwo (webpack:///app/dynamic-root/indirection.tsx:7:33)
                   at InnerLayoutRouter (webpack://<next-src>)
                   at RedirectErrorBoundary (webpack://<next-src>)
                   at RedirectBoundary (webpack://<next-src>)
                   at HTTPAccessFallbackBoundary (webpack://<next-src>)
                   at LoadingBoundary (webpack://<next-src>)
                   at ErrorBoundary (webpack://<next-src>)
                   at InnerScrollAndFocusHandler (webpack://<next-src>)
                   at ScrollAndFocusHandler (webpack://<next-src>)
                   at RenderFromTemplateContext (webpack://<next-src>)
                   at OuterLayoutRouter (webpack://<next-src>)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                   at InnerLayoutRouter (webpack://<next-src>)
                   at RedirectErrorBoundary (webpack://<next-src>)
                   at RedirectBoundary (webpack://<next-src>)
                   at HTTPAccessFallbackErrorBoundary (webpack://<next-src>)
                   at HTTPAccessFallbackBoundary (webpack://<next-src>)
                   at LoadingBoundary (webpack://<next-src>)
                   at ErrorBoundary (webpack://<next-src>)
                   at InnerScrollAndFocusHandler (webpack://<next-src>)
                   at ScrollAndFocusHandler (webpack://<next-src>)
                   at RenderFromTemplateContext (webpack://<next-src>)
                   at OuterLayoutRouter (webpack://<next-src>)
                  5 | }
                  6 |
               >  7 | export function IndirectionTwo({ children }) {
                    |                                 ^
                  8 |   return children
                  9 | }
                 10 |
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
               Error: Route "/dynamic-root": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at InnerLayoutRouter (webpack://<next-src>)
                   at RedirectErrorBoundary (webpack://<next-src>)
                   at RedirectBoundary (webpack://<next-src>)
                   at HTTPAccessFallbackBoundary (webpack://<next-src>)
                   at LoadingBoundary (webpack://<next-src>)
                   at ErrorBoundary (webpack://<next-src>)
                   at InnerScrollAndFocusHandler (webpack://<next-src>)
                   at ScrollAndFocusHandler (webpack://<next-src>)
                   at RenderFromTemplateContext (webpack://<next-src>)
                   at OuterLayoutRouter (webpack://<next-src>)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                   at InnerLayoutRouter (webpack://<next-src>)
                   at RedirectErrorBoundary (webpack://<next-src>)
                   at RedirectBoundary (webpack://<next-src>)
                   at HTTPAccessFallbackErrorBoundary (webpack://<next-src>)
                   at HTTPAccessFallbackBoundary (webpack://<next-src>)
                   at LoadingBoundary (webpack://<next-src>)
                   at ErrorBoundary (webpack://<next-src>)
                   at InnerScrollAndFocusHandler (webpack://<next-src>)
                   at ScrollAndFocusHandler (webpack://<next-src>)
                   at RenderFromTemplateContext (webpack://<next-src>)
                   at OuterLayoutRouter (webpack://<next-src>)
                 332 |  */
                 333 | function InnerLayoutRouter({
               > 334 |   tree,
                     |  ^
                 335 |   segmentPath,
                 336 |   cacheNode,
                 337 |   url,
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

          expect(next.cliOutput).toContain(`◐ ${pathname} `)
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
          it('should not show a collapsed redbox error', async () => {
            const browser = await next.browser(pathname)
            await assertNoErrorToast(browser)
          })
        } else {
          it('should not error the build when calling Math.random() if all dynamic access is inside a Suspense boundary', async () => {
            try {
              await prerender(pathname)
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
                     at f (turbopack:///[project]/app/sync-random-without-fallback/page.tsx:32:14)
                   30 |
                   31 | function getRandomNumber() {
                 > 32 |   return Math.random()
                      |              ^
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
                 "Error: Route "/sync-random-without-fallback" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
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
                 "Error: Route "/sync-random-without-fallback" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
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
                          "description": "A searchParam property was accessed directly with \`searchParams.foo\`. \`searchParams\` should be unwrapped with \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                          "environmentLabel": null,
                          "label": "Console Error",
                          "source": "app/sync-client-search/page.tsx (26:5) @ SearchParamsReadingComponent
                        > 26 |   ).foo
                             |     ^",
                          "stack": [
                            "SearchParamsReadingComponent app/sync-client-search/page.tsx (26:5)",
                            "Page app/sync-client-search/page.tsx (14:7)",
                          ],
                        }
                      `)
          })
        } else {
          it('should not error the build when synchronously reading `searchParams.foo`', async () => {
            try {
              await prerender(pathname)
            } catch (error) {
              throw new Error('expected build not to fail', { cause: error })
            }

            expect(next.cliOutput).toContain(`◐ ${pathname} `)
            await next.start({ skipBuild: true })
            const browser = await next.browser(`${pathname}?foo=test`)
            expect(await browser.elementById('foo-param').text()).toBe(
              'undefined'
            )
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
                          "description": "Route "/sync-server-search" used \`searchParams.foo\`. \`searchParams\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                          "environmentLabel": "Prerender",
                          "label": "Console Error",
                          "source": "app/sync-server-search/page.tsx (30:5) @ SearchParamsReadingComponent
                        > 30 |   ).foo
                             |     ^",
                          "stack": [
                            "SearchParamsReadingComponent app/sync-server-search/page.tsx (30:5)",
                            "Page app/sync-server-search/page.tsx (15:7)",
                          ],
                        }
                      `)
          })
        } else {
          it('should not error the build when synchronously reading `searchParams.foo`', async () => {
            try {
              await prerender(pathname)
            } catch (error) {
              throw new Error('expected build not to fail', { cause: error })
            }

            expect(next.cliOutput).toContain(`◐ ${pathname} `)
            await next.start({ skipBuild: true })
            const browser = await next.browser(`${pathname}?foo=test`)
            expect(await browser.elementById('foo-param').text()).toBe(
              'undefined'
            )
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
                 "description": "Route "/sync-cookies" used \`cookies().get\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                 "environmentLabel": "Prerender",
                 "label": "Console Error",
                 "source": "app/sync-cookies/page.tsx (17:26) @ CookiesReadingComponent
             > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                  |                          ^",
                 "stack": [
                   "CookiesReadingComponent app/sync-cookies/page.tsx (17:26)",
                   "Page app/sync-cookies/page.tsx (11:7)",
                 ],
               },
               {
                 "description": "(0 , <turbopack-module-id>.cookies)(...).get is not a function",
                 "environmentLabel": "Prerender",
                 "label": "Runtime TypeError",
                 "source": "app/sync-cookies/page.tsx (17:67) @ CookiesReadingComponent
             > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                  |                                                                   ^",
                 "stack": [
                   "CookiesReadingComponent app/sync-cookies/page.tsx (17:67)",
                 ],
               },
             ]
            `)
            } else {
              await expect(browser).toDisplayRedbox(`
             [
               {
                 "description": "Route "/sync-cookies" used \`cookies().get\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                 "environmentLabel": "Prerender",
                 "label": "Console Error",
                 "source": "app/sync-cookies/page.tsx (17:18) @ CookiesReadingComponent
             > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                  |                  ^",
                 "stack": [
                   "CookiesReadingComponent app/sync-cookies/page.tsx (17:18)",
                   "Page app/sync-cookies/page.tsx (11:7)",
                 ],
               },
               {
                 "description": "(0 , <webpack-module-id>.cookies)(...).get is not a function",
                 "environmentLabel": "Prerender",
                 "label": "Runtime TypeError",
                 "source": "app/sync-cookies/page.tsx (17:67) @ CookiesReadingComponent
             > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                  |                                                                   ^",
                 "stack": [
                   "CookiesReadingComponent app/sync-cookies/page.tsx (17:67)",
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
                     at CookiesReadingComponent (turbopack:///[project]/app/sync-cookies/page.tsx:17:66)
                     at stringify (<anonymous>)
                   15 |
                   16 | async function CookiesReadingComponent() {
                 > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                      |                                                                  ^
                   18 |   return <div>this component reads the \`token\` cookie synchronously</div>
                   19 | }
                   20 | {
                   digest: '<error-digest>'
                 }

                 > Export encountered errors on following paths:
                 	/sync-cookies/page: /sync-cookies"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-cookies". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at e (turbopack:///[project]/app/sync-cookies/page.tsx:17:66)
                     at a (<anonymous>)
                   15 |
                   16 | async function CookiesReadingComponent() {
                 > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                      |                                                                  ^
                   18 |   return <div>this component reads the \`token\` cookie synchronously</div>
                   19 | }
                   20 | {
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
                     at CookiesReadingComponent (webpack:///app/sync-cookies/page.tsx:17:66)
                     at stringify (<anonymous>)
                   15 |
                   16 | async function CookiesReadingComponent() {
                 > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                      |                                                                  ^
                   18 |   return <div>this component reads the \`token\` cookie synchronously</div>
                   19 | }
                   20 | {
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
                              "description": "Route "/sync-draft-mode" used \`draftMode().isEnabled\`. \`draftMode()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                              "environmentLabel": "Prerender",
                              "label": "Console Error",
                              "source": "app/sync-draft-mode/page.tsx (23:31) @ DraftModeReadingComponent
                            > 23 |   const isEnabled = (draftMode() as unknown as UnsafeUnwrappedDraftMode)
                                 |                               ^",
                              "stack": [
                                "DraftModeReadingComponent app/sync-draft-mode/page.tsx (23:31)",
                                "Page app/sync-draft-mode/page.tsx (13:7)",
                              ],
                            }
                          `)
            } else {
              await expect(browser).toDisplayCollapsedRedbox(`
                            {
                              "description": "Route "/sync-draft-mode" used \`draftMode().isEnabled\`. \`draftMode()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                              "environmentLabel": "Prerender",
                              "label": "Console Error",
                              "source": "app/sync-draft-mode/page.tsx (23:21) @ DraftModeReadingComponent
                            > 23 |   const isEnabled = (draftMode() as unknown as UnsafeUnwrappedDraftMode)
                                 |                     ^",
                              "stack": [
                                "DraftModeReadingComponent app/sync-draft-mode/page.tsx (23:21)",
                                "Page app/sync-draft-mode/page.tsx (13:7)",
                              ],
                            }
                          `)
            }
          })
        } else {
          it('should not error the build when synchronously reading `draftMode().isEnabled`', async () => {
            try {
              await prerender(pathname)
            } catch (error) {
              throw new Error('expected build not to fail', { cause: error })
            }

            expect(next.cliOutput).toContain(`◐ ${pathname} `)
            await next.start({ skipBuild: true })
            const browser = await next.browser(`${pathname}`)
            expect(await browser.elementById('draft-mode').text()).toBe(
              'undefined'
            )
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
                 "description": "Route "/sync-headers" used \`headers().get\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                 "environmentLabel": "Prerender",
                 "label": "Console Error",
                 "source": "app/sync-headers/page.tsx (17:29) @ HeadersReadingComponent
             > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                  |                             ^",
                 "stack": [
                   "HeadersReadingComponent app/sync-headers/page.tsx (17:29)",
                   "Page app/sync-headers/page.tsx (11:7)",
                 ],
               },
               {
                 "description": "(0 , <turbopack-module-id>.headers)(...).get is not a function",
                 "environmentLabel": "Prerender",
                 "label": "Runtime TypeError",
                 "source": "app/sync-headers/page.tsx (17:70) @ HeadersReadingComponent
             > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                  |                                                                      ^",
                 "stack": [
                   "HeadersReadingComponent app/sync-headers/page.tsx (17:70)",
                 ],
               },
             ]
            `)
            } else {
              await expect(browser).toDisplayRedbox(`
             [
               {
                 "description": "Route "/sync-headers" used \`headers().get\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                 "environmentLabel": "Prerender",
                 "label": "Console Error",
                 "source": "app/sync-headers/page.tsx (17:21) @ HeadersReadingComponent
             > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                  |                     ^",
                 "stack": [
                   "HeadersReadingComponent app/sync-headers/page.tsx (17:21)",
                   "Page app/sync-headers/page.tsx (11:7)",
                 ],
               },
               {
                 "description": "(0 , <webpack-module-id>.headers)(...).get is not a function",
                 "environmentLabel": "Prerender",
                 "label": "Runtime TypeError",
                 "source": "app/sync-headers/page.tsx (17:70) @ HeadersReadingComponent
             > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                  |                                                                      ^",
                 "stack": [
                   "HeadersReadingComponent app/sync-headers/page.tsx (17:70)",
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
                     at HeadersReadingComponent (turbopack:///[project]/app/sync-headers/page.tsx:17:69)
                     at stringify (<anonymous>)
                   15 |
                   16 | async function HeadersReadingComponent() {
                 > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                      |                                                                     ^
                   18 |     'user-agent'
                   19 |   )
                   20 |   return ( {
                   digest: '<error-digest>'
                 }

                 > Export encountered errors on following paths:
                 	/sync-headers/page: /sync-headers"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-headers". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at e (turbopack:///[project]/app/sync-headers/page.tsx:17:69)
                     at a (<anonymous>)
                   15 |
                   16 | async function HeadersReadingComponent() {
                 > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                      |                                                                     ^
                   18 |     'user-agent'
                   19 |   )
                   20 |   return ( {
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
                     at HeadersReadingComponent (webpack:///app/sync-headers/page.tsx:17:69)
                     at stringify (<anonymous>)
                   15 |
                   16 | async function HeadersReadingComponent() {
                 > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                      |                                                                     ^
                   18 |     'user-agent'
                   19 |   )
                   20 |   return ( {
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
                              "description": "A param property was accessed directly with \`params.slug\`. \`params\` is now a Promise and should be unwrapped with \`React.use()\` before accessing properties of the underlying params object. In this version of Next.js direct access to param properties is still supported to facilitate migration but in a future version you will be required to unwrap \`params\` with \`React.use()\`.",
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
                              "description": "A param property was accessed directly with \`params.slug\`. \`params\` is now a Promise and should be unwrapped with \`React.use()\` before accessing properties of the underlying params object. In this version of Next.js direct access to param properties is still supported to facilitate migration but in a future version you will be required to unwrap \`params\` with \`React.use()\`.",
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
        } else {
          it('should not error the build when synchronously reading `params.slug`', async () => {
            try {
              await prerender(`${pathname}/[slug]`)
            } catch (error) {
              throw new Error('expected build not to fail', { cause: error })
            }

            expect(next.cliOutput).toContain(`◐ ${pathname}/[slug] `)
            await next.start({ skipBuild: true })
            const browser = await next.browser(`${pathname}/test`)
            expect(await browser.elementById('param').text()).toBe('undefined')
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

            if (isTurbopack) {
              await expect(browser).toDisplayCollapsedRedbox(`
                            {
                              "description": "Route "/sync-server-params/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
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
            } else {
              // TODO(veil): Source mapping breaks due to double-encoding of the
              // square brackets.
              await expect(browser).toDisplayCollapsedRedbox(`
                            {
                              "description": "Route "/sync-server-params/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                              "environmentLabel": "Prerender",
                              "label": "Console Error",
                              "source": null,
                              "stack": [
                                "ParamsReadingComponent rsc:/Prerender/webpack-internal:///(rsc)/app/sync-server-params/%5Bslug%5D/page.tsx (51:41)",
                                "Page rsc:/Prerender/webpack-internal:///(rsc)/app/sync-server-params/%5Bslug%5D/page.tsx (23:88)",
                              ],
                            }
                          `)
            }
          })
        } else {
          it('should not error the build when synchronously reading `params.slug`', async () => {
            try {
              await prerender(`${pathname}/[slug]`)
            } catch (error) {
              throw new Error('expected build not to fail', { cause: error })
            }

            expect(next.cliOutput).toContain(`◐ ${pathname}/[slug] `)
            await next.start({ skipBuild: true })
            const browser = await next.browser(`${pathname}/test`)
            expect(await browser.elementById('param').text()).toBe('undefined')
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

            if (isTurbopack) {
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
                                "<FIXME-file-protocol>",
                                "LogSafely <anonymous>",
                              ],
                            }
                          `)
            } else {
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
            }
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
                     at SyncIO (turbopack:///[project]/app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx:5:15)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |               ^
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
                     at c (turbopack:///[project]/app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx:9:6)
                    7 |   return (
                    8 |     <main>
                 >  9 |       <h1>Sync IO Access</h1>
                      |      ^
                   10 |       <p suppressHydrationWarning>Current date and time: {data}</p>
                   11 |     </main>
                   12 |   )
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
                     at SyncIO (webpack:///app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx:5:15)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |               ^
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

            // TODO(veil): Source mapping breaks due to double-encoding of the
            // square brackets.
            if (isTurbopack) {
              await expect(browser).toDisplayCollapsedRedbox(`
                            {
                              "description": "Route "/sync-attribution/unguarded-async-guarded-clientsync": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
                              "environmentLabel": "Server",
                              "label": "Console Error",
                              "source": null,
                              "stack": [
                                "<FIXME-file-protocol>",
                                "<FIXME-file-protocol>",
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
                              "source": "app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx (33:16) @ RequestData
                            > 33 | async function RequestData() {
                                 |                ^",
                              "stack": [
                                "RequestData app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx (33:16)",
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
                     at InnerLayoutRouter (webpack://<next-src>)
                     at RedirectErrorBoundary (webpack://<next-src>)
                     at RedirectBoundary (webpack://<next-src>)
                     at HTTPAccessFallbackBoundary (webpack://<next-src>)
                     at LoadingBoundary (webpack://<next-src>)
                     at ErrorBoundary (webpack://<next-src>)
                     at InnerScrollAndFocusHandler (webpack://<next-src>)
                     at ScrollAndFocusHandler (webpack://<next-src>)
                     at RenderFromTemplateContext (<anonymous>)
                     at OuterLayoutRouter (webpack://<next-src>)
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                     at InnerLayoutRouter (webpack://<next-src>)
                     at RedirectErrorBoundary (webpack://<next-src>)
                     at RedirectBoundary (webpack://<next-src>)
                     at HTTPAccessFallbackBoundary (webpack://<next-src>)
                     at LoadingBoundary (webpack://<next-src>)
                     at ErrorBoundary (webpack://<next-src>)
                     at InnerScrollAndFocusHandler (webpack://<next-src>)
                     at ScrollAndFocusHandler (webpack://<next-src>)
                     at RenderFromTemplateContext (<anonymous>)
                     at OuterLayoutRouter (webpack://<next-src>)
                     at InnerLayoutRouter (webpack://<next-src>)
                     at RedirectErrorBoundary (webpack://<next-src>)
                     at RedirectBoundary (webpack://<next-src>)
                     at HTTPAccessFallbackErrorBoundary (webpack://<next-src>)
                     at HTTPAccessFallbackBoundary (webpack://<next-src>)
                     at LoadingBoundary (webpack://<next-src>)
                     at ErrorBoundary (webpack://<next-src>)
                     at InnerScrollAndFocusHandler (webpack://<next-src>)
                     at ScrollAndFocusHandler (webpack://<next-src>)
                     at RenderFromTemplateContext (<anonymous>)
                     at OuterLayoutRouter (webpack://<next-src>)
                   332 |  */
                   333 | function InnerLayoutRouter({
                 > 334 |   tree,
                       |  ^
                   335 |   segmentPath,
                   336 |   cacheNode,
                   337 |   url,
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

            if (isTurbopack) {
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
                                "<FIXME-file-protocol>",
                                "LogSafely <anonymous>",
                              ],
                            }
                          `)
            } else {
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
            }
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
                     at SyncIO (turbopack:///[project]/app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx:5:15)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |               ^
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
                     at c (turbopack:///[project]/app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx:9:6)
                    7 |   return (
                    8 |     <main>
                 >  9 |       <h1>Sync IO Access</h1>
                      |      ^
                   10 |       <p suppressHydrationWarning>Current date and time: {data}</p>
                   11 |     </main>
                   12 |   )
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
                     at SyncIO (webpack:///app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx:5:15)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |               ^
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
  })
})
