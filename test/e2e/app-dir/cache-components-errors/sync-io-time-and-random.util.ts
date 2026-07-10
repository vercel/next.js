import { isNextDev } from 'e2e-utils'
import { getPrerenderOutput } from './utils'
import type { CacheComponentsErrorsContext } from './shared.util'

export function registerSyncIoTimeAndRandomTests(
  ctx: CacheComponentsErrorsContext
) {
  const { next, isTurbopack, isDebugPrerender, prerender } = ctx

  let cliOutputLength: number
  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
  })

  describe('Sync IO - Current Time - Date()', () => {
    const pathname = '/sync-io-current-time/date'

    if (isNextDev) {
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)

        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1295",
             "description": "Next.js encountered the unstable value Date() while prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/sync-io-current-time/date/page.tsx (19:16) @ DateReadingComponent
           > 19 |   return <div>{Date()}</div>
                |                ^",
             "stack": [
               "DateReadingComponent app/sync-io-current-time/date/page.tsx (19:16)",
               "Page app/sync-io-current-time/date/page.tsx (11:9)",
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

        if (isDebugPrerender) {
          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date": Next.js encountered the unstable value \`Date()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
                   at DateReadingComponent (app/sync-io-current-time/date/page.tsx:19:16)
                   at Page (app/sync-io-current-time/date/page.tsx:11:9)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Date()}</div>
                    |                ^
                 20 | }
                 21 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/date" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-current-time/date". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-current-time/date/page: /sync-io-current-time/date"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date": Next.js encountered the unstable value \`Date()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
                   at DateReadingComponent (webpack:///app/sync-io-current-time/date/page.tsx:19:16)
                   at Page (webpack:///app/sync-io-current-time/date/page.tsx:11:9)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Date()}</div>
                    |                ^
                 20 | }
                 21 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/date" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-current-time/date". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-current-time/date/page: /sync-io-current-time/date"
              `)
          }
        } else {
          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date": Next.js encountered the unstable value \`Date()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
                   at a (app/sync-io-current-time/date/page.tsx:19:16)
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
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date": Next.js encountered the unstable value \`Date()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
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
             "code": "E1295",
             "description": "Next.js encountered the unstable value Date.now() while prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/sync-io-current-time/date-now/page.tsx (19:21) @ DateReadingComponent
           > 19 |   return <div>{Date.now()}</div>
                |                     ^",
             "stack": [
               "DateReadingComponent app/sync-io-current-time/date-now/page.tsx (19:21)",
               "Page app/sync-io-current-time/date-now/page.tsx (11:9)",
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

        if (isDebugPrerender) {
          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date-now": Next.js encountered the unstable value \`Date.now()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
                   at DateReadingComponent (app/sync-io-current-time/date-now/page.tsx:19:21)
                   at Page (app/sync-io-current-time/date-now/page.tsx:11:9)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Date.now()}</div>
                    |                     ^
                 20 | }
                 21 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/date-now" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-current-time/date-now". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-current-time/date-now/page: /sync-io-current-time/date-now"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date-now": Next.js encountered the unstable value \`Date.now()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
                   at DateReadingComponent (webpack:///app/sync-io-current-time/date-now/page.tsx:19:21)
                   at Page (webpack:///app/sync-io-current-time/date-now/page.tsx:11:9)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Date.now()}</div>
                    |                     ^
                 20 | }
                 21 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/date-now" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-current-time/date-now". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-current-time/date-now/page: /sync-io-current-time/date-now"
              `)
          }
        } else {
          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date-now": Next.js encountered the unstable value \`Date.now()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
                   at a (app/sync-io-current-time/date-now/page.tsx:19:21)
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
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/date-now": Next.js encountered the unstable value \`Date.now()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
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
             "code": "E1295",
             "description": "Next.js encountered the unstable value new Date() while prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/sync-io-current-time/new-date/page.tsx (19:16) @ DateReadingComponent
           > 19 |   return <div>{new Date().toString()}</div>
                |                ^",
             "stack": [
               "DateReadingComponent app/sync-io-current-time/new-date/page.tsx (19:16)",
               "Page app/sync-io-current-time/new-date/page.tsx (11:9)",
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

        if (isDebugPrerender) {
          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/new-date": Next.js encountered the unstable value \`new Date()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
                   at DateReadingComponent (app/sync-io-current-time/new-date/page.tsx:19:16)
                   at Page (app/sync-io-current-time/new-date/page.tsx:11:9)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{new Date().toString()}</div>
                    |                ^
                 20 | }
                 21 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/new-date" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-current-time/new-date". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-current-time/new-date/page: /sync-io-current-time/new-date"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/new-date": Next.js encountered the unstable value \`new Date()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
                   at DateReadingComponent (webpack:///app/sync-io-current-time/new-date/page.tsx:19:16)
                   at Page (webpack:///app/sync-io-current-time/new-date/page.tsx:11:9)
                 17 | async function DateReadingComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{new Date().toString()}</div>
                    |                ^
                 20 | }
                 21 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-current-time/new-date" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-current-time/new-date". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-current-time/new-date/page: /sync-io-current-time/new-date"
              `)
          }
        } else {
          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/new-date": Next.js encountered the unstable value \`new Date()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
                   at a (app/sync-io-current-time/new-date/page.tsx:19:16)
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
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-current-time/new-date": Next.js encountered the unstable value \`new Date()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
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
             "code": "E1295",
             "description": "Next.js encountered the unstable value Math.random() while prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/sync-io-random/math-random/page.tsx (19:21) @ SyncIOComponent
           > 19 |   return <div>{Math.random()}</div>
                |                     ^",
             "stack": [
               "SyncIOComponent app/sync-io-random/math-random/page.tsx (19:21)",
               "Page app/sync-io-random/math-random/page.tsx (11:9)",
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

        if (isDebugPrerender) {
          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-random/math-random": Next.js encountered the unstable value \`Math.random()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (app/sync-io-random/math-random/page.tsx:19:21)
                   at Page (app/sync-io-random/math-random/page.tsx:11:9)
                 17 | async function SyncIOComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Math.random()}</div>
                    |                     ^
                 20 | }
                 21 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-random/math-random" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-random/math-random". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-random/math-random/page: /sync-io-random/math-random"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-random/math-random": Next.js encountered the unstable value \`Math.random()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (webpack:///app/sync-io-random/math-random/page.tsx:19:21)
                   at Page (webpack:///app/sync-io-random/math-random/page.tsx:11:9)
                 17 | async function SyncIOComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{Math.random()}</div>
                    |                     ^
                 20 | }
                 21 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-random/math-random" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-random/math-random". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-random/math-random/page: /sync-io-random/math-random"
              `)
          }
        } else {
          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-random/math-random": Next.js encountered the unstable value \`Math.random()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at a (app/sync-io-random/math-random/page.tsx:19:21)
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
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-random/math-random": Next.js encountered the unstable value \`Math.random()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
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
             "code": "E1295",
             "description": "Next.js encountered the unstable value crypto.getRandomValues() while prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/sync-io-web-crypto/get-random-value/page.tsx (20:10) @ SyncIOComponent
           > 20 |   crypto.getRandomValues(buffer)
                |          ^",
             "stack": [
               "SyncIOComponent app/sync-io-web-crypto/get-random-value/page.tsx (20:10)",
               "Page app/sync-io-web-crypto/get-random-value/page.tsx (11:9)",
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

        if (isDebugPrerender) {
          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/get-random-value": Next.js encountered the unstable value \`crypto.getRandomValues()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#cache-the-generated-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#render-on-the-client
                   at SyncIOComponent (app/sync-io-web-crypto/get-random-value/page.tsx:20:10)
                   at Page (app/sync-io-web-crypto/get-random-value/page.tsx:11:9)
                 18 |   await new Promise((r) => process.nextTick(r))
                 19 |   const buffer = new Uint8Array(8)
               > 20 |   crypto.getRandomValues(buffer)
                    |          ^
                 21 |   return <div>{buffer.toString()}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-web-crypto/get-random-value" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-web-crypto/get-random-value". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-web-crypto/get-random-value/page: /sync-io-web-crypto/get-random-value"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/get-random-value": Next.js encountered the unstable value \`crypto.getRandomValues()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#cache-the-generated-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#render-on-the-client
                   at SyncIOComponent (webpack:///app/sync-io-web-crypto/get-random-value/page.tsx:20:10)
                   at Page (webpack:///app/sync-io-web-crypto/get-random-value/page.tsx:11:9)
                 18 |   await new Promise((r) => process.nextTick(r))
                 19 |   const buffer = new Uint8Array(8)
               > 20 |   crypto.getRandomValues(buffer)
                    |          ^
                 21 |   return <div>{buffer.toString()}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-web-crypto/get-random-value" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-web-crypto/get-random-value". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-web-crypto/get-random-value/page: /sync-io-web-crypto/get-random-value"
              `)
          }
        } else {
          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/get-random-value": Next.js encountered the unstable value \`crypto.getRandomValues()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#cache-the-generated-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#render-on-the-client
                   at a (app/sync-io-web-crypto/get-random-value/page.tsx:20:10)
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
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/get-random-value": Next.js encountered the unstable value \`crypto.getRandomValues()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#cache-the-generated-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#render-on-the-client
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
             "code": "E1295",
             "description": "Next.js encountered the unstable value crypto.randomUUID() while prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/sync-io-web-crypto/random-uuid/page.tsx (19:23) @ SyncIOComponent
           > 19 |   return <div>{crypto.randomUUID()}</div>
                |                       ^",
             "stack": [
               "SyncIOComponent app/sync-io-web-crypto/random-uuid/page.tsx (19:23)",
               "Page app/sync-io-web-crypto/random-uuid/page.tsx (11:9)",
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

        if (isDebugPrerender) {
          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/random-uuid": Next.js encountered the unstable value \`crypto.randomUUID()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#cache-the-generated-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#render-on-the-client
                   at SyncIOComponent (app/sync-io-web-crypto/random-uuid/page.tsx:19:23)
                   at Page (app/sync-io-web-crypto/random-uuid/page.tsx:11:9)
                 17 | async function SyncIOComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{crypto.randomUUID()}</div>
                    |                       ^
                 20 | }
                 21 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-web-crypto/random-uuid" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-web-crypto/random-uuid". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-web-crypto/random-uuid/page: /sync-io-web-crypto/random-uuid"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/random-uuid": Next.js encountered the unstable value \`crypto.randomUUID()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#cache-the-generated-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#render-on-the-client
                   at SyncIOComponent (webpack:///app/sync-io-web-crypto/random-uuid/page.tsx:19:23)
                   at Page (webpack:///app/sync-io-web-crypto/random-uuid/page.tsx:11:9)
                 17 | async function SyncIOComponent() {
                 18 |   await new Promise((r) => process.nextTick(r))
               > 19 |   return <div>{crypto.randomUUID()}</div>
                    |                       ^
                 20 | }
                 21 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-web-crypto/random-uuid" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-web-crypto/random-uuid". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-web-crypto/random-uuid/page: /sync-io-web-crypto/random-uuid"
              `)
          }
        } else {
          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/random-uuid": Next.js encountered the unstable value \`crypto.randomUUID()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#cache-the-generated-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#render-on-the-client
                   at a (app/sync-io-web-crypto/random-uuid/page.tsx:19:23)
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
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-web-crypto/random-uuid": Next.js encountered the unstable value \`crypto.randomUUID()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#cache-the-generated-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#render-on-the-client
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
}
