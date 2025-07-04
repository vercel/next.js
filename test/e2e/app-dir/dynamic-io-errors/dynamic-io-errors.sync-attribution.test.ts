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
  describe('Error Attribution with Sync IO - Guarded RSC with guarded Client sync IO', () => {
    const { next, skipped } = nextTestSetup({
      files:
        __dirname +
        '/fixtures/sync-attribution/guarded-async-guarded-clientsync',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('does not show a validation error in the dev overlay', async () => {
        const browser = await next.browser('/')
        await assertNoErrorToast(browser)
      })
    } else {
      it('should not error the build sync IO is used inside a Suspense Boundary in a client Component and nothing else is dynamic', async () => {
        try {
          await next.build()
        } catch {
          throw new Error('expected build not to fail')
        }
        expect(next.cliOutput).toContain('◐ / ')
      })
    }
  })

  describe('Error Attribution with Sync IO - Guarded RSC with unguarded Client sync IO', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files:
        __dirname +
        '/fixtures/sync-attribution/guarded-async-unguarded-clientsync',
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
             "Error: Route "/" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
                 at SyncIO (webpack:///app/client.tsx:5:15)
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
        }
      })
    }
  })

  describe('Error Attribution with Sync IO - Unguarded RSC with guarded Client sync IO', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files:
        __dirname +
        '/fixtures/sync-attribution/unguarded-async-guarded-clientsync',
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
             "Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense
                 at section (<anonymous>)
                 at main (<anonymous>)
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
               332 |  */
               333 | function InnerLayoutRouter({
             > 334 |   tree,
                   |  ^
               335 |   segmentPath,
               336 |   cacheNode,
               337 |   url,
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
        }
      })
    }
  })

  describe('Error Attribution with Sync IO - unguarded RSC with unguarded Client sync IO', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files:
        __dirname +
        '/fixtures/sync-attribution/unguarded-async-unguarded-clientsync',
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
             "Error: Route "/" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
                 at SyncIO (webpack:///app/client.tsx:5:15)
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
        }
      })
    }
  })
})
