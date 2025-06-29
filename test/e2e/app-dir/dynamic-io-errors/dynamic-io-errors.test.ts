import { nextTestSetup } from 'e2e-utils'
import { assertNoErrorToast } from 'next-test-utils'
import { getPrerenderOutput } from './utils'

describe.each([
  { inPrerenderDebugMode: true, name: 'With --prerender-debug' },
  { inPrerenderDebugMode: false, name: 'Without --prerender-debug' },
])('Dynamic IO Errors - $name', ({ inPrerenderDebugMode }) => {
  // We want to skip building and starting in start mode, and in dev mode when
  // prerender debug mode is enabled, which doesn't exist for `next dev`.
  const skipStart =
    process.env.NEXT_TEST_MODE === 'start' || inPrerenderDebugMode

  describe('Dynamic Metadata - Static Route', () => {
    const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/dynamic-metadata-static-route',
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
           "description": "Route "/" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": null,
           "stack": [
             "LogSafely <anonymous> (0:0)",
           ],
         }
        `)
      })
    } else {
      it('should error the build if generateMetadata is dynamic when the rest of the route is prerenderable', async () => {
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
             "Route "/" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(
              getPrerenderOutput(next.cliOutput, {
                isMinified: !inPrerenderDebugMode,
              })
            ).toMatchInlineSnapshot(`
             "Route "/" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        }
      })
    }
  })

  describe('Dynamic Metadata - Error Route', () => {
    const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/dynamic-metadata-error-route',
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

        if (isTurbopack) {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": null,
             "stack": [
               "Dynamic [Server] <anonymous> (1:25)",
               "<FIXME-file-protocol>",
               "main <anonymous> (1:13)",
               "body <anonymous> (1:13)",
               "html <anonymous> (1:13)",
               "Root [Server] <anonymous> (1:22)",
               "JSON.parse <anonymous> (0:0)",
               "JSON.parse <anonymous> (0:0)",
               "LogSafely <anonymous> (0:0)",
             ],
           }
          `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/page.tsx (15:7) @ Page
           > 15 |       <Dynamic />
                |       ^",
             "stack": [
               "Dynamic [Server] <anonymous> (1:25)",
               "Page app/page.tsx (15:7)",
               "main <anonymous> (1:13)",
               "body <anonymous> (1:13)",
               "html <anonymous> (1:13)",
               "Root [Server] <anonymous> (1:22)",
               "JSON.parse <anonymous> (0:0)",
               "JSON.parse <anonymous> (0:0)",
               "LogSafely <anonymous> (0:0)",
             ],
           }
          `)
        }
      })
    } else {
      // This test is just here because there was a bug when dynamic metadata was used alongside another dynamic IO violation which caused the validation to be skipped.
      it('should error the build for the correct reason when there is a dynamic IO violation alongside dynamic metadata', async () => {
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
             "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                 at main (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
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
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        } else {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
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
                 at main (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
               332 |  */
               333 | function InnerLayoutRouter({
             > 334 |   tree,
                   |  ^
               335 |   segmentPath,
               336 |   cacheNode,
               337 |   url,
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
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
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        }
      })
    }
  })

  describe('Dynamic Metadata - Static Route With Suspense', () => {
    const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/dynamic-metadata-static-with-suspense',
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
           "description": "Route "/" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": null,
           "stack": [
             "LogSafely <anonymous> (0:0)",
           ],
         }
        `)
      })
    } else {
      it('should error the build if generateMetadata is dynamic when the rest of the route is prerenderable', async () => {
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
        }
      })
    }
  })

  describe('Dynamic Metadata - Dynamic Route', () => {
    const { next, isNextDev, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/dynamic-metadata-dynamic-route',
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
      it('should partially prerender when all dynamic components are inside a Suspense boundary', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail for fully static project')
        }

        expect(next.cliOutput).toContain('◐ / ')
        const $ = await next.render$('/')
        expect($('#dynamic').text()).toBe('Dynamic')
        expect($('[data-fallback]').length).toBe(1)
      })
    }
  })

  describe('Dynamic Viewport - Static Route', () => {
    const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/dynamic-viewport-static-route',
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
           "description": "Route "/" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": null,
           "stack": [
             "LogSafely <anonymous> (0:0)",
           ],
         }
        `)
      })
    } else {
      it('should error the build if generateViewport is dynamic', async () => {
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
        }
      })
    }
  })

  describe('Dynamic Viewport - Dynamic Route', () => {
    const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/dynamic-viewport-dynamic-route',
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
           "description": "Route "/" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": null,
           "stack": [
             "LogSafely <anonymous> (0:0)",
           ],
         }
        `)
      })
    } else {
      it('should error the build if generateViewport is dynamic even if there are other uses of dynamic on the page', async () => {
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
        }
      })
    }
  })

  describe('Static Route', () => {
    const { next, isNextDev, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/static',
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
      it('should not error the build when all routes are static', async () => {
        try {
          await next.build()
        } catch {
          throw new Error('expected build not to fail for fully static project')
        }
      })
    }
  })

  describe('Dynamic Root', () => {
    const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/dynamic-root',
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

      it('should show a collapsed redbox with two errors', async () => {
        const browser = await next.browser('/')

        if (isTurbopack) {
          await expect(browser).toDisplayCollapsedRedbox(`
           [
             {
               "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/indirection.tsx (7:34) @ IndirectionTwo
           >  7 | export function IndirectionTwo({ children }) {
                |                                  ^",
               "stack": [
                 "FetchingComponent [Server] <anonymous> (1:35)",
                 "IndirectionTwo app/indirection.tsx (7:34)",
                 "<FIXME-file-protocol>",
                 "main <anonymous> (1:13)",
                 "body <anonymous> (1:13)",
                 "html <anonymous> (1:13)",
                 "Root [Server] <anonymous> (1:22)",
                 "JSON.parse <anonymous> (0:0)",
                 "JSON.parse <anonymous> (0:0)",
                 "LogSafely <anonymous> (0:0)",
               ],
             },
             {
               "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "FetchingComponent [Server] <anonymous> (1:35)",
                 "<FIXME-file-protocol>",
                 "main <anonymous> (1:13)",
                 "body <anonymous> (1:13)",
                 "html <anonymous> (1:13)",
                 "Root [Server] <anonymous> (1:22)",
                 "JSON.parse <anonymous> (0:0)",
                 "JSON.parse <anonymous> (0:0)",
                 "LogSafely <anonymous> (0:0)",
               ],
             },
           ]
          `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
           [
             {
               "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/indirection.tsx (7:34) @ IndirectionTwo
           >  7 | export function IndirectionTwo({ children }) {
                |                                  ^",
               "stack": [
                 "FetchingComponent [Server] <anonymous> (1:35)",
                 "IndirectionTwo app/indirection.tsx (7:34)",
                 "Page app/page.tsx (16:9)",
                 "main <anonymous> (1:13)",
                 "body <anonymous> (1:13)",
                 "html <anonymous> (1:13)",
                 "Root [Server] <anonymous> (1:22)",
                 "JSON.parse <anonymous> (0:0)",
                 "JSON.parse <anonymous> (0:0)",
                 "LogSafely <anonymous> (0:0)",
               ],
             },
             {
               "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/page.tsx (16:9) @ Page
           > 16 |         <FetchingComponent nonce="a" cached={true} />
                |         ^",
               "stack": [
                 "FetchingComponent [Server] <anonymous> (1:35)",
                 "Page app/page.tsx (16:9)",
                 "main <anonymous> (1:13)",
                 "body <anonymous> (1:13)",
                 "html <anonymous> (1:13)",
                 "Root [Server] <anonymous> (1:22)",
                 "JSON.parse <anonymous> (0:0)",
                 "JSON.parse <anonymous> (0:0)",
                 "LogSafely <anonymous> (0:0)",
               ],
             },
           ]
          `)
        }
      })
    } else {
      it('should error the build if dynamic IO happens in the root (outside a Suspense)', async () => {
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
             "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
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
             Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                 at main (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
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
             Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
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
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        } else {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                 at IndirectionTwo (webpack:///app/indirection.tsx:7:33)
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
             Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
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
                 at main (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
               332 |  */
               333 | function InnerLayoutRouter({
             > 334 |   tree,
                   |  ^
               335 |   segmentPath,
               336 |   cacheNode,
               337 |   url,
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
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
             Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
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
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        }
      })
    }
  })

  describe('Dynamic Boundary', () => {
    const { next, isNextDev, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/dynamic-boundary',
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
      it('should partially prerender when all dynamic components are inside a Suspense boundary', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail for fully static project')
          // we expect the build to fail
        }

        expect(next.cliOutput).toContain('◐ / ')
        const $ = await next.render$('/')
        expect($('[data-fallback]').length).toBe(2)
      })
    }
  })
})
