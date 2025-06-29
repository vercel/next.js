import { isNextDev, nextTestSetup } from 'e2e-utils'
import { assertLog, getPrerenderOutput } from './utils'

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
  describe('Sync Dynamic - With Fallback - client searchParams', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-client-search-with-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      // We don't error the build, but we do show a dev-only error so that users
      // migrate to the async usage.
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/')

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "A searchParam property was accessed directly with \`searchParams.foo\`. \`searchParams\` should be unwrapped with \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/page.tsx (44:5) @ SearchParamsReadingComponent
         > 44 |   ).foo
              |     ^",
           "stack": [
             "SearchParamsReadingComponent app/page.tsx (44:5)",
             "Page app/page.tsx (19:11)",
           ],
         }
        `)
      })
    } else {
      it('should not error the build when synchronously reading search params in a client component if all dynamic access is inside a Suspense boundary', async () => {
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

  describe('Sync Dynamic - Without Fallback - client searchParams', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-client-search-without-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('should show a collapsed redbox with two errors', async () => {
        const browser = await next.browser('/')

        await expect(browser).toDisplayCollapsedRedbox(`
         [
           {
             "description": "Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/page.tsx (48:8) @ LongRunningComponent
         > 48 |     use(
              |        ^",
             "stack": [
               "LongRunningComponent app/page.tsx (48:8)",
               "IndirectionTwo app/indirection.tsx (7:34)",
               "Page app/page.tsx (19:61)",
               "main <anonymous> (1:13)",
               "body <anonymous> (1:13)",
               "html <anonymous> (1:13)",
               "Root [Server] <anonymous> (1:22)",
               "LogSafely <anonymous> (0:0)",
             ],
           },
           {
             "description": "A searchParam property was accessed directly with \`searchParams.foo\`. \`searchParams\` should be unwrapped with \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": null,
             "label": "Console Error",
             "source": "app/page.tsx (42:5) @ SearchParamsReadingComponent
         > 42 |   ).foo
              |     ^",
             "stack": [
               "SearchParamsReadingComponent app/page.tsx (42:5)",
               "Page app/page.tsx (19:11)",
             ],
           },
         ]
        `)
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
                 at LongRunningComponent (<anonymous>)
                 at IndirectionTwo (turbopack:///[project]/app/indirection.tsx:7:33)
                 at Page (turbopack:///[project]/app/page.tsx:19:60)
                 at RenderFromTemplateContext (<anonymous>)
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
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                 at a (<anonymous>)
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
                 at m (<next-dist-dir>)
                 at n (<anonymous>)
                 at o (<next-dist-dir>)
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
                 at LongRunningComponent (<anonymous>)
                 at IndirectionTwo (webpack:///app/indirection.tsx:7:33)
                 at Page (webpack:///app/page.tsx:19:60)
                 at ClientPageRoot (webpack://<next-src>)
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
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                 at a (<anonymous>)
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
                 at m (<next-dist-dir>)
                 at n (<anonymous>)
                 at o (<next-dist-dir>)
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

  describe('Sync Dynamic - With Fallback - server searchParams', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-server-search-with-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      // We don't error the build, but we do show a dev-only error so that users
      // migrate to the async usage.
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/')

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "Route "/" used \`searchParams.foo\`. \`searchParams\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
           "environmentLabel": "Prerender",
           "label": "Console Error",
           "source": "app/page.tsx (42:5) @ SearchParamsReadingComponent
         > 42 |   ).foo
              |     ^",
           "stack": [
             "SearchParamsReadingComponent app/page.tsx (42:5)",
             "Page app/page.tsx (19:11)",
           ],
         }
        `)
      })

      it('should prefix a log after sync dynamic IO with "Server"', async () => {
        const browser = await next.browser('/')
        const logs = await browser.log()

        assertLog(
          logs,
          'Server',
          'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
        )
      })
    } else {
      it('should not error the build when synchronously reading search params in a server component if all dynamic access is inside a Suspense boundary', async () => {
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

  describe('Sync Dynamic - Without Fallback - server searchParams', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-server-search-without-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      // TODO: Ideally we'd only show the error once.
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/')

        await expect(browser).toDisplayCollapsedRedbox(`
         [
           {
             "description": "Route "/" used \`searchParams.foo\`. \`searchParams\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": "app/page.tsx (41:5) @ SearchParamsReadingComponent
         > 41 |   ).foo
              |     ^",
             "stack": [
               "SearchParamsReadingComponent app/page.tsx (41:5)",
               "Page app/page.tsx (20:11)",
             ],
           },
           {
             "description": "Route "/" used \`searchParams.foo\`. \`searchParams\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/page.tsx (41:5) @ SearchParamsReadingComponent
         > 41 |   ).foo
              |     ^",
             "stack": [
               "SearchParamsReadingComponent app/page.tsx (41:5)",
               "LogSafely <anonymous> (0:0)",
             ],
           },
         ]
        `)
      })

      it('should prefix a log after sync dynamic IO with "Server"', async () => {
        const browser = await next.browser('/')
        const logs = await browser.log()

        assertLog(
          logs,
          'Server',
          'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
        )
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
             "Error: Route "/" used \`searchParams.foo\`. \`searchParams\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at SearchParamsReadingComponent (turbopack:///[project]/app/page.tsx:41:4)
               39 |   const fooParams = (
               40 |     searchParams as unknown as UnsafeUnwrappedSearchParams<typeof searchParams>
             > 41 |   ).foo
                  |    ^
               42 |
               43 |   console.log(
               44 |     'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`searchParams.foo\`. \`searchParams\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at a (<next-dist-dir>)
                 at b (<next-dist-dir>)
                 at c (<next-dist-dir>)
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        } else {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`searchParams.foo\`. \`searchParams\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at SearchParamsReadingComponent (webpack:///app/page.tsx:41:4)
               39 |   const fooParams = (
               40 |     searchParams as unknown as UnsafeUnwrappedSearchParams<typeof searchParams>
             > 41 |   ).foo
                  |    ^
               42 |
               43 |   console.log(
               44 |     'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`searchParams.foo\`. \`searchParams\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at a (<next-dist-dir>)
                 at b (<next-dist-dir>)
                 at c (<next-dist-dir>)
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        }
      })
    }
  })

  describe('Sync Dynamic - With Fallback - cookies', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-cookies-with-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      // We don't error the build, but we do show a dev-only error so that users
      // migrate to the async usage.
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/')

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "Route "/" used \`cookies().get('token')\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/page.tsx (33:66) @ CookiesReadingComponent
         > 33 |   const token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
              |                                                                  ^",
           "stack": [
             "CookiesReadingComponent app/page.tsx (33:66)",
             "Page app/page.tsx (16:11)",
           ],
         }
        `)
      })

      it('should prefix a log after sync dynamic IO with "Server"', async () => {
        const browser = await next.browser('/')
        const logs = await browser.log()

        assertLog(
          logs,
          'Server',
          'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
        )
      })
    } else {
      it('should not error the build when synchronously reading cookies if all dynamic access is inside a Suspense boundary', async () => {
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

  describe('Sync Dynamic - Without Fallback - cookies', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-cookies-without-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      // TODO: Ideally we'd only show the error once.
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/')

        await expect(browser).toDisplayCollapsedRedbox(`
         [
           {
             "description": "Route "/" used \`cookies().get('token')\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/page.tsx (32:67) @ CookiesReadingComponent
         > 32 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
              |                                                                   ^",
             "stack": [
               "CookiesReadingComponent app/page.tsx (32:67)",
               "Page app/page.tsx (17:11)",
             ],
           },
           {
             "description": "Route "/" used \`cookies().get('token')\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/page.tsx (32:67) @ CookiesReadingComponent
         > 32 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
              |                                                                   ^",
             "stack": [
               "CookiesReadingComponent app/page.tsx (32:67)",
               "LogSafely <anonymous> (0:0)",
             ],
           },
         ]
        `)
      })

      it('should prefix a log after sync dynamic IO with "Server"', async () => {
        const browser = await next.browser('/')
        const logs = await browser.log()

        assertLog(
          logs,
          'Server',
          'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
        )
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
             "Error: Route "/" used \`cookies().get('token')\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at CookiesReadingComponent (turbopack:///[project]/app/page.tsx:32:66)
               30 | async function CookiesReadingComponent() {
               31 |   await new Promise((r) => process.nextTick(r))
             > 32 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                  |                                                                  ^
               33 |
               34 |   console.log(
               35 |     'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`cookies().get('token')\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at a (<next-dist-dir>)
                 at b (<next-dist-dir>)
                 at c (<next-dist-dir>)
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        } else {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`cookies().get('token')\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at createCookiesAccessError (webpack://<next-src>)
                 at Promise.get (webpack://<next-src>)
                 at CookiesReadingComponent (webpack:///app/page.tsx:32:66)
               579 | ) {
               580 |   const prefix = route ? \`Route "\${route}" \` : 'This route '
             > 581 |   return new Error(
                   |         ^
               582 |     \`\${prefix}used \${expression}. \` +
               583 |       \`\\\`cookies()\\\` should be awaited before using its value. \` +
               584 |       \`Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis\`
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`cookies().get('token')\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at a (<next-dist-dir>)
                 at b (<next-dist-dir>)
                 at c (<next-dist-dir>)
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        }
      })
    }
  })

  describe('Sync Dynamic - draftMode', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-draft-mode',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      // We don't error the build, but we do show a dev-only error so that users
      // migrate to the async usage.
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/')

        if (isTurbopack) {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/" used \`draftMode().isEnabled\`. \`draftMode()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/page.tsx (25:31) @ DraftModeReadingComponent
           > 25 |   const isEnabled = (draftMode() as unknown as UnsafeUnwrappedDraftMode)
                |                               ^",
             "stack": [
               "DraftModeReadingComponent app/page.tsx (25:31)",
               "Page app/page.tsx (16:11)",
             ],
           }
          `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/" used \`draftMode().isEnabled\`. \`draftMode()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/page.tsx (25:21) @ DraftModeReadingComponent
           > 25 |   const isEnabled = (draftMode() as unknown as UnsafeUnwrappedDraftMode)
                |                     ^",
             "stack": [
               "DraftModeReadingComponent app/page.tsx (25:21)",
               "Page app/page.tsx (16:11)",
             ],
           }
          `)
        }
      })

      // TODO: We should not change the `prerenderPhase` flag in this case.
      it.failing(
        'should prefix a log after sync `draftMode().isEnabled` access with "Prerender"',
        async () => {
          const browser = await next.browser('/')
          const logs = await browser.log()

          assertLog(
            logs,
            'Prerender',
            'This log should be prefixed with the "Prerender" environment, because the sync access above does not lead to an abort.'
          )
        }
      )
    } else {
      it('should not error the build when synchronously reading draftMode ', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail for fully static project')
        }

        expect(next.cliOutput).toContain('○ / ')
        const $ = await next.render$('/')
        expect($('#draft-mode').text()).toBe('false')
      })
    }
  })

  describe('Sync Dynamic - With Fallback - headers', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-headers-with-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      // We don't error the build, but we do show a dev-only error so that users
      // migrate to the async usage.
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/')

        await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/" used \`headers().get('user-agent')\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/page.tsx (33:70) @ HeadersReadingComponent
             > 33 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                  |                                                                      ^",
               "stack": [
                 "HeadersReadingComponent app/page.tsx (33:70)",
                 "Page app/page.tsx (16:11)",
               ],
             }
            `)
      })

      it('should prefix a log after sync dynamic IO with "Server"', async () => {
        const browser = await next.browser('/')
        const logs = await browser.log()

        assertLog(
          logs,
          'Server',
          'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
        )
      })
    } else {
      it('should not error the build when synchronously reading headers if all dynamic access is inside a Suspense boundary', async () => {
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

  describe('Sync Dynamic - Without Fallback - headers', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-headers-without-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      // TODO: Ideally we'd only show the error once.
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/')

        await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "description": "Route "/" used \`headers().get('user-agent')\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/page.tsx (32:70) @ HeadersReadingComponent
             > 32 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                  |                                                                      ^",
                 "stack": [
                   "HeadersReadingComponent app/page.tsx (32:70)",
                   "Page app/page.tsx (17:11)",
                 ],
               },
               {
                 "description": "Route "/" used \`headers().get('user-agent')\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/page.tsx (32:70) @ HeadersReadingComponent
             > 32 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                  |                                                                      ^",
                 "stack": [
                   "HeadersReadingComponent app/page.tsx (32:70)",
                   "LogSafely <anonymous> (0:0)",
                 ],
               },
             ]
            `)
      })

      it('should prefix a log after sync dynamic IO with "Server"', async () => {
        const browser = await next.browser('/')
        const logs = await browser.log()

        assertLog(
          logs,
          'Server',
          'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
        )
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
             "Error: Route "/" used \`headers().get('user-agent')\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at HeadersReadingComponent (turbopack:///[project]/app/page.tsx:32:69)
               30 | async function HeadersReadingComponent() {
               31 |   await new Promise((r) => process.nextTick(r))
             > 32 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                  |                                                                     ^
               33 |     'user-agent'
               34 |   )
               35 |
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`headers().get('user-agent')\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at a (<next-dist-dir>)
                 at b (<next-dist-dir>)
                 at c (<next-dist-dir>)
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        } else {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`headers().get('user-agent')\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at createHeadersAccessError (webpack://<next-src>)
                 at Promise.get (webpack://<next-src>)
                 at HeadersReadingComponent (webpack:///app/page.tsx:32:69)
               501 | ) {
               502 |   const prefix = route ? \`Route "\${route}" \` : 'This route '
             > 503 |   return new Error(
                   |         ^
               504 |     \`\${prefix}used \${expression}. \` +
               505 |       \`\\\`headers()\\\` should be awaited before using its value. \` +
               506 |       \`Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis\`
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/" used \`headers().get('user-agent')\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at a (<next-dist-dir>)
                 at b (<next-dist-dir>)
                 at c (<next-dist-dir>)
             Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        }
      })
    }
  })

  describe('Sync Dynamic - With Fallback - params', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-params-with-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      // We don't error the build, but we do show a dev-only error so that users
      // migrate to the async usage.
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/test')

        if (isTurbopack) {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/[slug]/page.tsx (32:23) @ ParamsReadingComponent
             > 32 |   const slug = params.slug
                  |                       ^",
               "stack": [
                 "ParamsReadingComponent app/[slug]/page.tsx (32:23)",
                 "Page app/[slug]/page.tsx (15:11)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": null,
             "stack": [
               "ParamsReadingComponent rsc:/Server/webpack-internal:///(rsc)/app/%5Bslug%5D/page.tsx (85:25)",
               "Page rsc:/Prerender/webpack-internal:///(rsc)/app/%5Bslug%5D/page.tsx (30:106)",
             ],
           }
          `)
        }
      })

      it('should prefix a log after sync dynamic IO with "Server"', async () => {
        const browser = await next.browser('/test')
        const logs = await browser.log()

        assertLog(
          logs,
          'Server',
          'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
        )
      })
    } else {
      it('should not error the build when synchronously reading params if all dynamic access is inside a Suspense boundary', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail for fully static project')
        }

        expect(next.cliOutput).toContain('◐ /[slug] ')
        const $ = await next.render$('/test')
        expect($('[data-fallback]').length).toBe(2)
      })
    }
  })

  describe('Sync Dynamic - Without Fallback - params', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-params-without-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/test')

        if (isTurbopack) {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/[slug]/page.tsx (31:23) @ ParamsReadingComponent
             > 31 |   const slug = params.slug
                  |                       ^",
               "stack": [
                 "ParamsReadingComponent app/[slug]/page.tsx (31:23)",
                 "Page app/[slug]/page.tsx (16:11)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": null,
             "stack": [
               "ParamsReadingComponent rsc:/Server/webpack-internal:///(rsc)/app/%5Bslug%5D/page.tsx (74:25)",
               "Page rsc:/Prerender/webpack-internal:///(rsc)/app/%5Bslug%5D/page.tsx (30:106)",
             ],
           }
          `)
        }
      })

      it('should prefix a log after sync dynamic IO with "Server"', async () => {
        const browser = await next.browser('/test')
        const logs = await browser.log()

        assertLog(
          logs,
          'Server',
          'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
        )
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
             "Error: Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at Reflect.get (<anonymous>)
                 at ParamsReadingComponent (turbopack:///[project]/app/[slug]/page.tsx:31:22)
               29 | async function ParamsReadingComponent({ params }) {
               30 |   await new Promise((r) => process.nextTick(r))
             > 31 |   const slug = params.slug
                  |                      ^
               32 |
               33 |   console.log(
               34 |     'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
             Error occurred prerendering page "/[slug]". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/[slug]/page: /[slug]"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at a (<next-dist-dir>)
                 at b (<next-dist-dir>)
                 at c (<anonymous>)
                 at d (<next-dist-dir>)
                 at e (<next-dist-dir>)
                 at f (<next-dist-dir>)
             Error occurred prerendering page "/[slug]". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /[slug]/page: /[slug], exiting the build."
            `)
          }
        } else {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at Reflect.get (<anonymous>)
                 at ParamsReadingComponent (webpack:///app/[slug]/page.tsx:31:22)
               29 | async function ParamsReadingComponent({ params }) {
               30 |   await new Promise((r) => process.nextTick(r))
             > 31 |   const slug = params.slug
                  |                      ^
               32 |
               33 |   console.log(
               34 |     'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
             Error occurred prerendering page "/[slug]". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/[slug]/page: /[slug]"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at a (<next-dist-dir>)
                 at b (<next-dist-dir>)
                 at c (<anonymous>)
                 at d (<next-dist-dir>)
                 at e (<next-dist-dir>)
                 at f (<next-dist-dir>)
             Error occurred prerendering page "/[slug]". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /[slug]/page: /[slug], exiting the build."
            `)
          }
        }
      })
    }
  })
})
