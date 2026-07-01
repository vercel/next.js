import { nextTestSetup } from 'e2e-utils'
import path from 'path'
const { version: nextVersion } = require('next/package.json')

const cacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('build-output-prerender', () => {
  describe('with a next config file', () => {
    describe('without --debug-prerender', () => {
      const { next, isTurbopack, isRspack } = nextTestSetup({
        files: path.join(__dirname, 'fixtures/with-config-file'),
        skipStart: true,
      })

      beforeAll(() => next.build())

      it('prints only the user-selected experimental flags (and the ones enabled via env variable)', async () => {
        if (cacheComponentsEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "✓ Running next.config.js took N
             ▲ Next.js x.y.z (Turbopack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ appNewScrollHandler (enabled by \`__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER\`)
               ✓ cachedNavigations (enabled by \`__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS\`)
               · staticGenerationMaxConcurrency: 1"
            `)
          } else if (isRspack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "✓ Running next.config.js took N
             ▲ Next.js x.y.z (Rspack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ appNewScrollHandler (enabled by \`__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER\`)
               ✓ cachedNavigations (enabled by \`__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS\`)
               · staticGenerationMaxConcurrency: 1"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "✓ Running next.config.js took N
             ▲ Next.js x.y.z (webpack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ appNewScrollHandler (enabled by \`__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER\`)
               ✓ cachedNavigations (enabled by \`__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS\`)
               · staticGenerationMaxConcurrency: 1"
            `)
          }
        } else {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "✓ Running next.config.js took N
             ▲ Next.js x.y.z (Turbopack)
             - Cache Components enabled
             - Experiments (use with caution):
               · staticGenerationMaxConcurrency: 1
               ✓ strictRouteTypes (enabled by \`__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES\`)"
            `)
          } else if (isRspack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "✓ Running next.config.js took N
             ▲ Next.js x.y.z (Rspack)
             - Cache Components enabled
             - Experiments (use with caution):
               · staticGenerationMaxConcurrency: 1
               ✓ strictRouteTypes (enabled by \`__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "✓ Running next.config.js took N
             ▲ Next.js x.y.z (webpack)
             - Cache Components enabled
             - Experiments (use with caution):
               · staticGenerationMaxConcurrency: 1
               ✓ strictRouteTypes (enabled by \`__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES\`)"
            `)
          }
        }
      })

      it('shows only a single prerender error with a mangled stack', async () => {
        if (isTurbopack) {
          // TODO(veil): Why is the location incomplete unless we enable --no-mangling?
          expect(getPrerenderOutput(next.cliOutput)).toMatchInlineSnapshot(`
           "Error: Route "/client": Next.js encountered the unstable value \`new Date()\` in a Client Component.

           This value would be evaluated during the prerender, instead of recomputed on each visit.

           Ways to fix this:
             - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
             - [defer] Move the read into a \`useEffect\` or event handler
               https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
             - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
               at <unknown> (app/client/page.tsx:4:28)
             2 |
             3 | export default function Page() {
           > 4 |   return <p>Current time: {new Date().toISOString()}</p>
               |                            ^
             5 | }
             6 |
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/client" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Error occurred prerendering page "/client". Read more: https://nextjs.org/docs/messages/prerender-error
           Export encountered an error on /client/page: /client, exiting the build."
          `)
        } else {
          expect(getPrerenderOutput(next.cliOutput)).toMatchInlineSnapshot(`
           "Error: Route "/client": Next.js encountered the unstable value \`new Date()\` in a Client Component.

           This value would be evaluated during the prerender, instead of recomputed on each visit.

           Ways to fix this:
             - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
             - [defer] Move the read into a \`useEffect\` or event handler
               https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
             - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
               at x (<next-dist-dir>)
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/client" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Error occurred prerendering page "/client". Read more: https://nextjs.org/docs/messages/prerender-error
           Export encountered an error on /client/page: /client, exiting the build."
          `)
        }
      })
    })

    describe('with --debug-prerender', () => {
      const { next, isTurbopack, isRspack } = nextTestSetup({
        files: path.join(__dirname, 'fixtures/with-config-file'),
        skipStart: true,
        buildArgs: ['--debug-prerender'],
      })

      beforeAll(() => next.build())

      it('prints a warning and the customized experimental flags', async () => {
        if (cacheComponentsEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode with NODE_ENV='development'. This will affect performance and should not be used for production.
             ✓ Running next.config.js took N
             ▲ Next.js x.y.z (Turbopack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ allowDevelopmentBuild (enabled by \`--debug-prerender\`)
               ✓ appNewScrollHandler (enabled by \`__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER\`)
               ✓ cachedNavigations (enabled by \`__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS\`)
               ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
               ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
               · staticGenerationMaxConcurrency: 1
               ⨯ turbopackMinify (disabled by \`--debug-prerender\`)"
            `)
          } else if (isRspack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode with NODE_ENV='development'. This will affect performance and should not be used for production.
             ✓ Running next.config.js took N
             ▲ Next.js x.y.z (Rspack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ allowDevelopmentBuild (enabled by \`--debug-prerender\`)
               ✓ appNewScrollHandler (enabled by \`__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER\`)
               ✓ cachedNavigations (enabled by \`__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS\`)
               ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
               ⨯ serverMinification (disabled by \`--debug-prerender\`)
               ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
               · staticGenerationMaxConcurrency: 1"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode with NODE_ENV='development'. This will affect performance and should not be used for production.
             ✓ Running next.config.js took N
             ▲ Next.js x.y.z (webpack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ allowDevelopmentBuild (enabled by \`--debug-prerender\`)
               ✓ appNewScrollHandler (enabled by \`__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER\`)
               ✓ cachedNavigations (enabled by \`__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS\`)
               ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
               ⨯ serverMinification (disabled by \`--debug-prerender\`)
               ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
               · staticGenerationMaxConcurrency: 1"
            `)
          }
        } else {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode with NODE_ENV='development'. This will affect performance and should not be used for production.
             ✓ Running next.config.js took N
             ▲ Next.js x.y.z (Turbopack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ allowDevelopmentBuild (enabled by \`--debug-prerender\`)
               ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
               ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
               · staticGenerationMaxConcurrency: 1
               ✓ strictRouteTypes (enabled by \`__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES\`)
               ⨯ turbopackMinify (disabled by \`--debug-prerender\`)"
            `)
          } else if (isRspack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode with NODE_ENV='development'. This will affect performance and should not be used for production.
             ✓ Running next.config.js took N
             ▲ Next.js x.y.z (Rspack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ allowDevelopmentBuild (enabled by \`--debug-prerender\`)
               ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
               ⨯ serverMinification (disabled by \`--debug-prerender\`)
               ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
               · staticGenerationMaxConcurrency: 1
               ✓ strictRouteTypes (enabled by \`__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode with NODE_ENV='development'. This will affect performance and should not be used for production.
             ✓ Running next.config.js took N
             ▲ Next.js x.y.z (webpack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ allowDevelopmentBuild (enabled by \`--debug-prerender\`)
               ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
               ⨯ serverMinification (disabled by \`--debug-prerender\`)
               ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
               · staticGenerationMaxConcurrency: 1
               ✓ strictRouteTypes (enabled by \`__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES\`)"
            `)
          }
        }
      })

      it('shows all prerender errors with readable stacks and code frames', async () => {
        if (isTurbopack) {
          expect(getPrerenderOutput(next.cliOutput)).toMatchInlineSnapshot(`
           "Error: Route "/client": Next.js encountered the unstable value \`new Date()\` in a Client Component.

           This value would be evaluated during the prerender, instead of recomputed on each visit.

           Ways to fix this:
             - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
             - [defer] Move the read into a \`useEffect\` or event handler
               https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
             - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
               at Page (app/client/page.tsx:4:28)
             2 |
             3 | export default function Page() {
           > 4 |   return <p>Current time: {new Date().toISOString()}</p>
               |                            ^
             5 | }
             6 |
           To debug the issue, start the app in development mode by running \`next dev\`, then open "/client" in your browser to investigate the error.
           Error occurred prerendering page "/client". Read more: https://nextjs.org/docs/messages/prerender-error
           Error: Route "/server": Next.js encountered the unstable value \`Math.random()\` while prerendering.

           This value can change between renders, so it must be either prerendered or computed later.

           Ways to fix this:
             - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
               https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
             - [cache] Prerender and cache the value with \`"use cache"\`
               https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
             - [client] Render the value on the client with \`"use client"\`
               https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
               at Page (app/server/page.tsx:13:27)
               at Page (<anonymous>)
             11 |   await cachedDelay()
             12 |
           > 13 |   return <p>Random: {Math.random()}</p>
                |                           ^
             14 | }
             15 |
           To debug the issue, start the app in development mode by running \`next dev\`, then open "/server" in your browser to investigate the error.
           Error occurred prerendering page "/server". Read more: https://nextjs.org/docs/messages/prerender-error

           > Export encountered errors on 2 paths:
           	/client/page: /client
           	/server/page: /server"
          `)
        } else {
          // TODO(veil): Bundler protocols should not appear in stackframes.
          expect(getPrerenderOutput(next.cliOutput)).toMatchInlineSnapshot(`
           "Error: Route "/client": Next.js encountered the unstable value \`new Date()\` in a Client Component.

           This value would be evaluated during the prerender, instead of recomputed on each visit.

           Ways to fix this:
             - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
             - [defer] Move the read into a \`useEffect\` or event handler
               https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
             - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
               at Page (webpack:///app/client/page.tsx:4:28)
               at ClientPageRoot (webpack:///src/client/components/client-page.tsx:61:12)
             2 |
             3 | export default function Page() {
           > 4 |   return <p>Current time: {new Date().toISOString()}</p>
               |                            ^
             5 | }
             6 |
           To debug the issue, start the app in development mode by running \`next dev\`, then open "/client" in your browser to investigate the error.
           Error occurred prerendering page "/client". Read more: https://nextjs.org/docs/messages/prerender-error
           Error: Route "/server": Next.js encountered the unstable value \`Math.random()\` while prerendering.

           This value can change between renders, so it must be either prerendered or computed later.

           Ways to fix this:
             - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
               https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request
             - [cache] Prerender and cache the value with \`"use cache"\`
               https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value
             - [client] Render the value on the client with \`"use client"\`
               https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client
               at Page (webpack:///app/server/page.tsx:13:27)
               at Page (<anonymous>)
             11 |   await cachedDelay()
             12 |
           > 13 |   return <p>Random: {Math.random()}</p>
                |                           ^
             14 | }
             15 |
           To debug the issue, start the app in development mode by running \`next dev\`, then open "/server" in your browser to investigate the error.
           Error occurred prerendering page "/server". Read more: https://nextjs.org/docs/messages/prerender-error

           > Export encountered errors on 2 paths:
           	/client/page: /client
           	/server/page: /server"
          `)
        }
      })
    })
  })

  describe('without a next config file', () => {
    describe('without --debug-prerender', () => {
      const { next, isTurbopack, isRspack } = nextTestSetup({
        files: path.join(__dirname, 'fixtures/without-config-file'),
        skipStart: true,
      })

      beforeAll(() => next.build())

      it('prints no experimental flags (unless enabled via env variable)', async () => {
        if (cacheComponentsEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "✓ Running next.config took N
             ▲ Next.js x.y.z (Turbopack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ appNewScrollHandler (enabled by \`__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER\`)
               ✓ cachedNavigations (enabled by \`__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS\`)"
            `)
          } else if (isRspack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "✓ Running next.config took N
             ▲ Next.js x.y.z (Rspack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ appNewScrollHandler (enabled by \`__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER\`)
               ✓ cachedNavigations (enabled by \`__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "✓ Running next.config took N
             ▲ Next.js x.y.z (webpack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ appNewScrollHandler (enabled by \`__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER\`)
               ✓ cachedNavigations (enabled by \`__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS\`)"
            `)
          }
        } else {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "✓ Running next.config took N
             ▲ Next.js x.y.z (Turbopack)
             - Experiments (use with caution):
               ✓ strictRouteTypes (enabled by \`__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES\`)"
            `)
          } else if (isRspack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "✓ Running next.config took N
             ▲ Next.js x.y.z (Rspack)
             - Experiments (use with caution):
               ✓ strictRouteTypes (enabled by \`__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "✓ Running next.config took N
             ▲ Next.js x.y.z (webpack)
             - Experiments (use with caution):
               ✓ strictRouteTypes (enabled by \`__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES\`)"
            `)
          }
        }
      })
    })

    describe('with --debug-prerender', () => {
      const { next, isTurbopack, isRspack } = nextTestSetup({
        files: path.join(__dirname, 'fixtures/without-config-file'),
        skipStart: true,
        buildArgs: ['--debug-prerender'],
      })

      beforeAll(() => next.build())

      it('prints a warning and the customized experimental flags', async () => {
        if (cacheComponentsEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode with NODE_ENV='development'. This will affect performance and should not be used for production.
             ✓ Running next.config took N
             ▲ Next.js x.y.z (Turbopack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ allowDevelopmentBuild (enabled by \`--debug-prerender\`)
               ✓ appNewScrollHandler (enabled by \`__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER\`)
               ✓ cachedNavigations (enabled by \`__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS\`)
               ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
               ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
               ⨯ turbopackMinify (disabled by \`--debug-prerender\`)"
            `)
          } else if (isRspack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode with NODE_ENV='development'. This will affect performance and should not be used for production.
             ✓ Running next.config took N
             ▲ Next.js x.y.z (Rspack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ allowDevelopmentBuild (enabled by \`--debug-prerender\`)
               ✓ appNewScrollHandler (enabled by \`__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER\`)
               ✓ cachedNavigations (enabled by \`__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS\`)
               ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
               ⨯ serverMinification (disabled by \`--debug-prerender\`)
               ✓ serverSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode with NODE_ENV='development'. This will affect performance and should not be used for production.
             ✓ Running next.config took N
             ▲ Next.js x.y.z (webpack)
             - Cache Components enabled
             - Experiments (use with caution):
               ✓ allowDevelopmentBuild (enabled by \`--debug-prerender\`)
               ✓ appNewScrollHandler (enabled by \`__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER\`)
               ✓ cachedNavigations (enabled by \`__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS\`)
               ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
               ⨯ serverMinification (disabled by \`--debug-prerender\`)
               ✓ serverSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          }
        } else {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode with NODE_ENV='development'. This will affect performance and should not be used for production.
             ✓ Running next.config took N
             ▲ Next.js x.y.z (Turbopack)
             - Experiments (use with caution):
               ✓ allowDevelopmentBuild (enabled by \`--debug-prerender\`)
               ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
               ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
               ✓ strictRouteTypes (enabled by \`__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES\`)
               ⨯ turbopackMinify (disabled by \`--debug-prerender\`)"
            `)
          } else if (isRspack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode with NODE_ENV='development'. This will affect performance and should not be used for production.
             ✓ Running next.config took N
             ▲ Next.js x.y.z (Rspack)
             - Experiments (use with caution):
               ✓ allowDevelopmentBuild (enabled by \`--debug-prerender\`)
               ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
               ⨯ serverMinification (disabled by \`--debug-prerender\`)
               ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
               ✓ strictRouteTypes (enabled by \`__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode with NODE_ENV='development'. This will affect performance and should not be used for production.
             ✓ Running next.config took N
             ▲ Next.js x.y.z (webpack)
             - Experiments (use with caution):
               ✓ allowDevelopmentBuild (enabled by \`--debug-prerender\`)
               ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
               ⨯ serverMinification (disabled by \`--debug-prerender\`)
               ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
               ✓ strictRouteTypes (enabled by \`__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES\`)"
            `)
          }
        }
      })
    })
  })
})

function getPreambleOutput(cliOutput: string): string {
  const lines: string[] = []

  for (const line of cliOutput.split('\n')) {
    if (line.includes('Creating an optimized production build')) {
      break
    }

    lines.push(
      line
        .replace(nextVersion, 'x.y.z')
        // The config evaluation timing varies between runs, so normalize it to
        // keep the snapshot stable (e.g. "took 21ms" -> "took N").
        .replace(/(Running .* took )[\d.]+(ms|s|min)/, '$1N')
    )
  }

  return lines.join('\n').trim()
}

function getPrerenderOutput(cliOutput: string): string {
  let foundPrerenderingLine = false
  const lines: string[] = []

  for (const line of cliOutput.split('\n')) {
    if (line.includes('Collecting page data')) {
      foundPrerenderingLine = true
      continue
    }

    if (line.includes('Next.js build worker exited')) {
      break
    }

    if (foundPrerenderingLine && !line.includes('Generating static pages')) {
      lines.push(
        line.replace(/at \w+ \(.next[^)]+\)/, 'at x (<next-dist-dir>)')
      )
    }
  }

  return lines.join('\n').trim()
}
