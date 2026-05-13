import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'
import { retry } from 'next-test-utils'

const TELEMETRY_EVENT_NAME = 'NEXT_EDGE_ALLOW_DYNAMIC_USED'
const LIB_PATH = 'node_modules/lib/index.js'

// Production-mode tests run a full `next build` followed by `next start`,
// which on webpack regularly takes 30-60s per test case (see the original
// `test/e2e/edge-runtime-configurable-guards` which also used
// `jest.setTimeout(1000 * 60 * 2)`). The default 60s-per-test timeout is
// too tight for webpack here; bump it so slower runs do not cascade into
// "server is running" errors on subsequent tests.
jest.setTimeout(120 * 1000)

describe('Edge runtime configurable guards', () => {
  ;(isNextDev ? describe : describe.skip)('development mode', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })
    if (skipped) return

    let originalApiRoute: string
    let originalMiddleware: string
    let originalLib: string

    beforeAll(async () => {
      originalApiRoute = await next.readFile('pages/api/route.js')
      originalMiddleware = await next.readFile('middleware.js')
      // Handle lib file which might not exist or be empty
      try {
        originalLib = await next.readFile(LIB_PATH)
      } catch (e) {
        // File doesn't exist, use default content
        originalLib = '// populated by tests\n'
      }
    })

    afterEach(async () => {
      await next.patchFile('pages/api/route.js', originalApiRoute)
      await next.patchFile('middleware.js', originalMiddleware)
      await next.patchFile(LIB_PATH, originalLib)
    })

    // Webpack treats `node_modules` as a "managed path" in its snapshot
    // config (see packages/next/src/build/webpack-config.ts), meaning it
    // assumes the contents of any file under `node_modules` are immutable
    // per package version. When a test patches
    // `node_modules/lib/index.js`, webpack's dev server keeps serving the
    // originally-cached (empty) lib module, so imports like
    // `import { hasDynamic } from 'lib'` resolve to an object without
    // `hasDynamic`. Restarting the dev server forces a fresh read of
    // `node_modules/lib/index.js`. Turbopack watches node_modules
    // correctly and does not need this workaround.
    async function restartForWebpackIfLibPatched(libPatched: boolean) {
      if (!libPatched || isTurbopack) return
      await next.stop()
      await next.start()
    }

    describe('Multiple functions with different configurations', () => {
      async function patchMultipleFunctions() {
        await next.patchFile(
          'middleware.js',
          `
          import { NextResponse } from 'next/server'

          export default () => {
            eval('100')
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '/middleware.js'
          }
        `
        )
        await next.patchFile(
          'pages/api/route.js',
          `
          export default async function handler(request) {
            eval('100')
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '**/node_modules/lib/**'
          }
        `
        )
      }

      it('warns in dev for allowed code', async () => {
        await patchMultipleFunctions()
        const outputIndex = next.cliOutput.length
        await retry(async () => {
          const res = await next.fetch('/')
          expect(res.status).toBe(200)
          expect(next.cliOutput.slice(outputIndex)).toContain(
            `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
          )
        })
      })

      it('warns in dev for unallowed code', async () => {
        await patchMultipleFunctions()
        const outputIndex = next.cliOutput.length
        await retry(async () => {
          const res = await next.fetch('/api/route')
          expect(res.status).toBe(200)
          expect(next.cliOutput.slice(outputIndex)).toContain(
            `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
          )
        })
      })
    })

    describe.each([
      {
        title: 'Edge API',
        url: '/api/route',
        apiContent: `
          export default async function handler(request) {
            eval('100')
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '**'
          }
        `,
        middlewareContent: null as string | null,
        libContent: null as string | null,
        skip: false,
      },
      {
        title: 'Middleware',
        url: '/',
        apiContent: null as string | null,
        middlewareContent: `
          import { NextResponse } from 'next/server'

          export default () => {
            eval('100')
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '**'
          }
        `,
        libContent: null as string | null,
        skip: false,
      },
      {
        title: 'Edge API using lib',
        url: '/api/route',
        apiContent: `
          import { hasDynamic } from 'lib'
          export default async function handler(request) {
            await hasDynamic()
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '**/node_modules/lib/**'
          }
        `,
        middlewareContent: null as string | null,
        libContent: `
          export async function hasDynamic() {
            eval('100')
          }
        `,
        skip: false,
      },
      {
        title: 'Middleware using lib',
        url: '/',
        apiContent: null as string | null,
        middlewareContent: `
          import { NextResponse } from 'next/server'
          import { hasDynamic } from 'lib'

          // populated with tests
          export default async function () {
            await hasDynamic()
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '**/node_modules/lib/**'
          }
        `,
        libContent: `
          export async function hasDynamic() {
            eval('100')
          }
        `,
        // TODO: Re-enable when Turbopack applies the middleware dynamic code
        // evaluation transforms also to code in node_modules.
        skip: isTurbopack,
      },
    ])(
      '$title with allowed, used dynamic code',
      ({ url, apiContent, middlewareContent, libContent, skip }) => {
        ;(skip ? it.skip : it)('still warns in dev at runtime', async () => {
          if (apiContent) await next.patchFile('pages/api/route.js', apiContent)
          if (middlewareContent)
            await next.patchFile('middleware.js', middlewareContent)
          if (libContent) await next.patchFile(LIB_PATH, libContent)
          await restartForWebpackIfLibPatched(libContent !== null)

          const outputIndex = next.cliOutput.length
          await retry(async () => {
            const res = await next.fetch(url)

            expect(res.status).toBe(200)

            expect(next.cliOutput.slice(outputIndex)).toContain(
              `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
            )
          })
        })
      }
    )

    describe.each([
      {
        title: 'Edge API using lib',
        url: '/api/route',
        apiContent: `
          import { hasDynamic } from 'lib'
          export default async function handler(request) {
            await hasDynamic()
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '/pages/**'
          }
        `,
        middlewareContent: null as string | null,
        libContent: `
          export async function hasDynamic() {
            eval('100')
          }
        `,
        // TODO: Re-enable when Turbopack applies the edge runtime transforms also
        // to code in node_modules.
        skip: isTurbopack,
      },
      {
        title: 'Middleware using lib',
        url: '/',
        apiContent: null as string | null,
        middlewareContent: `
          import { NextResponse } from 'next/server'
          import { hasDynamic } from 'lib'
          export default async function () {
            await hasDynamic()
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '/pages/**'
          }
        `,
        libContent: `
          export async function hasDynamic() {
            eval('100')
          }
        `,
        // TODO: Re-enable when Turbopack applies the middleware dynamic code
        // evaluation transforms also to code in node_modules.
        skip: isTurbopack,
      },
    ])(
      '$title with unallowed, used dynamic code',
      ({ url, apiContent, middlewareContent, libContent, skip }) => {
        ;(skip ? it.skip : it)('warns in dev at runtime', async () => {
          if (apiContent) await next.patchFile('pages/api/route.js', apiContent)
          if (middlewareContent)
            await next.patchFile('middleware.js', middlewareContent)
          if (libContent) await next.patchFile(LIB_PATH, libContent)
          await restartForWebpackIfLibPatched(libContent !== null)

          const outputIndex = next.cliOutput.length
          await retry(async () => {
            const res = await next.fetch(url)

            expect(res.status).toBe(200)

            expect(next.cliOutput.slice(outputIndex)).toContain(
              `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
            )
          })
        })
      }
    )

    describe.each([
      {
        title: 'Edge API',
        url: '/api/route',
        apiContent: `
          export default async function handler(request) {
            return Response.json({ result: (() => {}) instanceof Function })
          }
          export const config = { runtime: 'edge' }
        `,
        middlewareContent: null as string | null,
      },
      {
        title: 'Middleware',
        url: '/',
        apiContent: null as string | null,
        middlewareContent: `
          import { NextResponse } from 'next/server'
          import { returnTrue } from 'lib'
          export default async function () {
            (() => {}) instanceof Function
            return NextResponse.next()
          }
        `,
      },
    ])(
      '$title with use of Function as a type',
      ({ url, apiContent, middlewareContent }) => {
        it('does not warn in dev at runtime', async () => {
          if (apiContent) await next.patchFile('pages/api/route.js', apiContent)
          if (middlewareContent)
            await next.patchFile('middleware.js', middlewareContent)

          const outputIndex = next.cliOutput.length
          await retry(async () => {
            const res = await next.fetch(url)
            expect(res.status).toBe(200)
          })
          expect(next.cliOutput.slice(outputIndex)).not.toContain(
            `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
          )
        })
      }
    )
  })
  ;(isNextStart ? describe : describe.skip)('production mode', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      env: shouldUseTurbopack() ? {} : { NEXT_TELEMETRY_DEBUG: '1' },
      skipDeployment: true,
    })
    if (skipped) return

    let originalApiRoute: string
    let originalMiddleware: string
    let originalLib: string

    beforeAll(async () => {
      originalApiRoute = await next.readFile('pages/api/route.js')
      originalMiddleware = await next.readFile('middleware.js')
      // Handle lib file which might not exist or be empty
      try {
        originalLib = await next.readFile(LIB_PATH)
      } catch (e) {
        // File doesn't exist, use default content
        originalLib = '// populated by tests\n'
      }
    })

    afterEach(async () => {
      // Production-mode tests that reach `next.start()` normally call
      // `next.stop()` themselves, but if a test times out or throws before
      // that we would otherwise leave the server running and every later
      // `next.build()` call would fail with
      // "can not run export while server is running". Stopping here is a
      // no-op when the server is already stopped.
      try {
        await next.stop()
      } catch {}
      await next.patchFile('pages/api/route.js', originalApiRoute)
      await next.patchFile('middleware.js', originalMiddleware)
      await next.patchFile(LIB_PATH, originalLib)
      // Webpack treats `node_modules` as a "managed path" in its snapshot
      // config, so changes to `node_modules/lib/index.js` between test
      // cases are not invalidated from webpack's persistent build cache
      // at `.next/cache/webpack`. That causes later builds to re-use a
      // stale compiled `lib` module from a previous test (e.g. still
      // containing `hasUnusedDynamic`), which can trip the
      // `unstable_allowDynamic` analyzer. Drop the entire `.next` dir
      // between cases so each build reads `lib` fresh. Turbopack does
      // not share this cache and does not need the workaround.
      if (!isTurbopack) {
        await next.deleteFile('.next')
      }
    })

    // eslint-disable-next-line jest/no-identical-title
    describe('Multiple functions with different configurations', () => {
      it('fails to build because of unallowed code', async () => {
        await next.patchFile(
          'middleware.js',
          `
          import { NextResponse } from 'next/server'

          export default () => {
            eval('100')
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '/middleware.js'
          }
        `
        )
        await next.patchFile(
          'pages/api/route.js',
          `
          export default async function handler(request) {
            eval('100')
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '**/node_modules/lib/**'
          }
        `
        )

        const outputIndex = next.cliOutput.length
        const { exitCode } = await next.build()
        const buildOutput = next.cliOutput.slice(outputIndex)

        expect(exitCode).toBe(1)
        if (!isTurbopack) {
          expect(buildOutput).toContain(`./pages/api/route.js`)
        }
        expect(buildOutput).toContain(
          `Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime`
        )
        if (!isTurbopack) {
          expect(buildOutput).toContain(`Used by default`)
          expect(buildOutput).toContain(TELEMETRY_EVENT_NAME)
        }
      })
    })

    describe.each([
      {
        title: 'Edge API',
        url: '/api/route',
        apiContent: `
          export default async function handler(request) {
            if ((() => false)()) {
              eval('100')
            }
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '**'
          }
        `,
        middlewareContent: null as string | null,
        libContent: null as string | null,
      },
      {
        title: 'Middleware',
        url: '/',
        apiContent: null as string | null,
        middlewareContent: `
          import { NextResponse } from 'next/server'
          // populated with tests
          export default () => {
            if ((() => false)()) {
              eval('100')
            }
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '**'
          }
        `,
        libContent: null as string | null,
      },
      {
        title: 'Edge API using lib',
        url: '/api/route',
        apiContent: `
          import { hasUnusedDynamic } from 'lib'
          export default async function handler(request) {
            await hasUnusedDynamic()
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '**/node_modules/lib/**'
          }
        `,
        middlewareContent: null as string | null,
        libContent: `
          export async function hasUnusedDynamic() {
            if ((() => false)()) {
              eval('100')
            }
          }
        `,
      },
      {
        title: 'Middleware using lib',
        url: '/',
        apiContent: null as string | null,
        middlewareContent: `
          import { NextResponse } from 'next/server'
          import { hasUnusedDynamic } from 'lib'
          // populated with tests
          export default async function () {
            await hasUnusedDynamic()
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '**/node_modules/lib/**'
          }
        `,
        libContent: `
          export async function hasUnusedDynamic() {
            if ((() => false)()) {
              eval('100')
            }
          }
        `,
      },
    ])(
      '$title with allowed, unused dynamic code',
      ({ url, apiContent, middlewareContent, libContent }) => {
        // unstable_allowDynamic configuration is not supported in Turbopack.
        ;(isTurbopack ? it.skip : it)(
          'build and does not warn at runtime',
          async () => {
            if (apiContent)
              await next.patchFile('pages/api/route.js', apiContent)
            if (middlewareContent)
              await next.patchFile('middleware.js', middlewareContent)
            if (libContent) await next.patchFile(LIB_PATH, libContent)

            const outputIndex = next.cliOutput.length
            await next.build()
            const buildOutput = next.cliOutput.slice(outputIndex)

            // eslint-disable-next-line jest/no-standalone-expect
            expect(buildOutput).not.toContain(`Build failed`)
            if (!isTurbopack) {
              // eslint-disable-next-line jest/no-standalone-expect
              expect(buildOutput).toContain(TELEMETRY_EVENT_NAME)
            }

            await next.start()
            const startIndex = next.cliOutput.length

            const res = await next.fetch(url)
            // eslint-disable-next-line jest/no-standalone-expect
            expect(res.status).toBe(200)
            // eslint-disable-next-line jest/no-standalone-expect
            expect(next.cliOutput.slice(startIndex)).not.toContain(`warn`)
            // eslint-disable-next-line jest/no-standalone-expect
            expect(next.cliOutput.slice(startIndex)).not.toContain(
              `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
            )
            await next.stop()
          }
        )
      }
    )

    describe.each([
      {
        title: 'Edge API using lib',
        apiContent: `
          import { hasDynamic } from 'lib'
          export default async function handler(request) {
            await hasDynamic()
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '/pages/**'
          }
        `,
        middlewareContent: null as string | null,
        libContent: `
          export async function hasDynamic() {
            eval('100')
          }
        `,
        // TODO: Re-enable when Turbopack applies the edge runtime transforms also
        // to code in node_modules.
        skip: isTurbopack,
      },
      {
        title: 'Middleware using lib',
        apiContent: null as string | null,
        middlewareContent: `
          import { NextResponse } from 'next/server'
          import { hasDynamic } from 'lib'
          export default async function () {
            await hasDynamic()
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '/pages/**'
          }
        `,
        libContent: `
          export async function hasDynamic() {
            eval('100')
          }
        `,
        // TODO: Re-enable when Turbopack applies the middleware dynamic code
        // evaluation transforms also to code in node_modules.
        skip: isTurbopack,
      },
    ])(
      '$title with unallowed, used dynamic code',
      ({ apiContent, middlewareContent, libContent, skip }) => {
        ;(skip ? it.skip : it)(
          'fails to build because of dynamic code evaluation',
          async () => {
            if (apiContent)
              await next.patchFile('pages/api/route.js', apiContent)
            if (middlewareContent)
              await next.patchFile('middleware.js', middlewareContent)
            if (libContent) await next.patchFile(LIB_PATH, libContent)

            const outputIndex = next.cliOutput.length
            await next.build()
            const buildOutput = next.cliOutput.slice(outputIndex)

            // eslint-disable-next-line jest/no-standalone-expect
            expect(buildOutput).toContain(
              `Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime`
            )
            if (!isTurbopack) {
              // eslint-disable-next-line jest/no-standalone-expect
              expect(buildOutput).toContain(TELEMETRY_EVENT_NAME)
            }
          }
        )
      }
    )

    describe.each([
      {
        title: 'Edge API',
        url: '/api/route',
        apiContent: `
          export default async function handler(request) {
            return Response.json({ result: (() => {}) instanceof Function })
          }
          export const config = { runtime: 'edge' }
        `,
        middlewareContent: null as string | null,
      },
      {
        title: 'Middleware',
        url: '/',
        apiContent: null as string | null,
        middlewareContent: `
          import { NextResponse } from 'next/server'
          import { returnTrue } from 'lib'
          export default async function () {
            (() => {}) instanceof Function
            return NextResponse.next()
          }
        `,
      },
    ])(
      '$title with use of Function as a type',
      ({ url, apiContent, middlewareContent }) => {
        // unstable_allowDynamic configuration is not supported in Turbopack.
        ;(isTurbopack ? it.skip : it)(
          'build and does not warn at runtime',
          async () => {
            if (apiContent)
              await next.patchFile('pages/api/route.js', apiContent)
            if (middlewareContent)
              await next.patchFile('middleware.js', middlewareContent)

            const outputIndex = next.cliOutput.length
            await next.build()
            const buildOutput = next.cliOutput.slice(outputIndex)

            // eslint-disable-next-line jest/no-standalone-expect
            expect(buildOutput).not.toContain(`Build failed`)

            await next.start()
            const startIndex = next.cliOutput.length

            const res = await next.fetch(url)
            // eslint-disable-next-line jest/no-standalone-expect
            expect(res.status).toBe(200)
            // eslint-disable-next-line jest/no-standalone-expect
            expect(next.cliOutput.slice(startIndex)).not.toContain(`warn`)
            // eslint-disable-next-line jest/no-standalone-expect
            expect(next.cliOutput.slice(startIndex)).not.toContain(
              `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
            )
            await next.stop()
          }
        )
      }
    )
  })
})
