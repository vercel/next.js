import { isNextDev } from 'e2e-utils'
import { getPrerenderOutput } from './utils'
import type { CacheComponentsErrorsContext } from './shared.util'

export function registerSyncDynamicTests(ctx: CacheComponentsErrorsContext) {
  const { next, isTurbopack, isRspack, isDebugPrerender, prerender, skipped } =
    ctx

  let cliOutputLength: number
  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
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
               "code": "E1295",
               "description": "Next.js encountered the unstable value Math.random() while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-random-with-fallback/page.tsx (37:23) @ RandomReadingComponent
             > 37 |   const random = Math.random()
                  |                       ^",
               "stack": [
                 "RandomReadingComponent app/sync-random-with-fallback/page.tsx (37:23)",
                 "Page app/sync-random-with-fallback/page.tsx (18:11)",
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

          if (isDebugPrerender) {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-with-fallback": Next.js encountered the unstable value \`Math.random()\` while prerendering.

                 This value can change between renders, so it must be either prerendered or computed later.

                 Ways to fix this:
                   - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                     https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                   - [cache] Prerender and cache the value with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                   - [client] Render the value on the client with \`"use client"\`
                     https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                     at RandomReadingComponent (app/sync-random-with-fallback/page.tsx:37:23)
                     at Page (app/sync-random-with-fallback/page.tsx:18:11)
                   35 |     use(new Promise((r) => process.nextTick(r)))
                   36 |   }
                 > 37 |   const random = Math.random()
                      |                       ^
                   38 |   return (
                   39 |     <div>
                   40 |       <span id="rand">{random}</span>
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-random-with-fallback" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-random-with-fallback". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/sync-random-with-fallback/page: /sync-random-with-fallback"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-with-fallback": Next.js encountered the unstable value \`Math.random()\` while prerendering.

                 This value can change between renders, so it must be either prerendered or computed later.

                 Ways to fix this:
                   - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                     https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                   - [cache] Prerender and cache the value with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                   - [client] Render the value on the client with \`"use client"\`
                     https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                     at RandomReadingComponent (webpack:///app/sync-random-with-fallback/page.tsx:37:23)
                     at Page (webpack:///app/sync-random-with-fallback/page.tsx:18:11)
                   35 |     use(new Promise((r) => process.nextTick(r)))
                   36 |   }
                 > 37 |   const random = Math.random()
                      |                       ^
                   38 |   return (
                   39 |     <div>
                   40 |       <span id="rand">{random}</span>
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-random-with-fallback" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-random-with-fallback". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/sync-random-with-fallback/page: /sync-random-with-fallback"
                `)
            }
          } else {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-with-fallback": Next.js encountered the unstable value \`Math.random()\` while prerendering.

                 This value can change between renders, so it must be either prerendered or computed later.

                 Ways to fix this:
                   - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                     https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                   - [cache] Prerender and cache the value with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                   - [client] Render the value on the client with \`"use client"\`
                     https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                     at a (app/sync-random-with-fallback/page.tsx:37:23)
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
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-with-fallback": Next.js encountered the unstable value \`Math.random()\` while prerendering.

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
               "code": "E1295",
               "description": "Next.js encountered the unstable value Math.random() while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-random-without-fallback/page.tsx (32:15) @ getRandomNumber
             > 32 |   return Math.random()
                  |               ^",
               "stack": [
                 "getRandomNumber app/sync-random-without-fallback/page.tsx (32:15)",
                 "RandomReadingComponent app/sync-random-without-fallback/page.tsx (40:18)",
                 "Page app/sync-random-without-fallback/page.tsx (18:11)",
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

          if (isDebugPrerender) {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-without-fallback": Next.js encountered the unstable value \`Math.random()\` while prerendering.

                 This value can change between renders, so it must be either prerendered or computed later.

                 Ways to fix this:
                   - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                     https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                   - [cache] Prerender and cache the value with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                   - [client] Render the value on the client with \`"use client"\`
                     https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                     at getRandomNumber (app/sync-random-without-fallback/page.tsx:32:15)
                     at RandomReadingComponent (app/sync-random-without-fallback/page.tsx:40:18)
                     at Page (app/sync-random-without-fallback/page.tsx:18:11)
                   30 |
                   31 | function getRandomNumber() {
                 > 32 |   return Math.random()
                      |               ^
                   33 | }
                   34 |
                   35 | function RandomReadingComponent() {
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-random-without-fallback" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-random-without-fallback". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/sync-random-without-fallback/page: /sync-random-without-fallback"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-without-fallback": Next.js encountered the unstable value \`Math.random()\` while prerendering.

                 This value can change between renders, so it must be either prerendered or computed later.

                 Ways to fix this:
                   - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                     https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                   - [cache] Prerender and cache the value with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                   - [client] Render the value on the client with \`"use client"\`
                     https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                     at getRandomNumber (webpack:///app/sync-random-without-fallback/page.tsx:32:15)
                     at RandomReadingComponent (webpack:///app/sync-random-without-fallback/page.tsx:40:18)
                     at Page (webpack:///app/sync-random-without-fallback/page.tsx:18:11)
                   30 |
                   31 | function getRandomNumber() {
                 > 32 |   return Math.random()
                      |               ^
                   33 | }
                   34 |
                   35 | function RandomReadingComponent() {
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-random-without-fallback" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-random-without-fallback". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/sync-random-without-fallback/page: /sync-random-without-fallback"
                `)
            }
          } else {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-without-fallback": Next.js encountered the unstable value \`Math.random()\` while prerendering.

                 This value can change between renders, so it must be either prerendered or computed later.

                 Ways to fix this:
                   - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                     https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                   - [cache] Prerender and cache the value with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                   - [client] Render the value on the client with \`"use client"\`
                     https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                     at a (app/sync-random-without-fallback/page.tsx:32:15)
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
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-random-without-fallback": Next.js encountered the unstable value \`Math.random()\` while prerendering.

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
               "code": "E394",
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
                   "description": "<turbopack-module-id>.cookies(...).get is not a function",
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
                   "description": "(0 , next_headers__rspack_import_1.cookies)(...).get is not a function",
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

          if (isDebugPrerender) {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-cookies". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at CookiesReadingComponent (app/sync-cookies/page.tsx:18:36)
                   16 | async function CookiesReadingComponent() {
                   17 |   // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
                 > 18 |   const token = (cookies() as any).get('token')
                      |                                    ^
                   19 |
                   20 |   return (
                   21 |     <div> {
                   digest: '<error-digest>'
                 }

                 > Export encountered errors on 1 path:
                 	/sync-cookies/page: /sync-cookies"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-cookies". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at CookiesReadingComponent (webpack:///app/sync-cookies/page.tsx:18:36)
                   16 | async function CookiesReadingComponent() {
                   17 |   // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
                 > 18 |   const token = (cookies() as any).get('token')
                      |                                    ^
                   19 |
                   20 |   return (
                   21 |     <div> {
                   digest: '<error-digest>'
                 }

                 > Export encountered errors on 1 path:
                 	/sync-cookies/page: /sync-cookies"
                `)
            }
          } else {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-cookies". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at a (app/sync-cookies/page.tsx:18:36)
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
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-cookies". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at a (<next-dist-dir>) {
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
                   "description": "<turbopack-module-id>.cookies(...).get is not a function",
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
                   "description": "(0 , next_headers__rspack_import_1.cookies)(...).get is not a function",
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

          if (isTurbopack || isRspack) {
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
                   "description": "<turbopack-module-id>.headers(...).get is not a function",
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
                   "description": "(0 , next_headers__rspack_import_1.headers)(...).get is not a function",
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

          if (isDebugPrerender) {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-headers". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at HeadersReadingComponent (app/sync-headers/page.tsx:18:40)
                   16 | async function HeadersReadingComponent() {
                   17 |   // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
                 > 18 |   const userAgent = (headers() as any).get('user-agent')
                      |                                        ^
                   19 |   return (
                   20 |     <div>
                   21 |       this component reads the \`user-agent\` header synchronously: {userAgent} {
                   digest: '<error-digest>'
                 }

                 > Export encountered errors on 1 path:
                 	/sync-headers/page: /sync-headers"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-headers". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at HeadersReadingComponent (webpack:///app/sync-headers/page.tsx:18:40)
                   16 | async function HeadersReadingComponent() {
                   17 |   // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
                 > 18 |   const userAgent = (headers() as any).get('user-agent')
                      |                                        ^
                   19 |   return (
                   20 |     <div>
                   21 |       this component reads the \`user-agent\` header synchronously: {userAgent} {
                   digest: '<error-digest>'
                 }

                 > Export encountered errors on 1 path:
                 	/sync-headers/page: /sync-headers"
                `)
            }
          } else {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-headers". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at a (app/sync-headers/page.tsx:18:40)
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
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error occurred prerendering page "/sync-headers". Read more: https://nextjs.org/docs/messages/prerender-error
                 TypeError: <module-function>().get is not a function
                     at a (<next-dist-dir>) {
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
                   "description": "<turbopack-module-id>.headers(...).get is not a function",
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
                   "description": "(0 , next_headers__rspack_import_1.headers)(...).get is not a function",
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

          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E394",
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
}
