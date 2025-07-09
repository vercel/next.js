import { isNextDev, nextTestSetup } from 'e2e-utils'
import { assertNoErrorToast } from 'next-test-utils'
import { getPrerenderOutput } from './utils'

describe('Dynamic IO Errors', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: !isNextDev,
    skipDeployment: true,
  })

  let cliOutputLength: number

  beforeEach(async () => {
    cliOutputLength = next.cliOutput.length
  })

  afterEach(async () => {
    await next.stop()
  })

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
  )('$name', ({ inPrerenderDebugMode }) => {
    const build = (pathname: string) =>
      next.build({
        env: {
          NEXT_PRIVATE_APP_PATHS: JSON.stringify([`${pathname}/page.tsx`]),
        },
        args: inPrerenderDebugMode ? ['--debug-prerender'] : [],
      })

    const start = (pathname: string) =>
      next.start({
        env: {
          NEXT_PRIVATE_APP_PATHS: JSON.stringify([`${pathname}/page.tsx`]),
        },
        buildArgs: inPrerenderDebugMode ? ['--debug-prerender'] : [],
      })

    describe('Dynamic Metadata - Static Route', () => {
      const pathname = '/dynamic-metadata-static-route'

      if (skipped) {
        return
      }

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
            await build(pathname)
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
               "Route "/dynamic-metadata-static-route" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
               Error occurred prerendering page "/dynamic-metadata-static-route". Read more: https://nextjs.org/docs/messages/prerender-error
  
               > Export encountered errors on following paths:
                 /dynamic-metadata-static-route/page: /dynamic-metadata-static-route"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Route "/" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
               Error occurred prerendering page "/dynamic-metadata-static-route". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-metadata-static-route/page: /dynamic-metadata-static-route, exiting the build."
              `)
            }
          } else {
            if (inPrerenderDebugMode) {
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

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          if (isTurbopack) {
            // TODO(veil): Source mapping breaks due to double-encoding of the
            // square brackets.
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
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
               "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/page.tsx (20:16) @ Dynamic
             > 20 | async function Dynamic() {
                  |                ^",
               "stack": [
                 "Dynamic app/page.tsx (20:16)",
                 "Page app/page.tsx (15:7)",
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
            await build(pathname)
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
               "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/" in your browser to investigate the error.
               Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
  
               > Export encountered errors on following paths:
                 /page: /"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
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

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata",
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
            await build(pathname)
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
               "Route "/" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
               Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
  
               > Export encountered errors on following paths:
                 /page: /"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Route "/" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
               Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /page: /, exiting the build."
              `)
            }
          } else {
            if (inPrerenderDebugMode) {
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

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should not show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)
          await assertNoErrorToast(browser)
        })
      } else {
        it('should partially prerender when all dynamic components are inside a Suspense boundary', async () => {
          try {
            await start(pathname)
          } catch (error) {
            throw new Error('expected build not to fail', { cause: error })
          }

          expect(next.cliOutput).toContain(`◐ ${pathname}`)
          const $ = await next.render$(pathname)
          expect($('#dynamic').text()).toBe('Dynamic')
          expect($('[data-fallback]').length).toBe(1)
        })
      }
    })

    describe('Dynamic Viewport - Static Route', () => {
      const pathname = '/dynamic-viewport-static-route'

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport",
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
            await build(pathname)
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
               "Route "/" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
  
               > Export encountered errors on following paths:
                 /page: /"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Route "/" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /page: /, exiting the build."
              `)
            }
          } else {
            if (inPrerenderDebugMode) {
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

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport",
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
            await build(pathname)
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
               "Route "/" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
  
               > Export encountered errors on following paths:
                 /page: /"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Route "/" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /page: /, exiting the build."
              `)
            }
          } else {
            if (inPrerenderDebugMode) {
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

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should not show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)
          await assertNoErrorToast(browser)
        })
      } else {
        it('should not error the build when all routes are static', async () => {
          try {
            await build(pathname)
          } catch (error) {
            throw new Error('expected build not to fail', { cause: error })
          }
        })
      }
    })

    describe('Dynamic Root', () => {
      const pathname = '/dynamic-root'

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should show a collapsed redbox with two errors', async () => {
          const browser = await next.browser(pathname)

          if (isTurbopack) {
            // TODO(veil): Source mapping breaks due to double-encoding of the
            // square brackets.
            await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
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
                 "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
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
                 "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/page.tsx (35:16) @ FetchingComponent
             > 35 | async function FetchingComponent({
                  |                ^",
                 "stack": [
                   "FetchingComponent app/page.tsx (35:16)",
                   "Page app/page.tsx (22:9)",
                   "LogSafely <anonymous>",
                 ],
               },
               {
                 "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/page.tsx (35:16) @ FetchingComponent
             > 35 | async function FetchingComponent({
                  |                ^",
                 "stack": [
                   "FetchingComponent app/page.tsx (35:16)",
                   "Page app/page.tsx (27:7)",
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
            await build(pathname)
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
               "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at IndirectionTwo (turbopack:///[project]/app/indirection.tsx:7:33)
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
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/" in your browser to investigate the error.
               Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/" in your browser to investigate the error.
               Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
  
               > Export encountered errors on following paths:
                 /page: /"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
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
                   at l (<next-dist-dir>)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
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
                   at w (<next-dist-dir>)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
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

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should not show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)
          await assertNoErrorToast(browser)
        })
      } else {
        it('should partially prerender when all dynamic components are inside a Suspense boundary', async () => {
          try {
            await start(pathname)
          } catch (error) {
            throw new Error('expected build not to fail', { cause: error })
          }

          expect(next.cliOutput).toContain(`◐ ${pathname} `)
          const $ = await next.render$(pathname)
          expect($('[data-fallback]').length).toBe(2)
        })
      }
    })
  })
})
