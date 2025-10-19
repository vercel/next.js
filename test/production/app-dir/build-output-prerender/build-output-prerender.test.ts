import { nextTestSetup } from 'e2e-utils'
import path from 'path'
const { version: nextVersion } = require('next/package.json')

const cacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

const pprEnabled = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

const isRspack = !!process.env.NEXT_RSPACK

describe('build-output-prerender', () => {
  describe('with a next config file', () => {
    describe('without --debug-prerender', () => {
      const { next, isTurbopack } = nextTestSetup({
        files: path.join(__dirname, 'fixtures/with-config-file'),
        skipStart: true,
      })

      beforeAll(() => next.build())

      it('prints only the user-selected experimental flags (and the ones enabled via env variable)', async () => {
        if (cacheComponentsEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z (Turbopack, Cache Components)
                - Experiments (use with caution):
                  ✓ reactDebugChannel (enabled by \`__NEXT_EXPERIMENTAL_DEBUG_CHANNEL\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z (webpack, Cache Components)
                - Experiments (use with caution):
                  ✓ reactDebugChannel (enabled by \`__NEXT_EXPERIMENTAL_DEBUG_CHANNEL\`)"
            `)
          }
        } else if (pprEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z (Turbopack, Cache Components)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z (webpack, Cache Components)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)"
            `)
          }
        } else {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(
              `"▲ Next.js x.y.z (Turbopack, Cache Components)"`
            )
          } else if (isRspack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z (Rspack, Cache Components)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(
              `"▲ Next.js x.y.z (webpack, Cache Components)"`
            )
          }
        }
      })

      it('shows only a single prerender error with a mangled stack', async () => {
        if (isTurbopack) {
          // TODO(veil): Why is the location incomplete unless we enable --no-mangling?
          expect(getPrerenderOutput(next.cliOutput)).toMatchInlineSnapshot(`
           "Error: Route "/client" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
               at c (bundler:///app/client/page.tsx:4:28)
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
           "Error: Route "/client" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
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
      const { next, isTurbopack } = nextTestSetup({
        files: path.join(__dirname, 'fixtures/with-config-file'),
        skipStart: true,
        buildArgs: ['--debug-prerender'],
      })

      beforeAll(() => next.build())

      it('prints a warning and the customized experimental flags', async () => {
        if (cacheComponentsEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (Turbopack, Cache Components)
                - Experiments (use with caution):
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ reactDebugChannel (enabled by \`__NEXT_EXPERIMENTAL_DEBUG_CHANNEL\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ turbopackMinify (disabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (webpack, Cache Components)
                - Experiments (use with caution):
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ reactDebugChannel (enabled by \`__NEXT_EXPERIMENTAL_DEBUG_CHANNEL\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          }
        } else if (pprEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (Turbopack, Cache Components)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ turbopackMinify (disabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (webpack, Cache Components)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          }
        } else {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (Turbopack, Cache Components)
                - Experiments (use with caution):
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ turbopackMinify (disabled by \`--debug-prerender\`)"
            `)
          } else if (isRspack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (Rspack, Cache Components)
                - Experiments (use with caution):
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (webpack, Cache Components)
                - Experiments (use with caution):
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          }
        }
      })

      it('shows all prerender errors with readable stacks and code frames', async () => {
        expect(getPrerenderOutput(next.cliOutput)).toMatchInlineSnapshot(`
         "Error: Route "/client" used \`new Date()\` inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client
             at Page (bundler:///app/client/page.tsx:4:28)
           2 |
           3 | export default function Page() {
         > 4 |   return <p>Current time: {new Date().toISOString()}</p>
             |                            ^
           5 | }
           6 |
         To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/client" in your browser to investigate the error.
         Error occurred prerendering page "/client". Read more: https://nextjs.org/docs/messages/prerender-error
         Error: Route "/server" used \`Math.random()\` before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random
             at Page (bundler:///app/server/page.tsx:13:27)
           11 |   await cachedDelay()
           12 |
         > 13 |   return <p>Random: {Math.random()}</p>
              |                           ^
           14 | }
           15 |
         To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "/server" in your browser to investigate the error.
         Error occurred prerendering page "/server". Read more: https://nextjs.org/docs/messages/prerender-error

         > Export encountered errors on following paths:
         	/client/page: /client
         	/server/page: /server"
        `)
      })
    })
  })

  describe('without a next config file', () => {
    describe('without --debug-prerender', () => {
      const { next, isTurbopack } = nextTestSetup({
        files: path.join(__dirname, 'fixtures/without-config-file'),
        skipStart: true,
      })

      beforeAll(() => next.build())

      it('prints no experimental flags (unless enabled via env variable)', async () => {
        if (cacheComponentsEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z (Turbopack, Cache Components)
                - Experiments (use with caution):
                  ✓ reactDebugChannel (enabled by \`__NEXT_EXPERIMENTAL_DEBUG_CHANNEL\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z (webpack, Cache Components)
                - Experiments (use with caution):
                  ✓ reactDebugChannel (enabled by \`__NEXT_EXPERIMENTAL_DEBUG_CHANNEL\`)"
            `)
          }
        } else if (pprEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z (webpack)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)"
            `)
          }
        } else {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(
              `"▲ Next.js x.y.z (Turbopack)"`
            )
          } else if (isRspack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(
              `"▲ Next.js x.y.z (Rspack)"`
            )
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(
              `"▲ Next.js x.y.z (webpack)"`
            )
          }
        }
      })
    })

    describe('with --debug-prerender', () => {
      const { next, isTurbopack } = nextTestSetup({
        files: path.join(__dirname, 'fixtures/without-config-file'),
        skipStart: true,
        buildArgs: ['--debug-prerender'],
      })

      beforeAll(() => next.build())

      it('prints a warning and the customized experimental flags', async () => {
        if (cacheComponentsEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (Turbopack, Cache Components)
                - Experiments (use with caution):
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ reactDebugChannel (enabled by \`__NEXT_EXPERIMENTAL_DEBUG_CHANNEL\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ turbopackMinify (disabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (webpack, Cache Components)
                - Experiments (use with caution):
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ reactDebugChannel (enabled by \`__NEXT_EXPERIMENTAL_DEBUG_CHANNEL\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          }
        } else if (pprEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ turbopackMinify (disabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (webpack)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          }
        } else {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ turbopackMinify (disabled by \`--debug-prerender\`)"
            `)
          } else if (isRspack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (Rspack)
                - Experiments (use with caution):
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (webpack)
                - Experiments (use with caution):
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)"
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

    lines.push(line.replace(nextVersion, 'x.y.z'))
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
        line
          .replace(/at \w+ \(.next[^)]+\)/, 'at x (<next-dist-dir>)')
          // TODO(veil): Bundler protocols should not appear in stackframes.
          .replace('webpack:///', 'bundler:///')
          .replace('turbopack:///[project]/', 'bundler:///')
      )
    }
  }

  return lines.join('\n').trim()
}
