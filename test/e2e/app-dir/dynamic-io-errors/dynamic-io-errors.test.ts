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

    describe('Sync Dynamic', () => {
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
           "source": "app/page.tsx (26:5) @ SearchParamsReadingComponent
         > 26 |   ).foo
              |     ^",
           "stack": [
             "SearchParamsReadingComponent app/page.tsx (26:5)",
             "Page app/page.tsx (14:7)",
           ],
         }
        `)
          })
        } else {
          it('should not error the build when synchronously reading `searchParams.foo`', async () => {
            try {
              await start(pathname)
            } catch (error) {
              throw new Error('expected build not to fail', { cause: error })
            }

            expect(next.cliOutput).toContain(`◐ ${pathname} `)
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
           "description": "Route "/" used \`searchParams.foo\`. \`searchParams\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
           "environmentLabel": "Prerender",
           "label": "Console Error",
           "source": "app/page.tsx (30:5) @ SearchParamsReadingComponent
         > 30 |   ).foo
              |     ^",
           "stack": [
             "SearchParamsReadingComponent app/page.tsx (30:5)",
             "Page app/page.tsx (15:7)",
           ],
         }
        `)
          })
        } else {
          it('should not error the build when synchronously reading `searchParams.foo`', async () => {
            try {
              await start(pathname)
            } catch (error) {
              throw new Error('expected build not to fail', { cause: error })
            }

            expect(next.cliOutput).toContain(`◐ ${pathname} `)
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
               "description": "Route "/" used \`cookies().get\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/page.tsx (17:26) @ CookiesReadingComponent
           > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                |                          ^",
               "stack": [
                 "CookiesReadingComponent app/page.tsx (17:26)",
                 "Page app/page.tsx (11:7)",
               ],
             },
             {
               "description": "(0 , <turbopack-module-id>.cookies)(...).get is not a function",
               "environmentLabel": "Prerender",
               "label": "Runtime TypeError",
               "source": "app/page.tsx (17:67) @ CookiesReadingComponent
           > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                |                                                                   ^",
               "stack": [
                 "CookiesReadingComponent app/page.tsx (17:67)",
               ],
             },
           ]
          `)
            } else {
              await expect(browser).toDisplayRedbox(`
           [
             {
               "description": "Route "/" used \`cookies().get\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/page.tsx (17:18) @ CookiesReadingComponent
           > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                |                  ^",
               "stack": [
                 "CookiesReadingComponent app/page.tsx (17:18)",
                 "Page app/page.tsx (11:7)",
               ],
             },
             {
               "description": "(0 , <webpack-module-id>.cookies)(...).get is not a function",
               "environmentLabel": "Prerender",
               "label": "Runtime TypeError",
               "source": "app/page.tsx (17:67) @ CookiesReadingComponent
           > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                |                                                                   ^",
               "stack": [
                 "CookiesReadingComponent app/page.tsx (17:67)",
               ],
             },
           ]
          `)
            }
          })
        } else {
          it('should error the build with a runtime error', async () => {
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
                              "Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
                              TypeError: <module-function>().get is not a function
                                  at CookiesReadingComponent (turbopack:///[project]/app/page.tsx:17:66)
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
                              	/page: /"
                            `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                              "Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
                              TypeError: <module-function>().get is not a function
                                  at a (<next-dist-dir>)
                                  at b (<anonymous>) {
                                digest: '<error-digest>'
                              }
                              Export encountered an error on /page: /, exiting the build."
                            `)
              }
            } else {
              if (inPrerenderDebugMode) {
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
             "description": "Route "/" used \`draftMode().isEnabled\`. \`draftMode()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": "app/page.tsx (23:31) @ DraftModeReadingComponent
           > 23 |   const isEnabled = (draftMode() as unknown as UnsafeUnwrappedDraftMode)
                |                               ^",
             "stack": [
               "DraftModeReadingComponent app/page.tsx (23:31)",
               "Page app/page.tsx (13:7)",
             ],
           }
          `)
            } else {
              await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/" used \`draftMode().isEnabled\`. \`draftMode()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": "app/page.tsx (23:21) @ DraftModeReadingComponent
           > 23 |   const isEnabled = (draftMode() as unknown as UnsafeUnwrappedDraftMode)
                |                     ^",
             "stack": [
               "DraftModeReadingComponent app/page.tsx (23:21)",
               "Page app/page.tsx (13:7)",
             ],
           }
          `)
            }
          })
        } else {
          it('should not error the build when synchronously reading `draftMode().isEnabled`', async () => {
            try {
              await start(pathname)
            } catch (error) {
              throw new Error('expected build not to fail', { cause: error })
            }

            expect(next.cliOutput).toContain(`◐ ${pathname} `)
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
               "description": "Route "/" used \`headers().get\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/page.tsx (17:29) @ HeadersReadingComponent
           > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                |                             ^",
               "stack": [
                 "HeadersReadingComponent app/page.tsx (17:29)",
                 "Page app/page.tsx (11:7)",
               ],
             },
             {
               "description": "(0 , <turbopack-module-id>.headers)(...).get is not a function",
               "environmentLabel": "Prerender",
               "label": "Runtime TypeError",
               "source": "app/page.tsx (17:70) @ HeadersReadingComponent
           > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                |                                                                      ^",
               "stack": [
                 "HeadersReadingComponent app/page.tsx (17:70)",
               ],
             },
           ]
          `)
            } else {
              await expect(browser).toDisplayRedbox(`
           [
             {
               "description": "Route "/" used \`headers().get\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/page.tsx (17:21) @ HeadersReadingComponent
           > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                |                     ^",
               "stack": [
                 "HeadersReadingComponent app/page.tsx (17:21)",
                 "Page app/page.tsx (11:7)",
               ],
             },
             {
               "description": "(0 , <webpack-module-id>.headers)(...).get is not a function",
               "environmentLabel": "Prerender",
               "label": "Runtime TypeError",
               "source": "app/page.tsx (17:70) @ HeadersReadingComponent
           > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                |                                                                      ^",
               "stack": [
                 "HeadersReadingComponent app/page.tsx (17:70)",
               ],
             },
           ]
          `)
            }
          })
        } else {
          it('should error the build with a runtime error', async () => {
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
                              "Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
                              TypeError: <module-function>().get is not a function
                                  at HeadersReadingComponent (turbopack:///[project]/app/page.tsx:17:69)
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
                              	/page: /"
                            `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                              "Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
                              TypeError: <module-function>().get is not a function
                                  at a (<next-dist-dir>)
                                  at b (<anonymous>) {
                                digest: '<error-digest>'
                              }
                              Export encountered an error on /page: /, exiting the build."
                            `)
              }
            } else {
              if (inPrerenderDebugMode) {
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
             "source": "app/[slug]/page.tsx (20:39) @ ParamsReadingComponent
           > 20 |       <span id="param">{String(params.slug)}</span>
                |                                       ^",
             "stack": [
               "ParamsReadingComponent app/[slug]/page.tsx (20:39)",
               "Page app/[slug]/page.tsx (11:7)",
             ],
           }
          `)
            } else {
              await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "A param property was accessed directly with \`params.slug\`. \`params\` is now a Promise and should be unwrapped with \`React.use()\` before accessing properties of the underlying params object. In this version of Next.js direct access to param properties is still supported to facilitate migration but in a future version you will be required to unwrap \`params\` with \`React.use()\`.",
             "environmentLabel": null,
             "label": "Console Error",
             "source": "app/[slug]/page.tsx (20:39) @ ParamsReadingComponent
           > 20 |       <span id="param">{String(params.slug)}</span>
                |                                       ^",
             "stack": [
               "ParamsReadingComponent app/[slug]/page.tsx (20:39)",
               "Page app/[slug]/page.tsx (11:7)",
             ],
           }
          `)
            }
          })
        } else {
          it('should not error the build when synchronously reading `params.slug`', async () => {
            try {
              await start(`${pathname}/[slug]`)
            } catch (error) {
              throw new Error('expected build not to fail', { cause: error })
            }

            expect(next.cliOutput).toContain(`◐ ${pathname}/[slug] `)
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
             "description": "Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": "app/[slug]/page.tsx (24:39) @ ParamsReadingComponent
           > 24 |       <span id="param">{String(params.slug)}</span>
                |                                       ^",
             "stack": [
               "ParamsReadingComponent app/[slug]/page.tsx (24:39)",
               "Page app/[slug]/page.tsx (12:7)",
             ],
           }
          `)
            } else {
              // TODO(veil): Source mapping breaks due to double-encoding of the
              // square brackets.
              await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": null,
             "stack": [
               "ParamsReadingComponent rsc:/Prerender/webpack-internal:///(rsc)/app/%5Bslug%5D/page.tsx (51:41)",
               "Page rsc:/Prerender/webpack-internal:///(rsc)/app/%5Bslug%5D/page.tsx (23:88)",
             ],
           }
          `)
            }
          })
        } else {
          it('should not error the build when synchronously reading `params.slug`', async () => {
            try {
              await start(`${pathname}/[slug]`)
            } catch (error) {
              throw new Error('expected build not to fail', { cause: error })
            }

            expect(next.cliOutput).toContain(`◐ ${pathname}/[slug] `)
            const browser = await next.browser(`${pathname}/test`)
            expect(await browser.elementById('param').text()).toBe('undefined')
          })
        }
      })
    })

    describe('Error Attribution with Sync IO', () => {
      describe('Error Attribution with Sync IO - Guarded RSC with guarded Client sync IO', () => {
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
              await build(pathname)
            } catch (error) {
              throw new Error('expected build not to fail', { cause: error })
            }
            expect(next.cliOutput).toContain(`◐ ${pathname}`)
          })
        }
      })

      describe('Error Attribution with Sync IO - Guarded RSC with unguarded Client sync IO', () => {
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
             "description": "Route "/" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/client.tsx (5:16) @ SyncIO
           > 5 |   const data = new Date().toISOString()
               |                ^",
             "stack": [
               "SyncIO app/client.tsx (5:16)",
               "<FIXME-file-protocol>",
               "LogSafely <anonymous>",
             ],
           }
          `)
            } else {
              await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/client.tsx (5:16) @ SyncIO
           > 5 |   const data = new Date().toISOString()
               |                ^",
             "stack": [
               "SyncIO app/client.tsx (5:16)",
               "Page app/page.tsx (22:9)",
               "LogSafely <anonymous>",
             ],
           }
          `)
            }
          })
        } else {
          it('should error the build with a reason related to sync IO access', async () => {
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
                              "Error: Route "/" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
                                  at SyncIO (turbopack:///[project]/app/client.tsx:5:15)
                                3 | export function SyncIO() {
                                4 |   // This is a sync IO access that should not cause an error
                              > 5 |   const data = new Date().toISOString()
                                  |               ^
                                6 |
                                7 |   return (
                                8 |     <main>
                              To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/" in your browser to investigate the error.
                              Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

                              > Export encountered errors on following paths:
                              	/page: /"
                            `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                              "Error: Route "/" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
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

      describe('Error Attribution with Sync IO - Unguarded RSC with guarded Client sync IO', () => {
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
             "source": "app/page.tsx (33:16) @ RequestData
           > 33 | async function RequestData() {
                |                ^",
             "stack": [
               "RequestData app/page.tsx (33:16)",
               "Page app/page.tsx (27:9)",
               "LogSafely <anonymous>",
             ],
           }
          `)
            }
          })
        } else {
          it('should error the build with a reason related dynamic data', async () => {
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
                                  at section (<anonymous>)
                                  at main (<anonymous>)
                                  at RenderFromTemplateContext (<anonymous>)
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
                                  at j (<next-dist-dir>)
                                  at k (<anonymous>)
                                  at l (<next-dist-dir>)
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

      describe('Error Attribution with Sync IO - unguarded RSC with unguarded Client sync IO', () => {
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
             "description": "Route "/" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/client.tsx (5:16) @ SyncIO
           > 5 |   const data = new Date().toISOString()
               |                ^",
             "stack": [
               "SyncIO app/client.tsx (5:16)",
               "<FIXME-file-protocol>",
               "LogSafely <anonymous>",
             ],
           }
          `)
            } else {
              await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/client.tsx (5:16) @ SyncIO
           > 5 |   const data = new Date().toISOString()
               |                ^",
             "stack": [
               "SyncIO app/client.tsx (5:16)",
               "Page app/page.tsx (22:9)",
               "LogSafely <anonymous>",
             ],
           }
          `)
            }
          })
        } else {
          it('should error the build with a reason related to sync IO access', async () => {
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
                              "Error: Route "/" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
                                  at SyncIO (turbopack:///[project]/app/client.tsx:5:15)
                                3 | export function SyncIO() {
                                4 |   // This is a sync IO access that should not cause an error
                              > 5 |   const data = new Date().toISOString()
                                  |               ^
                                6 |
                                7 |   return (
                                8 |     <main>
                              To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/" in your browser to investigate the error.
                              Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

                              > Export encountered errors on following paths:
                              	/page: /"
                            `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                              "Error: Route "/" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
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
