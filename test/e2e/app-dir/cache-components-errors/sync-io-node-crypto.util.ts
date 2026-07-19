import { isNextDev } from 'e2e-utils'
import { getPrerenderOutput } from './utils'
import type { CacheComponentsErrorsContext } from './shared.util'

export function registerSyncIoNodeCryptoTests(
  ctx: CacheComponentsErrorsContext
) {
  const { next, isTurbopack, isDebugPrerender, prerender } = ctx

  let cliOutputLength: number
  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
  })

  describe('Sync IO - Node Crypto - generateKeyPairSync()', () => {
    const pathname = '/sync-io-node-crypto/generate-key-pair-sync'

    if (isNextDev) {
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)

        if (isTurbopack) {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').generateKeyPairSync(...) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/generate-key-pair-sync/page.tsx (20:24) @ SyncIOComponent
             > 20 |   const first = crypto.generateKeyPairSync('rsa', keyGenOptions)
                  |                        ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/generate-key-pair-sync/page.tsx (20:24)",
                 "Page app/sync-io-node-crypto/generate-key-pair-sync/page.tsx (12:9)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').generateKeyPairSync(...) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/generate-key-pair-sync/page.tsx (20:17) @ SyncIOComponent
             > 20 |   const first = crypto.generateKeyPairSync('rsa', keyGenOptions)
                  |                 ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/generate-key-pair-sync/page.tsx (20:17)",
                 "Page app/sync-io-node-crypto/generate-key-pair-sync/page.tsx (12:9)",
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
               "Error: Route "/sync-io-node-crypto/generate-key-pair-sync": Next.js encountered the unstable value \`require('node:crypto').generateKeyPairSync(...)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (app/sync-io-node-crypto/generate-key-pair-sync/page.tsx:20:24)
                   at Page (app/sync-io-node-crypto/generate-key-pair-sync/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.generateKeyPairSync('rsa', keyGenOptions)
                    |                        ^
                 21 |   return <div>{first.publicKey}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-key-pair-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/generate-key-pair-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/generate-key-pair-sync/page: /sync-io-node-crypto/generate-key-pair-sync"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-key-pair-sync": Next.js encountered the unstable value \`require('node:crypto').generateKeyPairSync(...)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at a (app/sync-io-node-crypto/generate-key-pair-sync/page.tsx:20:24)
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
               "Error: Route "/sync-io-node-crypto/generate-key-pair-sync": Next.js encountered the unstable value \`require('node:crypto').generateKeyPairSync(...)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (webpack:///app/sync-io-node-crypto/generate-key-pair-sync/page.tsx:20:17)
                   at Page (webpack:///app/sync-io-node-crypto/generate-key-pair-sync/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.generateKeyPairSync('rsa', keyGenOptions)
                    |                 ^
                 21 |   return <div>{first.publicKey}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-key-pair-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/generate-key-pair-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/generate-key-pair-sync/page: /sync-io-node-crypto/generate-key-pair-sync"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-key-pair-sync": Next.js encountered the unstable value \`require('node:crypto').generateKeyPairSync(...)\` while prerendering.

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
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').generateKeySync(...) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/generate-key-sync/page.tsx (21:6) @ SyncIOComponent
             > 21 |     .generateKeySync('hmac', {
                  |      ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/generate-key-sync/page.tsx (21:6)",
                 "Page app/sync-io-node-crypto/generate-key-sync/page.tsx (12:9)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').generateKeySync(...) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/generate-key-sync/page.tsx (20:17) @ SyncIOComponent
             > 20 |   const first = crypto
                  |                 ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/generate-key-sync/page.tsx (20:17)",
                 "Page app/sync-io-node-crypto/generate-key-sync/page.tsx (12:9)",
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
               "Error: Route "/sync-io-node-crypto/generate-key-sync": Next.js encountered the unstable value \`require('node:crypto').generateKeySync(...)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (app/sync-io-node-crypto/generate-key-sync/page.tsx:21:6)
                   at Page (app/sync-io-node-crypto/generate-key-sync/page.tsx:12:9)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = crypto
               > 21 |     .generateKeySync('hmac', {
                    |      ^
                 22 |       length: 512,
                 23 |     })
                 24 |     .export()
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-key-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/generate-key-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/generate-key-sync/page: /sync-io-node-crypto/generate-key-sync"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-key-sync": Next.js encountered the unstable value \`require('node:crypto').generateKeySync(...)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at a (app/sync-io-node-crypto/generate-key-sync/page.tsx:21:6)
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
               "Error: Route "/sync-io-node-crypto/generate-key-sync": Next.js encountered the unstable value \`require('node:crypto').generateKeySync(...)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (webpack:///app/sync-io-node-crypto/generate-key-sync/page.tsx:20:17)
                   at Page (webpack:///app/sync-io-node-crypto/generate-key-sync/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto
                    |                 ^
                 21 |     .generateKeySync('hmac', {
                 22 |       length: 512,
                 23 |     })
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-key-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/generate-key-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/generate-key-sync/page: /sync-io-node-crypto/generate-key-sync"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-key-sync": Next.js encountered the unstable value \`require('node:crypto').generateKeySync(...)\` while prerendering.

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
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').generatePrimeSync(...) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/generate-prime-sync/page.tsx (20:39) @ SyncIOComponent
             > 20 |   const first = new Uint8Array(crypto.generatePrimeSync(128))
                  |                                       ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/generate-prime-sync/page.tsx (20:39)",
                 "Page app/sync-io-node-crypto/generate-prime-sync/page.tsx (12:9)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').generatePrimeSync(...) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/generate-prime-sync/page.tsx (20:32) @ SyncIOComponent
             > 20 |   const first = new Uint8Array(crypto.generatePrimeSync(128))
                  |                                ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/generate-prime-sync/page.tsx (20:32)",
                 "Page app/sync-io-node-crypto/generate-prime-sync/page.tsx (12:9)",
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
               "Error: Route "/sync-io-node-crypto/generate-prime-sync": Next.js encountered the unstable value \`require('node:crypto').generatePrimeSync(...)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (app/sync-io-node-crypto/generate-prime-sync/page.tsx:20:39)
                   at Page (app/sync-io-node-crypto/generate-prime-sync/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = new Uint8Array(crypto.generatePrimeSync(128))
                    |                                       ^
                 21 |   return <div>{first.toString()}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-prime-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/generate-prime-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/generate-prime-sync/page: /sync-io-node-crypto/generate-prime-sync"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-prime-sync": Next.js encountered the unstable value \`require('node:crypto').generatePrimeSync(...)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at a (app/sync-io-node-crypto/generate-prime-sync/page.tsx:20:39)
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
               "Error: Route "/sync-io-node-crypto/generate-prime-sync": Next.js encountered the unstable value \`require('node:crypto').generatePrimeSync(...)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (webpack:///app/sync-io-node-crypto/generate-prime-sync/page.tsx:20:32)
                   at Page (webpack:///app/sync-io-node-crypto/generate-prime-sync/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = new Uint8Array(crypto.generatePrimeSync(128))
                    |                                ^
                 21 |   return <div>{first.toString()}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/generate-prime-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/generate-prime-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/generate-prime-sync/page: /sync-io-node-crypto/generate-prime-sync"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/generate-prime-sync": Next.js encountered the unstable value \`require('node:crypto').generatePrimeSync(...)\` while prerendering.

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
               "code": "E1295",
               "description": "Next.js encountered the unstable value crypto.getRandomValues() while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/get-random-values/page.tsx (21:10) @ SyncIOComponent
             > 21 |   crypto.getRandomValues(first)
                  |          ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/get-random-values/page.tsx (21:10)",
                 "Page app/sync-io-node-crypto/get-random-values/page.tsx (12:9)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1295",
               "description": "Next.js encountered the unstable value crypto.getRandomValues() while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/get-random-values/page.tsx (21:3) @ SyncIOComponent
             > 21 |   crypto.getRandomValues(first)
                  |   ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/get-random-values/page.tsx (21:3)",
                 "Page app/sync-io-node-crypto/get-random-values/page.tsx (12:9)",
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
               "Error: Route "/sync-io-node-crypto/get-random-values": Next.js encountered the unstable value \`crypto.getRandomValues()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#cache-the-generated-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#render-on-the-client
                   at SyncIOComponent (app/sync-io-node-crypto/get-random-values/page.tsx:21:10)
                   at Page (app/sync-io-node-crypto/get-random-values/page.tsx:12:9)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = new Uint8Array(8)
               > 21 |   crypto.getRandomValues(first)
                    |          ^
                 22 |   return <div>{first.toString()}</div>
                 23 | }
                 24 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/get-random-values" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/get-random-values". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/get-random-values/page: /sync-io-node-crypto/get-random-values"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/get-random-values": Next.js encountered the unstable value \`crypto.getRandomValues()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#cache-the-generated-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#render-on-the-client
                   at a (app/sync-io-node-crypto/get-random-values/page.tsx:21:10)
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
               "Error: Route "/sync-io-node-crypto/get-random-values": Next.js encountered the unstable value \`crypto.getRandomValues()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#cache-the-generated-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-crypto#render-on-the-client
                   at SyncIOComponent (webpack:///app/sync-io-node-crypto/get-random-values/page.tsx:21:3)
                   at Page (webpack:///app/sync-io-node-crypto/get-random-values/page.tsx:12:9)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = new Uint8Array(8)
               > 21 |   crypto.getRandomValues(first)
                    |   ^
                 22 |   return <div>{first.toString()}</div>
                 23 | }
                 24 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/get-random-values" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/get-random-values". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/get-random-values/page: /sync-io-node-crypto/get-random-values"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/get-random-values": Next.js encountered the unstable value \`crypto.getRandomValues()\` while prerendering.

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
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').randomBytes(size) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/random-bytes/page.tsx (20:24) @ SyncIOComponent
             > 20 |   const first = crypto.randomBytes(8)
                  |                        ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-bytes/page.tsx (20:24)",
                 "Page app/sync-io-node-crypto/random-bytes/page.tsx (12:9)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').randomBytes(size) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/random-bytes/page.tsx (20:17) @ SyncIOComponent
             > 20 |   const first = crypto.randomBytes(8)
                  |                 ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-bytes/page.tsx (20:17)",
                 "Page app/sync-io-node-crypto/random-bytes/page.tsx (12:9)",
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
               "Error: Route "/sync-io-node-crypto/random-bytes": Next.js encountered the unstable value \`require('node:crypto').randomBytes(size)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (app/sync-io-node-crypto/random-bytes/page.tsx:20:24)
                   at Page (app/sync-io-node-crypto/random-bytes/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomBytes(8)
                    |                        ^
                 21 |   return <div>{first.toString()}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-bytes" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-bytes". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/random-bytes/page: /sync-io-node-crypto/random-bytes"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-bytes": Next.js encountered the unstable value \`require('node:crypto').randomBytes(size)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at a (app/sync-io-node-crypto/random-bytes/page.tsx:20:24)
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
               "Error: Route "/sync-io-node-crypto/random-bytes": Next.js encountered the unstable value \`require('node:crypto').randomBytes(size)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (webpack:///app/sync-io-node-crypto/random-bytes/page.tsx:20:17)
                   at Page (webpack:///app/sync-io-node-crypto/random-bytes/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomBytes(8)
                    |                 ^
                 21 |   return <div>{first.toString()}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-bytes" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-bytes". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/random-bytes/page: /sync-io-node-crypto/random-bytes"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-bytes": Next.js encountered the unstable value \`require('node:crypto').randomBytes(size)\` while prerendering.

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
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').randomFillSync(...) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/random-fill-sync/page.tsx (21:10) @ SyncIOComponent
             > 21 |   crypto.randomFillSync(first, 4, 8)
                  |          ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-fill-sync/page.tsx (21:10)",
                 "Page app/sync-io-node-crypto/random-fill-sync/page.tsx (12:9)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').randomFillSync(...) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/random-fill-sync/page.tsx (21:3) @ SyncIOComponent
             > 21 |   crypto.randomFillSync(first, 4, 8)
                  |   ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-fill-sync/page.tsx (21:3)",
                 "Page app/sync-io-node-crypto/random-fill-sync/page.tsx (12:9)",
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
               "Error: Route "/sync-io-node-crypto/random-fill-sync": Next.js encountered the unstable value \`require('node:crypto').randomFillSync(...)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (app/sync-io-node-crypto/random-fill-sync/page.tsx:21:10)
                   at Page (app/sync-io-node-crypto/random-fill-sync/page.tsx:12:9)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = new Uint8Array(16)
               > 21 |   crypto.randomFillSync(first, 4, 8)
                    |          ^
                 22 |   return <div>{first.toString()}</div>
                 23 | }
                 24 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-fill-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-fill-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/random-fill-sync/page: /sync-io-node-crypto/random-fill-sync"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-fill-sync": Next.js encountered the unstable value \`require('node:crypto').randomFillSync(...)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at a (app/sync-io-node-crypto/random-fill-sync/page.tsx:21:10)
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
               "Error: Route "/sync-io-node-crypto/random-fill-sync": Next.js encountered the unstable value \`require('node:crypto').randomFillSync(...)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (webpack:///app/sync-io-node-crypto/random-fill-sync/page.tsx:21:3)
                   at Page (webpack:///app/sync-io-node-crypto/random-fill-sync/page.tsx:12:9)
                 19 |   await new Promise((r) => process.nextTick(r))
                 20 |   const first = new Uint8Array(16)
               > 21 |   crypto.randomFillSync(first, 4, 8)
                    |   ^
                 22 |   return <div>{first.toString()}</div>
                 23 | }
                 24 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-fill-sync" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-fill-sync". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/random-fill-sync/page: /sync-io-node-crypto/random-fill-sync"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-fill-sync": Next.js encountered the unstable value \`require('node:crypto').randomFillSync(...)\` while prerendering.

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
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').randomInt(min, max) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/random-int-between/page.tsx (20:24) @ SyncIOComponent
             > 20 |   const first = crypto.randomInt(128, 256)
                  |                        ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-int-between/page.tsx (20:24)",
                 "Page app/sync-io-node-crypto/random-int-between/page.tsx (12:9)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').randomInt(min, max) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/random-int-between/page.tsx (20:17) @ SyncIOComponent
             > 20 |   const first = crypto.randomInt(128, 256)
                  |                 ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-int-between/page.tsx (20:17)",
                 "Page app/sync-io-node-crypto/random-int-between/page.tsx (12:9)",
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
               "Error: Route "/sync-io-node-crypto/random-int-between": Next.js encountered the unstable value \`require('node:crypto').randomInt(min, max)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (app/sync-io-node-crypto/random-int-between/page.tsx:20:24)
                   at Page (app/sync-io-node-crypto/random-int-between/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomInt(128, 256)
                    |                        ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-int-between" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-int-between". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/random-int-between/page: /sync-io-node-crypto/random-int-between"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-int-between": Next.js encountered the unstable value \`require('node:crypto').randomInt(min, max)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at a (app/sync-io-node-crypto/random-int-between/page.tsx:20:24)
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
               "Error: Route "/sync-io-node-crypto/random-int-between": Next.js encountered the unstable value \`require('node:crypto').randomInt(min, max)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (webpack:///app/sync-io-node-crypto/random-int-between/page.tsx:20:17)
                   at Page (webpack:///app/sync-io-node-crypto/random-int-between/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomInt(128, 256)
                    |                 ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-int-between" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-int-between". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/random-int-between/page: /sync-io-node-crypto/random-int-between"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-int-between": Next.js encountered the unstable value \`require('node:crypto').randomInt(min, max)\` while prerendering.

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
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').randomInt(min, max) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/random-int-up-to/page.tsx (20:24) @ SyncIOComponent
             > 20 |   const first = crypto.randomInt(128)
                  |                        ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-int-up-to/page.tsx (20:24)",
                 "Page app/sync-io-node-crypto/random-int-up-to/page.tsx (12:9)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').randomInt(min, max) while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/random-int-up-to/page.tsx (20:17) @ SyncIOComponent
             > 20 |   const first = crypto.randomInt(128)
                  |                 ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-int-up-to/page.tsx (20:17)",
                 "Page app/sync-io-node-crypto/random-int-up-to/page.tsx (12:9)",
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
               "Error: Route "/sync-io-node-crypto/random-int-up-to": Next.js encountered the unstable value \`require('node:crypto').randomInt(min, max)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (app/sync-io-node-crypto/random-int-up-to/page.tsx:20:24)
                   at Page (app/sync-io-node-crypto/random-int-up-to/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomInt(128)
                    |                        ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-int-up-to" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-int-up-to". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/random-int-up-to/page: /sync-io-node-crypto/random-int-up-to"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-int-up-to": Next.js encountered the unstable value \`require('node:crypto').randomInt(min, max)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at a (app/sync-io-node-crypto/random-int-up-to/page.tsx:20:24)
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
               "Error: Route "/sync-io-node-crypto/random-int-up-to": Next.js encountered the unstable value \`require('node:crypto').randomInt(min, max)\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (webpack:///app/sync-io-node-crypto/random-int-up-to/page.tsx:20:17)
                   at Page (webpack:///app/sync-io-node-crypto/random-int-up-to/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomInt(128)
                    |                 ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-int-up-to" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-int-up-to". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/random-int-up-to/page: /sync-io-node-crypto/random-int-up-to"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-int-up-to": Next.js encountered the unstable value \`require('node:crypto').randomInt(min, max)\` while prerendering.

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
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').randomUUID() while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/random-uuid/page.tsx (20:24) @ SyncIOComponent
             > 20 |   const first = crypto.randomUUID()
                  |                        ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-uuid/page.tsx (20:24)",
                 "Page app/sync-io-node-crypto/random-uuid/page.tsx (12:9)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1295",
               "description": "Next.js encountered the unstable value require('node:crypto').randomUUID() while prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-io-node-crypto/random-uuid/page.tsx (20:17) @ SyncIOComponent
             > 20 |   const first = crypto.randomUUID()
                  |                 ^",
               "stack": [
                 "SyncIOComponent app/sync-io-node-crypto/random-uuid/page.tsx (20:17)",
                 "Page app/sync-io-node-crypto/random-uuid/page.tsx (12:9)",
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
               "Error: Route "/sync-io-node-crypto/random-uuid": Next.js encountered the unstable value \`require('node:crypto').randomUUID()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (app/sync-io-node-crypto/random-uuid/page.tsx:20:24)
                   at Page (app/sync-io-node-crypto/random-uuid/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomUUID()
                    |                        ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-uuid" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-uuid". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/random-uuid/page: /sync-io-node-crypto/random-uuid"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-uuid": Next.js encountered the unstable value \`require('node:crypto').randomUUID()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at a (app/sync-io-node-crypto/random-uuid/page.tsx:20:24)
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
               "Error: Route "/sync-io-node-crypto/random-uuid": Next.js encountered the unstable value \`require('node:crypto').randomUUID()\` while prerendering.

               This value can change between renders, so it must be either prerendered or computed later.

               Ways to fix this:
                 - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
                   https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
                 - [cache] Prerender and cache the value with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
                 - [client] Render the value on the client with \`"use client"\`
                   https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
                   at SyncIOComponent (webpack:///app/sync-io-node-crypto/random-uuid/page.tsx:20:17)
                   at Page (webpack:///app/sync-io-node-crypto/random-uuid/page.tsx:12:9)
                 18 | async function SyncIOComponent() {
                 19 |   await new Promise((r) => process.nextTick(r))
               > 20 |   const first = crypto.randomUUID()
                    |                 ^
                 21 |   return <div>{first}</div>
                 22 | }
                 23 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-io-node-crypto/random-uuid" in your browser to investigate the error.
               Error occurred prerendering page "/sync-io-node-crypto/random-uuid". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/sync-io-node-crypto/random-uuid/page: /sync-io-node-crypto/random-uuid"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/sync-io-node-crypto/random-uuid": Next.js encountered the unstable value \`require('node:crypto').randomUUID()\` while prerendering.

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
}
