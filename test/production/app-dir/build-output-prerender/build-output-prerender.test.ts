import { nextTestSetup } from 'e2e-utils'
import path from 'path'
const { version: nextVersion } = require('next/package.json')

const cacheComponentsEnabled =
  process.env.__NEXT_EXPERIMENTAL_CACHE_COMPONENTS === 'true'

const pprEnabled = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

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
             "▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_CACHE_COMPONENTS\`)
                  ✓ cacheComponents
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`experimental.cacheComponents\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_CACHE_COMPONENTS\`)
                  ✓ cacheComponents
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`experimental.cacheComponents\`)"
            `)
          }
        } else if (pprEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ cacheComponents
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`experimental.cacheComponents\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ cacheComponents
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`experimental.cacheComponents\`)"
            `)
          }
        } else {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ✓ cacheComponents
                  ✓ enablePrerenderSourceMaps (enabled by \`experimental.cacheComponents\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z
                - Experiments (use with caution):
                  ✓ cacheComponents
                  ✓ enablePrerenderSourceMaps (enabled by \`experimental.cacheComponents\`)"
            `)
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
                ▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_CACHE_COMPONENTS\`)
                  ✓ cacheComponents
                  ⨯ turbopackMinify (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_CACHE_COMPONENTS\`)
                  ✓ cacheComponents
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          }
        } else if (pprEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ cacheComponents
                  ⨯ turbopackMinify (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ cacheComponents
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          }
        } else {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ✓ cacheComponents
                  ⨯ turbopackMinify (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z
                - Experiments (use with caution):
                  ✓ cacheComponents
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`--debug-prerender\`)"
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
         Error: Route "/server" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random
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
             "▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_CACHE_COMPONENTS\`)
                  ✓ cacheComponents (enabled by \`__NEXT_EXPERIMENTAL_CACHE_COMPONENTS\`)
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`experimental.cacheComponents\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_CACHE_COMPONENTS\`)
                  ✓ cacheComponents (enabled by \`__NEXT_EXPERIMENTAL_CACHE_COMPONENTS\`)
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`experimental.cacheComponents\`)"
            `)
          }
        } else if (pprEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "▲ Next.js x.y.z
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)"
            `)
          }
        } else {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(
              `"▲ Next.js x.y.z (Turbopack)"`
            )
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(
              `"▲ Next.js x.y.z"`
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
                ▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_CACHE_COMPONENTS\`)
                  ✓ cacheComponents (enabled by \`__NEXT_EXPERIMENTAL_CACHE_COMPONENTS\`)
                  ⨯ turbopackMinify (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_CACHE_COMPONENTS\`)
                  ✓ cacheComponents (enabled by \`__NEXT_EXPERIMENTAL_CACHE_COMPONENTS\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          }
        } else if (pprEnabled) {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ⨯ turbopackMinify (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z
                - Experiments (use with caution):
                  ✓ ppr (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ clientSegmentCache (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ clientParamParsing (enabled by \`__NEXT_EXPERIMENTAL_PPR\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          }
        } else {
          if (isTurbopack) {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z (Turbopack)
                - Experiments (use with caution):
                  ⨯ turbopackMinify (disabled by \`--debug-prerender\`)
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`--debug-prerender\`)"
            `)
          } else {
            expect(getPreambleOutput(next.cliOutput)).toMatchInlineSnapshot(`
             "⚠ Prerendering is running in debug mode. Note: This may affect performance and should not be used for production.
                ▲ Next.js x.y.z
                - Experiments (use with caution):
                  ✓ serverSourceMaps (enabled by \`--debug-prerender\`)
                  ⨯ serverMinification (disabled by \`--debug-prerender\`)
                  ⨯ prerenderEarlyExit (disabled by \`--debug-prerender\`)
                  ✓ enablePrerenderSourceMaps (enabled by \`--debug-prerender\`)"
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
