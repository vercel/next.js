import { isNextDev } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { getDeterministicOutput, getPrerenderOutput } from './utils'
import type { CacheComponentsErrorsContext } from './shared.util'

export function registerUseCacheTests(ctx: CacheComponentsErrorsContext) {
  const { next, isTurbopack, isDebugPrerender, prerender } = ctx

  let cliOutputLength: number
  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
  })

  describe('Inside `use cache`', () => {
    describe('cookies', () => {
      const pathname = '/use-cache-cookies'

      if (isNextDev) {
        it('should show a redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E831",
               "description": "Route /use-cache-cookies used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/use-cache-cookies/page.tsx (22:18) @ CookiesReadingComponent
             > 22 |     await cookies()
                  |                  ^",
               "stack": [
                 "CookiesReadingComponent app/use-cache-cookies/page.tsx (22:18)",
                 "Page app/use-cache-cookies/page.tsx (10:7)",
               ],
             }
            `)
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
                     at CookiesReadingComponent (app/use-cache-cookies/page.tsx:22:18)
                     at Page (app/use-cache-cookies/page.tsx:10:7)
                   20 |   // in userland.
                   21 |   try {
                 > 22 |     await cookies()
                      |                  ^
                   23 |   } catch {}
                   24 |
                   25 |   return null
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-cookies" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-cookies". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-cookies/page: /use-cache-cookies"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-cookies used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at a (app/use-cache-cookies/page.tsx:22:11)
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
                     at CookiesReadingComponent (webpack:///app/use-cache-cookies/page.tsx:22:18)
                     at Page (webpack:///app/use-cache-cookies/page.tsx:10:7)
                   20 |   // in userland.
                   21 |   try {
                 > 22 |     await cookies()
                      |                  ^
                   23 |   } catch {}
                   24 |
                   25 |   return null
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-cookies" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-cookies". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-cookies/page: /use-cache-cookies"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-cookies used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
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

          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E829",
               "description": "Route /use-cache-draft-mode used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/use-cache-draft-mode/page.tsx (20:26) @ DraftModeEnablingComponent
             > 20 |     ;(await draftMode()).enable()
                  |                          ^",
               "stack": [
                 "DraftModeEnablingComponent app/use-cache-draft-mode/page.tsx (20:26)",
                 "Page app/use-cache-draft-mode/page.tsx (9:7)",
               ],
             }
            `)
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

          if (isDebugPrerender) {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-draft-mode used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at DraftModeEnablingComponent (app/use-cache-draft-mode/page.tsx:20:26)
                     at Page (app/use-cache-draft-mode/page.tsx:9:7)
                   18 |   // here to ensure that this error is shown even when it's caught in userland.
                   19 |   try {
                 > 20 |     ;(await draftMode()).enable()
                      |                          ^
                   21 |   } catch {}
                   22 |
                   23 |   return null
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-draft-mode" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-draft-mode". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-draft-mode/page: /use-cache-draft-mode"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-draft-mode used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at DraftModeEnablingComponent (webpack:///app/use-cache-draft-mode/page.tsx:20:26)
                     at Page (webpack:///app/use-cache-draft-mode/page.tsx:9:7)
                   18 |   // here to ensure that this error is shown even when it's caught in userland.
                   19 |   try {
                 > 20 |     ;(await draftMode()).enable()
                      |                          ^
                   21 |   } catch {}
                   22 |
                   23 |   return null
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-draft-mode" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-draft-mode". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-draft-mode/page: /use-cache-draft-mode"
                `)
            }
          } else {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-draft-mode used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at a (app/use-cache-draft-mode/page.tsx:20:26)
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

          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E833",
               "description": "Route /use-cache-headers used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/use-cache-headers/page.tsx (21:18) @ HeadersReadingComponent
             > 21 |     await headers()
                  |                  ^",
               "stack": [
                 "HeadersReadingComponent app/use-cache-headers/page.tsx (21:18)",
                 "Page app/use-cache-headers/page.tsx (10:7)",
               ],
             }
            `)
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
                     at HeadersReadingComponent (app/use-cache-headers/page.tsx:21:18)
                     at Page (app/use-cache-headers/page.tsx:10:7)
                   19 |   // to ensure that this error is shown even when it's caught in userland.
                   20 |   try {
                 > 21 |     await headers()
                      |                  ^
                   22 |   } catch {}
                   23 |
                   24 |   return null
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-headers" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-headers". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-headers/page: /use-cache-headers"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-headers used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at a (app/use-cache-headers/page.tsx:21:11)
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
                     at HeadersReadingComponent (webpack:///app/use-cache-headers/page.tsx:21:18)
                     at Page (webpack:///app/use-cache-headers/page.tsx:10:7)
                   19 |   // to ensure that this error is shown even when it's caught in userland.
                   20 |   try {
                 > 21 |     await headers()
                      |                  ^
                   22 |   } catch {}
                   23 |
                   24 |   return null
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-headers" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-headers". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-headers/page: /use-cache-headers"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-headers used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
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

    describe('connection', () => {
      if (isNextDev) {
        it('should show a redbox error', async () => {
          const browser = await next.browser('/use-cache-connection')

          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E841",
               "description": "Route /use-cache-connection used \`connection()\` inside "use cache". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual request, but caches must be able to be produced before a request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/use-cache-connection/page.tsx (21:21) @ ConnectionCallingComponent
             > 21 |     await connection()
                  |                     ^",
               "stack": [
                 "ConnectionCallingComponent app/use-cache-connection/page.tsx (21:21)",
                 "Page app/use-cache-connection/page.tsx (10:7)",
               ],
             }
            `)
        })
      } else {
        it('should error the build', async () => {
          try {
            await prerender('/use-cache-connection')
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
                 "Error: Route /use-cache-connection used \`connection()\` inside "use cache". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual request, but caches must be able to be produced before a request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at ConnectionCallingComponent (app/use-cache-connection/page.tsx:21:21)
                     at Page (app/use-cache-connection/page.tsx:10:7)
                   19 |   // here to ensure that this error is shown even when it's caught in userland.
                   20 |   try {
                 > 21 |     await connection()
                      |                     ^
                   22 |   } catch {}
                   23 |
                   24 |   return null
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-connection" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-connection". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-connection/page: /use-cache-connection"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-connection used \`connection()\` inside "use cache". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual request, but caches must be able to be produced before a request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at a (app/use-cache-connection/page.tsx:21:11)
                   19 |   // here to ensure that this error is shown even when it's caught in userland.
                   20 |   try {
                 > 21 |     await connection()
                      |           ^
                   22 |   } catch {}
                   23 |
                   24 |   return null
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-connection" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-connection". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-connection/page: /use-cache-connection, exiting the build."
                `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-connection used \`connection()\` inside "use cache". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual request, but caches must be able to be produced before a request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at ConnectionCallingComponent (webpack:///app/use-cache-connection/page.tsx:21:21)
                     at Page (webpack:///app/use-cache-connection/page.tsx:10:7)
                   19 |   // here to ensure that this error is shown even when it's caught in userland.
                   20 |   try {
                 > 21 |     await connection()
                      |                     ^
                   22 |   } catch {}
                   23 |
                   24 |   return null
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-connection" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-connection". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-connection/page: /use-cache-connection"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route /use-cache-connection used \`connection()\` inside "use cache". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual request, but caches must be able to be produced before a request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-connection" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-connection". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-connection/page: /use-cache-connection, exiting the build."
                `)
            }
          }
        })
      }
    })

    describe('cacheLife with expire < 5 minutes', () => {
      describe('microtasky cache', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser('/use-cache-low-expire/fast')

            await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "code": "E1400",
                 "description": "Next.js encountered runtime data during prerendering.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/use-cache-low-expire/fast/page.tsx (3:16) @ Page
               > 3 | export default async function Page() {
                   |                ^",
                 "stack": [
                   "Page app/use-cache-low-expire/fast/page.tsx (3:16)",
                 ],
               }
              `)
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-low-expire/fast')
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
                   "Error: Route "/use-cache-low-expire/fast": Next.js encountered uncached or runtime data during prerendering.

                   \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                   Ways to fix this:
                     - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                     - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                     - [block] Set \`export const instant = false\` to allow a blocking route
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                       at Page (app/use-cache-low-expire/fast/page.tsx:3:16)
                     1 | import { cacheLife } from 'next/cache'
                     2 |
                   > 3 | export default async function Page() {
                       |                ^
                     4 |   'use cache: remote'
                     5 |
                     6 |   cacheLife({ expire: 299 }) // 1 second below the threshold of 5 minutes
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-low-expire/fast" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-low-expire/fast". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-low-expire/fast/page: /use-cache-low-expire/fast"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route "/use-cache-low-expire/fast": Next.js encountered uncached or runtime data during prerendering.

                   \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                   Ways to fix this:
                     - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                     - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                     - [block] Set \`export const instant = false\` to allow a blocking route
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                       at main (<anonymous>)
                       at body (<anonymous>)
                       at html (<anonymous>)
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-low-expire/fast" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-low-expire/fast". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-low-expire/fast/page: /use-cache-low-expire/fast, exiting the build."
                  `)
              }
            } else {
              if (isDebugPrerender) {
                // Webpack does not ignore the stack frame that points into
                // Next.js internals, and is also flaky on resolving the exact
                // location, so we don't assert on the stack frames here.
                expect(output).toInclude(
                  `Error: Route "/use-cache-low-expire/fast": Next.js encountered uncached or runtime data during prerendering.

\`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

Ways to fix this:
  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
  - [block] Set \`export const instant = false\` to allow a blocking route
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route`
                )
              } else {
                expect(output).toInclude(
                  `Error: Route "/use-cache-low-expire/fast": Next.js encountered uncached or runtime data during prerendering.

\`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

Ways to fix this:
  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
  - [block] Set \`export const instant = false\` to allow a blocking route
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route`
                )
              }
            }
          })
        }
      })

      describe('slow cache', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser('/use-cache-low-expire/slow')

            await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "code": "E1400",
                 "description": "Next.js encountered runtime data during prerendering.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/use-cache-low-expire/slow/page.tsx (3:16) @ Page
               > 3 | export default async function Page() {
                   |                ^",
                 "stack": [
                   "Page app/use-cache-low-expire/slow/page.tsx (3:16)",
                 ],
               }
              `)
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-low-expire/slow')
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
                   "Error: Route "/use-cache-low-expire/slow": Next.js encountered uncached or runtime data during prerendering.

                   \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                   Ways to fix this:
                     - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                     - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                     - [block] Set \`export const instant = false\` to allow a blocking route
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                       at Page (app/use-cache-low-expire/slow/page.tsx:3:16)
                     1 | import { cacheLife } from 'next/cache'
                     2 |
                   > 3 | export default async function Page() {
                       |                ^
                     4 |   'use cache: remote'
                     5 |
                     6 |   cacheLife({ expire: 299 }) // 1 second below the threshold of 5 minutes
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-low-expire/slow" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-low-expire/slow". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-low-expire/slow/page: /use-cache-low-expire/slow"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route "/use-cache-low-expire/slow": Next.js encountered uncached or runtime data during prerendering.

                   \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                   Ways to fix this:
                     - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                     - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                     - [block] Set \`export const instant = false\` to allow a blocking route
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                       at main (<anonymous>)
                       at body (<anonymous>)
                       at html (<anonymous>)
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-low-expire/slow" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-low-expire/slow". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-low-expire/slow/page: /use-cache-low-expire/slow, exiting the build."
                  `)
              }
            } else {
              if (isDebugPrerender) {
                // Webpack does not ignore the stack frame that points into
                // Next.js internals, and is also flaky on resolving the exact
                // location, so we don't assert on the stack frames here.
                expect(output).toInclude(
                  `Error: Route "/use-cache-low-expire/slow": Next.js encountered uncached or runtime data during prerendering.

\`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

Ways to fix this:
  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
  - [block] Set \`export const instant = false\` to allow a blocking route
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route`
                )
              } else {
                expect(output).toInclude(
                  `Error: Route "/use-cache-low-expire/slow": Next.js encountered uncached or runtime data during prerendering.

\`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

Ways to fix this:
  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
  - [block] Set \`export const instant = false\` to allow a blocking route
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route`
                )
              }
            }
          })
        }
      })

      describe('nested', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser('/use-cache-low-expire/nested')

            await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "cause": [
                   {
                     "label": "Caused by: Nested dynamic "use cache"",
                     "message": "This "use cache" has a dynamic cache life that was propagated to its parent.",
                     "source": "app/use-cache-low-expire/nested/page.tsx (3:1) @ innerCache
               > 3 | async function innerCache() {
                   | ^",
                     "stack": [
                       "innerCache app/use-cache-low-expire/nested/page.tsx (3:1)",
                       "outerCache app/use-cache-low-expire/nested/page.tsx (14:10)",
                       "Page <anonymous>",
                     ],
                   },
                 ],
                 "code": "E1244",
                 "description": "A "use cache" with short \`expire\` (under 5 minutes) is nested inside another "use cache" that has no explicit \`cacheLife\`, which is not allowed during prerendering. Add \`cacheLife()\` to the outer "use cache" to choose whether it should be prerendered (with longer \`expire\`) or remain dynamic (with short \`expire\`). Read more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/use-cache-low-expire/nested/page.tsx (20:14) @ Page
               > 20 |     result = await outerCache()
                    |              ^",
                 "stack": [
                   "Page app/use-cache-low-expire/nested/page.tsx (20:14)",
                 ],
               }
              `)
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-low-expire/nested')
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
                   "Error: A "use cache" with short \`expire\` (under 5 minutes) is nested inside another "use cache" that has no explicit \`cacheLife\`, which is not allowed during prerendering. Add \`cacheLife()\` to the outer "use cache" to choose whether it should be prerendered (with longer \`expire\`) or remain dynamic (with short \`expire\`). Read more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife
                       at async Page (app/use-cache-low-expire/nested/page.tsx:20:14)
                     18 |   let result: number | undefined
                     19 |   try {
                   > 20 |     result = await outerCache()
                        |              ^
                     21 |   } catch {}
                     22 |
                     23 |   return ( {
                     [cause]: Nested dynamic "use cache": This "use cache" has a dynamic cache life that was propagated to its parent.
                         at innerCache (app/use-cache-low-expire/nested/page.tsx:3:1)
                         at outerCache (app/use-cache-low-expire/nested/page.tsx:14:10)
                         at Page (<anonymous>)
                       1 | import { cacheLife } from 'next/cache'
                       2 |
                     > 3 | async function innerCache() {
                         | ^
                       4 |   'use cache'
                       5 |   cacheLife({ expire: 60 }) // 1 minute, under the 5 minute threshold
                       6 |   return Math.random()
                   }
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-low-expire/nested" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-low-expire/nested". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-low-expire/nested/page: /use-cache-low-expire/nested"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: A "use cache" with short \`expire\` (under 5 minutes) is nested inside another "use cache" that has no explicit \`cacheLife\`, which is not allowed during prerendering. Add \`cacheLife()\` to the outer "use cache" to choose whether it should be prerendered (with longer \`expire\`) or remain dynamic (with short \`expire\`). Read more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife
                       at async k (app/use-cache-low-expire/nested/page.tsx:20:14)
                     18 |   let result: number | undefined
                     19 |   try {
                   > 20 |     result = await outerCache()
                        |              ^
                     21 |   } catch {}
                     22 |
                     23 |   return ( {
                     [cause]: Nested dynamic "use cache": This "use cache" has a dynamic cache life that was propagated to its parent.
                         at <unknown> (app/use-cache-low-expire/nested/page.tsx:3:1)
                         at a (app/use-cache-low-expire/nested/page.tsx:3:16)
                       1 | import { cacheLife } from 'next/cache'
                       2 |
                     > 3 | async function innerCache() {
                         | ^
                       4 |   'use cache'
                       5 |   cacheLife({ expire: 60 }) // 1 minute, under the 5 minute threshold
                       6 |   return Math.random()
                   }
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-low-expire/nested" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-low-expire/nested". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-low-expire/nested/page: /use-cache-low-expire/nested, exiting the build."
                  `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                   "Error: A "use cache" with short \`expire\` (under 5 minutes) is nested inside another "use cache" that has no explicit \`cacheLife\`, which is not allowed during prerendering. Add \`cacheLife()\` to the outer "use cache" to choose whether it should be prerendered (with longer \`expire\`) or remain dynamic (with short \`expire\`). Read more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife
                       at async Page (webpack:///app/use-cache-low-expire/nested/page.tsx:20:14)
                     18 |   let result: number | undefined
                     19 |   try {
                   > 20 |     result = await outerCache()
                        |              ^
                     21 |   } catch {}
                     22 |
                     23 |   return ( {
                     [cause]: Nested dynamic "use cache": This "use cache" has a dynamic cache life that was propagated to its parent.
                         at innerCache (webpack:///app/use-cache-low-expire/nested/page.tsx:3:1)
                         at outerCache (webpack:///app/use-cache-low-expire/nested/page.tsx:14:10)
                         at Page (<anonymous>)
                       1 | import { cacheLife } from 'next/cache'
                       2 |
                     > 3 | async function innerCache() {
                         | ^
                       4 |   'use cache'
                       5 |   cacheLife({ expire: 60 }) // 1 minute, under the 5 minute threshold
                       6 |   return Math.random()
                   }
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-low-expire/nested" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-low-expire/nested". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-low-expire/nested/page: /use-cache-low-expire/nested"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: A "use cache" with short \`expire\` (under 5 minutes) is nested inside another "use cache" that has no explicit \`cacheLife\`, which is not allowed during prerendering. Add \`cacheLife()\` to the outer "use cache" to choose whether it should be prerendered (with longer \`expire\`) or remain dynamic (with short \`expire\`). Read more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife
                       at a (<next-dist-dir>) {
                     [cause]: Nested dynamic "use cache": This "use cache" has a dynamic cache life that was propagated to its parent.
                         at b (<next-dist-dir>)
                         at c (<next-dist-dir>)
                         at d (<next-dist-dir>)
                   }
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-low-expire/nested" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-low-expire/nested". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-low-expire/nested/page: /use-cache-low-expire/nested, exiting the build."
                  `)
              }
            }
          })
        }
      })
    })

    describe('cacheLife with revalidate: 0', () => {
      describe('microtasky cache', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser('/use-cache-revalidate-0/fast')

            await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "code": "E1400",
                 "description": "Next.js encountered runtime data during prerendering.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/use-cache-revalidate-0/fast/page.tsx (3:16) @ Page
               > 3 | export default async function Page() {
                   |                ^",
                 "stack": [
                   "Page app/use-cache-revalidate-0/fast/page.tsx (3:16)",
                 ],
               }
              `)
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-revalidate-0/fast')
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
                   "Error: Route "/use-cache-revalidate-0/fast": Next.js encountered uncached or runtime data during prerendering.

                   \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                   Ways to fix this:
                     - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                     - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                     - [block] Set \`export const instant = false\` to allow a blocking route
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                       at Page (app/use-cache-revalidate-0/fast/page.tsx:3:16)
                     1 | import { cacheLife } from 'next/cache'
                     2 |
                   > 3 | export default async function Page() {
                       |                ^
                     4 |   'use cache: remote'
                     5 |
                     6 |   cacheLife({ revalidate: 0 })
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-revalidate-0/fast" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-revalidate-0/fast". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-revalidate-0/fast/page: /use-cache-revalidate-0/fast"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route "/use-cache-revalidate-0/fast": Next.js encountered uncached or runtime data during prerendering.

                   \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                   Ways to fix this:
                     - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                     - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                     - [block] Set \`export const instant = false\` to allow a blocking route
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                       at main (<anonymous>)
                       at body (<anonymous>)
                       at html (<anonymous>)
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-revalidate-0/fast" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-revalidate-0/fast". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-revalidate-0/fast/page: /use-cache-revalidate-0/fast, exiting the build."
                  `)
              }
            } else {
              if (isDebugPrerender) {
                // Webpack does not ignore the stack frame that points into
                // Next.js internals, and is also flaky on resolving the exact
                // location, so we don't assert on the stack frames here.
                expect(output).toInclude(
                  `Error: Route "/use-cache-revalidate-0/fast": Next.js encountered uncached or runtime data during prerendering.

\`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

Ways to fix this:
  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
  - [block] Set \`export const instant = false\` to allow a blocking route
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route`
                )
              } else {
                expect(output).toInclude(
                  `Error: Route "/use-cache-revalidate-0/fast": Next.js encountered uncached or runtime data during prerendering.

\`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

Ways to fix this:
  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
  - [block] Set \`export const instant = false\` to allow a blocking route
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route`
                )
              }
            }
          })
        }
      })

      describe('slow cache', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser('/use-cache-revalidate-0/slow')

            await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "code": "E1400",
                 "description": "Next.js encountered runtime data during prerendering.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/use-cache-revalidate-0/slow/page.tsx (3:16) @ Page
               > 3 | export default async function Page() {
                   |                ^",
                 "stack": [
                   "Page app/use-cache-revalidate-0/slow/page.tsx (3:16)",
                 ],
               }
              `)
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-revalidate-0/slow')
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
                   "Error: Route "/use-cache-revalidate-0/slow": Next.js encountered uncached or runtime data during prerendering.

                   \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                   Ways to fix this:
                     - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                     - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                     - [block] Set \`export const instant = false\` to allow a blocking route
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                       at Page (app/use-cache-revalidate-0/slow/page.tsx:3:16)
                     1 | import { cacheLife } from 'next/cache'
                     2 |
                   > 3 | export default async function Page() {
                       |                ^
                     4 |   'use cache: remote'
                     5 |
                     6 |   cacheLife({ revalidate: 0 })
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-revalidate-0/slow" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-revalidate-0/slow". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-revalidate-0/slow/page: /use-cache-revalidate-0/slow"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route "/use-cache-revalidate-0/slow": Next.js encountered uncached or runtime data during prerendering.

                   \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                   Ways to fix this:
                     - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                     - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                     - [block] Set \`export const instant = false\` to allow a blocking route
                       https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                       at main (<anonymous>)
                       at body (<anonymous>)
                       at html (<anonymous>)
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-revalidate-0/slow" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-revalidate-0/slow". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-revalidate-0/slow/page: /use-cache-revalidate-0/slow, exiting the build."
                  `)
              }
            } else {
              if (isDebugPrerender) {
                // Webpack does not ignore the stack frame that points into
                // Next.js internals, and is also flaky on resolving the exact
                // location, so we don't assert on the stack frames here.
                expect(output).toInclude(
                  `Error: Route "/use-cache-revalidate-0/slow": Next.js encountered uncached or runtime data during prerendering.

\`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

Ways to fix this:
  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
  - [block] Set \`export const instant = false\` to allow a blocking route
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route`
                )
              } else {
                expect(output).toInclude(
                  `Error: Route "/use-cache-revalidate-0/slow": Next.js encountered uncached or runtime data during prerendering.

\`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

Ways to fix this:
  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
  - [block] Set \`export const instant = false\` to allow a blocking route
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route`
                )
              }
            }
          })
        }
      })

      describe('nested', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser('/use-cache-revalidate-0/nested')

            await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "cause": [
                   {
                     "label": "Caused by: Nested dynamic "use cache"",
                     "message": "This "use cache" has a dynamic cache life that was propagated to its parent.",
                     "source": "app/use-cache-revalidate-0/nested/page.tsx (3:1) @ innerCache
               > 3 | async function innerCache() {
                   | ^",
                     "stack": [
                       "innerCache app/use-cache-revalidate-0/nested/page.tsx (3:1)",
                       "outerCache app/use-cache-revalidate-0/nested/page.tsx (14:10)",
                       "Page <anonymous>",
                     ],
                   },
                 ],
                 "code": "E1245",
                 "description": "A "use cache" with zero \`revalidate\` is nested inside another "use cache" that has no explicit \`cacheLife\`, which is not allowed during prerendering. Add \`cacheLife()\` to the outer "use cache" to choose whether it should be prerendered (with non-zero \`revalidate\`) or remain dynamic (with zero \`revalidate\`). Read more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/use-cache-revalidate-0/nested/page.tsx (20:14) @ Page
               > 20 |     result = await outerCache()
                    |              ^",
                 "stack": [
                   "Page app/use-cache-revalidate-0/nested/page.tsx (20:14)",
                 ],
               }
              `)
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-revalidate-0/nested')
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
                   "Error: A "use cache" with zero \`revalidate\` is nested inside another "use cache" that has no explicit \`cacheLife\`, which is not allowed during prerendering. Add \`cacheLife()\` to the outer "use cache" to choose whether it should be prerendered (with non-zero \`revalidate\`) or remain dynamic (with zero \`revalidate\`). Read more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife
                       at async Page (app/use-cache-revalidate-0/nested/page.tsx:20:14)
                     18 |   let result: number | undefined
                     19 |   try {
                   > 20 |     result = await outerCache()
                        |              ^
                     21 |   } catch {}
                     22 |
                     23 |   return ( {
                     [cause]: Nested dynamic "use cache": This "use cache" has a dynamic cache life that was propagated to its parent.
                         at innerCache (app/use-cache-revalidate-0/nested/page.tsx:3:1)
                         at outerCache (app/use-cache-revalidate-0/nested/page.tsx:14:10)
                         at Page (<anonymous>)
                       1 | import { cacheLife } from 'next/cache'
                       2 |
                     > 3 | async function innerCache() {
                         | ^
                       4 |   'use cache'
                       5 |   cacheLife({ revalidate: 0 })
                       6 |   return Math.random()
                   }
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-revalidate-0/nested" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-revalidate-0/nested". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-revalidate-0/nested/page: /use-cache-revalidate-0/nested"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: A "use cache" with zero \`revalidate\` is nested inside another "use cache" that has no explicit \`cacheLife\`, which is not allowed during prerendering. Add \`cacheLife()\` to the outer "use cache" to choose whether it should be prerendered (with non-zero \`revalidate\`) or remain dynamic (with zero \`revalidate\`). Read more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife
                       at async k (app/use-cache-revalidate-0/nested/page.tsx:20:14)
                     18 |   let result: number | undefined
                     19 |   try {
                   > 20 |     result = await outerCache()
                        |              ^
                     21 |   } catch {}
                     22 |
                     23 |   return ( {
                     [cause]: Nested dynamic "use cache": This "use cache" has a dynamic cache life that was propagated to its parent.
                         at <unknown> (app/use-cache-revalidate-0/nested/page.tsx:3:1)
                         at a (app/use-cache-revalidate-0/nested/page.tsx:3:16)
                       1 | import { cacheLife } from 'next/cache'
                       2 |
                     > 3 | async function innerCache() {
                         | ^
                       4 |   'use cache'
                       5 |   cacheLife({ revalidate: 0 })
                       6 |   return Math.random()
                   }
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-revalidate-0/nested" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-revalidate-0/nested". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-revalidate-0/nested/page: /use-cache-revalidate-0/nested, exiting the build."
                  `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                   "Error: A "use cache" with zero \`revalidate\` is nested inside another "use cache" that has no explicit \`cacheLife\`, which is not allowed during prerendering. Add \`cacheLife()\` to the outer "use cache" to choose whether it should be prerendered (with non-zero \`revalidate\`) or remain dynamic (with zero \`revalidate\`). Read more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife
                       at async Page (webpack:///app/use-cache-revalidate-0/nested/page.tsx:20:14)
                     18 |   let result: number | undefined
                     19 |   try {
                   > 20 |     result = await outerCache()
                        |              ^
                     21 |   } catch {}
                     22 |
                     23 |   return ( {
                     [cause]: Nested dynamic "use cache": This "use cache" has a dynamic cache life that was propagated to its parent.
                         at innerCache (webpack:///app/use-cache-revalidate-0/nested/page.tsx:3:1)
                         at outerCache (webpack:///app/use-cache-revalidate-0/nested/page.tsx:14:10)
                         at Page (<anonymous>)
                       1 | import { cacheLife } from 'next/cache'
                       2 |
                     > 3 | async function innerCache() {
                         | ^
                       4 |   'use cache'
                       5 |   cacheLife({ revalidate: 0 })
                       6 |   return Math.random()
                   }
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-revalidate-0/nested" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-revalidate-0/nested". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-revalidate-0/nested/page: /use-cache-revalidate-0/nested"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: A "use cache" with zero \`revalidate\` is nested inside another "use cache" that has no explicit \`cacheLife\`, which is not allowed during prerendering. Add \`cacheLife()\` to the outer "use cache" to choose whether it should be prerendered (with non-zero \`revalidate\`) or remain dynamic (with zero \`revalidate\`). Read more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife
                       at a (<next-dist-dir>) {
                     [cause]: Nested dynamic "use cache": This "use cache" has a dynamic cache life that was propagated to its parent.
                         at b (<next-dist-dir>)
                         at c (<next-dist-dir>)
                         at d (<next-dist-dir>)
                   }
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-revalidate-0/nested" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-revalidate-0/nested". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-revalidate-0/nested/page: /use-cache-revalidate-0/nested, exiting the build."
                  `)
              }
            }
          })
        }
      })
    })

    describe('reading fallback params', () => {
      if (isNextDev) {
        it('should show a redbox error', async () => {
          const browser = await next.browser('/use-cache-params/foo')

          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1400",
               "description": "Next.js encountered runtime data during prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": null,
               "stack": [
                 "Page [Prerender] <anonymous>",
               ],
             }
            `)
        })
      } else {
        it('should error the build', async () => {
          try {
            await prerender('/use-cache-params/[slug]')
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
                 "Error: Route "/use-cache-params/[slug]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [block] Set \`export const instant = false\` to allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at Page (app/use-cache-params/[slug]/page.tsx:1:16)
                 > 1 | export default async function Page({
                     |                ^
                   2 |   params,
                   3 | }: {
                   4 |   params: Promise<{ slug: string }>
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-params/[slug]" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-params/[slug]". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-params/[slug]/page: /use-cache-params/[slug]"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/use-cache-params/[slug]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [block] Set \`export const instant = false\` to allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-params/[slug]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-params/[slug]". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-params/[slug]/page: /use-cache-params/[slug], exiting the build."
                `)
            }
          } else {
            if (isDebugPrerender) {
              // Webpack does not ignore the stack frame that points into
              // Next.js internals, and is also flaky on resolving the exact
              // location, so we don't assert on the stack frames here.
              expect(output).toInclude(
                `Error: Route "/use-cache-params/[slug]": Next.js encountered uncached or runtime data during prerendering.`
              )
            } else {
              expect(output).toInclude(
                `Error: Route "/use-cache-params/[slug]": Next.js encountered uncached or runtime data during prerendering.`
              )
            }
          }
        })
      }
    })

    describe('throwing an error at runtime', () => {
      if (isNextDev) {
        it('should show a redbox error', async () => {
          const browser = await next.browser('/use-cache-runtime-error')

          await expect(browser).toDisplayRedbox(`
             {
               "description": "Kaputt!",
               "environmentLabel": "Cache",
               "label": "Runtime Error",
               "source": "app/use-cache-runtime-error/page.tsx (15:9) @ throwAnError
             > 15 |   throw new Error('Kaputt!')
                  |         ^",
               "stack": [
                 "throwAnError app/use-cache-runtime-error/page.tsx (15:9)",
                 "ThrowingComponent app/use-cache-runtime-error/page.tsx (21:3)",
               ],
             }
            `)
        })
      } else {
        it('should log an error at runtime', async () => {
          try {
            await prerender('/use-cache-runtime-error')
          } catch (error) {
            throw new Error('expected build not to fail', { cause: error })
          }

          await next.start({ skipBuild: true })
          cliOutputLength = next.cliOutput.length
          await next.fetch('/use-cache-runtime-error')

          await retry(async () => {
            expect(next.cliOutput.slice(cliOutputLength)).toContain('Error')
          })

          const output = getDeterministicOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isDebugPrerender) {
            expect(output).toMatchInlineSnapshot(`
               "⨯ Error: Kaputt!
                   at throwAnError (<next-dist-dir>)
                   at ThrowingComponent (<next-dist-dir>)
                   at Object.then (<next-dist-dir>)
                   at resolveErrorDev (<next-dist-dir>)
                   at processFullStringRow (<next-dist-dir>)
                   at processFullBinaryRow (<next-dist-dir>)
                   at processBinaryChunk (<next-dist-dir>)
                   at progress (<next-dist-dir>) {
                 environmentName: 'Cache',
                 digest: '<error-digest>'
               }"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "⨯ Error: Kaputt!
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>) {
                 digest: '<error-digest>'
               }"
              `)
          }
        })
      }
    })

    describe('catching an error at runtime', () => {
      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          cliOutputLength = next.cliOutput.length
          const browser = await next.browser('/use-cache-catch-error')

          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Kaputt!",
               "environmentLabel": "Cache",
               "label": "Console Error",
               "source": "app/use-cache-catch-error/page.tsx (19:9) @ throwAnError
             > 19 |   throw new Error('Kaputt!')
                  |         ^",
               "stack": [
                 "throwAnError app/use-cache-catch-error/page.tsx (19:9)",
                 "Page app/use-cache-catch-error/page.tsx (11:7)",
               ],
             }
            `)
        })
      } else {
        it('should log an error at runtime', async () => {
          try {
            await prerender('/use-cache-catch-error')
          } catch (error) {
            throw new Error('expected build not to fail', { cause: error })
          }

          await next.start({ skipBuild: true })
          cliOutputLength = next.cliOutput.length
          await next.fetch('/use-cache-catch-error')

          await retry(async () => {
            expect(next.cliOutput.slice(cliOutputLength)).toContain('Error')
          })

          const output = getDeterministicOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isDebugPrerender) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Kaputt!
                   at throwAnError (<next-dist-dir>)
                   at Object.then (<next-dist-dir>)
                   at resolveErrorDev (<next-dist-dir>)
                   at processFullStringRow (<next-dist-dir>)
                   at processFullBinaryRow (<next-dist-dir>)
                   at processBinaryChunk (<next-dist-dir>)
                   at progress (<next-dist-dir>) {
                 environmentName: 'Cache',
                 digest: '<error-digest>'
               }"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "⨯ Error: Kaputt!
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>) {
                 digest: '<error-digest>'
               }
               [Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.] {
                 digest: '<error-digest>'
               }"
              `)
          }
        })
      }
    })

    describe('in ignore-listed code', () => {
      describe('cookies', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser('/use-cache-cookies-third-party')

            await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "code": "E831",
                 "description": "Route /use-cache-cookies-third-party used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/use-cache-cookies-third-party/page.tsx (10:7) @ Page
               > 10 |       <CachedCookiesReader />
                    |       ^",
                 "stack": [
                   "Page app/use-cache-cookies-third-party/page.tsx (10:7)",
                 ],
               }
              `)
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-cookies-third-party')
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
                   "Error: Route /use-cache-cookies-third-party used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at Page (app/use-cache-cookies-third-party/page.tsx:10:7)
                      8 |         which triggers an error.
                      9 |       </p>
                   > 10 |       <CachedCookiesReader />
                        |       ^
                     11 |     </>
                     12 |   )
                     13 | }
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-cookies-third-party" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-cookies-third-party". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-cookies-third-party/page: /use-cache-cookies-third-party"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route /use-cache-cookies-third-party used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at ignore-listed frames
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-cookies-third-party" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-cookies-third-party". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-cookies-third-party/page: /use-cache-cookies-third-party, exiting the build."
                  `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route /use-cache-cookies-third-party used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at Page (webpack:///app/use-cache-cookies-third-party/page.tsx:10:7)
                      8 |         which triggers an error.
                      9 |       </p>
                   > 10 |       <CachedCookiesReader />
                        |       ^
                     11 |     </>
                     12 |   )
                     13 | }
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-cookies-third-party" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-cookies-third-party". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-cookies-third-party/page: /use-cache-cookies-third-party"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route /use-cache-cookies-third-party used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at a (<next-dist-dir>)
                       at b (<next-dist-dir>)
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-cookies-third-party" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-cookies-third-party". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-cookies-third-party/page: /use-cache-cookies-third-party, exiting the build."
                  `)
              }
            }
          })
        }
      })

      describe('draftMode', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser(
              '/use-cache-draft-mode-third-party'
            )

            await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "code": "E829",
                 "description": "Route /use-cache-draft-mode-third-party used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/use-cache-draft-mode-third-party/page.tsx (10:7) @ Page
               > 10 |       <CachedDraftModeEnabler />
                    |       ^",
                 "stack": [
                   "Page app/use-cache-draft-mode-third-party/page.tsx (10:7)",
                 ],
               }
              `)
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-draft-mode-third-party')
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
                   "Error: Route /use-cache-draft-mode-third-party used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at Page (app/use-cache-draft-mode-third-party/page.tsx:10:7)
                      8 |         which triggers an error.
                      9 |       </p>
                   > 10 |       <CachedDraftModeEnabler />
                        |       ^
                     11 |     </>
                     12 |   )
                     13 | }
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-draft-mode-third-party" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-draft-mode-third-party". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-draft-mode-third-party/page: /use-cache-draft-mode-third-party"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route /use-cache-draft-mode-third-party used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at Page (webpack:///app/use-cache-draft-mode-third-party/page.tsx:10:7)
                      8 |         which triggers an error.
                      9 |       </p>
                   > 10 |       <CachedDraftModeEnabler />
                        |       ^
                     11 |     </>
                     12 |   )
                     13 | }
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-draft-mode-third-party" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-draft-mode-third-party". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-draft-mode-third-party/page: /use-cache-draft-mode-third-party"
                  `)
              }
            } else {
              if (isTurbopack) {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route /use-cache-draft-mode-third-party used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at ignore-listed frames
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-draft-mode-third-party" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-draft-mode-third-party". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-draft-mode-third-party/page: /use-cache-draft-mode-third-party, exiting the build."
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route /use-cache-draft-mode-third-party used "draftMode().enable()" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at a (<next-dist-dir>)
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-draft-mode-third-party" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-draft-mode-third-party". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-draft-mode-third-party/page: /use-cache-draft-mode-third-party, exiting the build."
                  `)
              }
            }
          })
        }
      })

      describe('headers', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser('/use-cache-headers-third-party')

            await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "code": "E833",
                 "description": "Route /use-cache-headers-third-party used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/use-cache-headers-third-party/page.tsx (10:7) @ Page
               > 10 |       <CachedHeadersReader />
                    |       ^",
                 "stack": [
                   "Page app/use-cache-headers-third-party/page.tsx (10:7)",
                 ],
               }
              `)
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-headers-third-party')
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
                   "Error: Route /use-cache-headers-third-party used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at Page (app/use-cache-headers-third-party/page.tsx:10:7)
                      8 |         which triggers an error.
                      9 |       </p>
                   > 10 |       <CachedHeadersReader />
                        |       ^
                     11 |     </>
                     12 |   )
                     13 | }
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-headers-third-party" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-headers-third-party". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-headers-third-party/page: /use-cache-headers-third-party"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route /use-cache-headers-third-party used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at ignore-listed frames
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-headers-third-party" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-headers-third-party". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-headers-third-party/page: /use-cache-headers-third-party, exiting the build."
                  `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route /use-cache-headers-third-party used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at Page (webpack:///app/use-cache-headers-third-party/page.tsx:10:7)
                      8 |         which triggers an error.
                      9 |       </p>
                   > 10 |       <CachedHeadersReader />
                        |       ^
                     11 |     </>
                     12 |   )
                     13 | }
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-headers-third-party" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-headers-third-party". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-headers-third-party/page: /use-cache-headers-third-party"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route /use-cache-headers-third-party used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at a (<next-dist-dir>)
                       at b (<next-dist-dir>)
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-headers-third-party" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-headers-third-party". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-headers-third-party/page: /use-cache-headers-third-party, exiting the build."
                  `)
              }
            }
          })
        }
      })

      describe('connection', () => {
        if (isNextDev) {
          it('should show a redbox error', async () => {
            const browser = await next.browser(
              '/use-cache-connection-third-party'
            )

            await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "code": "E841",
                 "description": "Route /use-cache-connection-third-party used \`connection()\` inside "use cache". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual request, but caches must be able to be produced before a request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": "Server",
                 "label": "Console Error",
                 "source": "app/use-cache-connection-third-party/page.tsx (10:7) @ Page
               > 10 |       <CachedConnectionCaller />
                    |       ^",
                 "stack": [
                   "Page app/use-cache-connection-third-party/page.tsx (10:7)",
                 ],
               }
              `)
          })
        } else {
          it('should error the build', async () => {
            try {
              await prerender('/use-cache-connection-third-party')
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
                   "Error: Route /use-cache-connection-third-party used \`connection()\` inside "use cache". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual request, but caches must be able to be produced before a request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at Page (app/use-cache-connection-third-party/page.tsx:10:7)
                      8 |         which triggers an error.
                      9 |       </p>
                   > 10 |       <CachedConnectionCaller />
                        |       ^
                     11 |     </>
                     12 |   )
                     13 | }
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-connection-third-party" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-connection-third-party". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-connection-third-party/page: /use-cache-connection-third-party"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route /use-cache-connection-third-party used \`connection()\` inside "use cache". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual request, but caches must be able to be produced before a request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at ignore-listed frames
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-connection-third-party" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-connection-third-party". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-connection-third-party/page: /use-cache-connection-third-party, exiting the build."
                  `)
              }
            } else {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route /use-cache-connection-third-party used \`connection()\` inside "use cache". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual request, but caches must be able to be produced before a request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at Page (webpack:///app/use-cache-connection-third-party/page.tsx:10:7)
                      8 |         which triggers an error.
                      9 |       </p>
                   > 10 |       <CachedConnectionCaller />
                        |       ^
                     11 |     </>
                     12 |   )
                     13 | }
                   To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-connection-third-party" in your browser to investigate the error.
                   Error occurred prerendering page "/use-cache-connection-third-party". Read more: https://nextjs.org/docs/messages/prerender-error

                   > Export encountered errors on 1 path:
                   	/use-cache-connection-third-party/page: /use-cache-connection-third-party"
                  `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                   "Error: Route /use-cache-connection-third-party used \`connection()\` inside "use cache". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual request, but caches must be able to be produced before a request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache
                       at a (<next-dist-dir>)
                       at b (<next-dist-dir>)
                   To get a more detailed stack trace and pinpoint the issue, try one of the following:
                     - Start the app in development mode by running \`next dev\`, then open "/use-cache-connection-third-party" in your browser to investigate the error.
                     - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                   Error occurred prerendering page "/use-cache-connection-third-party". Read more: https://nextjs.org/docs/messages/prerender-error
                   Export encountered an error on /use-cache-connection-third-party/page: /use-cache-connection-third-party, exiting the build."
                  `)
              }
            }
          })
        }
      })
    })
  })
}
