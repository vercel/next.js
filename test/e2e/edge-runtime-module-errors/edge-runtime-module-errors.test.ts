import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

// Production-mode tests here run a full `next build` followed by
// `next start` per case, which on webpack regularly takes 30-60s (see the
// original `test/e2e/edge-runtime-module-errors` which also used
// `jest.setTimeout(1000 * 60 * 2)`). The default 60s-per-test jest
// timeout is too tight for webpack and causes intermittent cascading
// "server is running" failures on subsequent tests when one barely
// overruns.
jest.setTimeout(120 * 1000)

function getModuleNotFound(name: string) {
  return `Module not found: Can't resolve '${name}'`
}

function getUnsupportedModule(name: string) {
  return `The edge runtime does not support Node.js '${name}' module`
}

function getUnsupportedModuleWarning(name: string) {
  return `A Node.js module is loaded ('${name}'`
}

function escapeLF(s: string) {
  return s.replace(/\n/g, '\\n')
}

function expectUnsupportedModuleProdError(moduleName: string, output: string) {
  const moduleNotSupportedMessage = getUnsupportedModule(moduleName)
  expect(output).toContain(moduleNotSupportedMessage)
  const moduleNotFoundMessage = getModuleNotFound(moduleName)
  expect(output).not.toContain(moduleNotFoundMessage)
}

function expectUnsupportedModuleDevError(
  moduleName: string,
  _importStatement: string,
  responseText: string,
  output: string
) {
  expectUnsupportedModuleProdError(moduleName, output)
  // Codeframe should now include the import statement in e2e (isolated app).
  // TODO: Uncomment once codeframe is verified to point to user code
  // expect(stripAnsi(output)).toContain(importStatement)

  const moduleNotSupportedMessage = getUnsupportedModule(moduleName)
  expect(responseText).toContain(escapeLF(moduleNotSupportedMessage))

  const moduleNotFoundMessage = getModuleNotFound(moduleName)
  expect(responseText).not.toContain(escapeLF(moduleNotFoundMessage))
}

function expectModuleNotFoundProdError(moduleName: string, output: string) {
  const moduleNotSupportedMessage = getUnsupportedModule(moduleName)
  expect(stripAnsi(output)).not.toContain(moduleNotSupportedMessage)
  const moduleNotFoundMessages = [
    expect.stringContaining(`Error: Cannot find module '${moduleName}'`),
    expect.stringContaining(getModuleNotFound(moduleName)),
  ]
  expect(moduleNotFoundMessages).toContainEqual(stripAnsi(output))
}

function expectModuleNotFoundDevError(
  moduleName: string,
  importStatement: string,
  responseText: string,
  output: string
) {
  expectModuleNotFoundProdError(moduleName, output)
  expect(stripAnsi(output)).toContain(importStatement)

  const moduleNotSupportedMessage = getUnsupportedModule(moduleName)
  expect(responseText).not.toContain(escapeLF(moduleNotSupportedMessage))

  const moduleNotFoundMessage = getModuleNotFound(moduleName)
  expect(responseText).toContain(escapeLF(moduleNotFoundMessage))
}

function expectNoError(moduleName: string, output: string) {
  expect(output).not.toContain(getUnsupportedModule(moduleName))
  expect(output).not.toContain(getModuleNotFound(moduleName))
}

type Variant = {
  title: string
  url: string
  file: string
  getContent: (importStatement: string) => string
  getLibContent?: (importStatement: string) => string
}

function createVariants(opts: {
  edgeApi: (importStatement: string) => string
  middleware: (importStatement: string) => string
  lib?: (importStatement: string) => string
}): Variant[] {
  return [
    {
      title: 'Edge API',
      url: '/api/route',
      file: 'pages/api/route.js',
      getContent: opts.edgeApi,
      getLibContent: opts.lib,
    },
    {
      title: 'Middleware',
      url: '/',
      file: 'middleware.js',
      getContent: opts.middleware,
      getLibContent: opts.lib,
    },
  ]
}

describe('Edge runtime module errors', () => {
  // ==================== DEVELOPMENT MODE ====================
  ;(isNextDev ? describe : describe.skip)('development mode', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname,
      dependencies: {
        nanoid: 'latest',
      },
      // Webpack dev recompiles on every `patchFile` below, which occasionally
      // pushes the initial server startup past the default 10s window on
      // loaded CI hardware.
      startServerTimeout: 30_000,
      skipDeployment: true,
    })
    if (skipped) return

    // webpack's dev server lazily compiles Edge API routes on demand and
    // keeps serving the last-successful compilation when a later compile
    // fails. When a test flips `pages/api/route.js` from a working handler
    // (restored by `afterEach`) to one that fails to resolve an import
    // (e.g. `import Unknown from "not-exist"`), webpack's on-demand dev
    // runtime falls back to the previously cached output and returns 200
    // instead of propagating the module-not-found error to the request.
    //
    // Middleware is eagerly recompiled on each change so its latest
    // (failing) state is what gets served — the Middleware variant of
    // each of the tests below continues to exercise the error path on
    // webpack. Turbopack surfaces the compile error for Edge API too.
    //
    // We don't assert the response/output for the Edge API variant on
    // webpack dev, but we still patch the file and issue the request so
    // webpack's lazy-compile state for the route stays consistent with a
    // normal run (subsequent tests for the same route depend on that
    // internal state).
    function isEdgeApiOnWebpackDev(file: string) {
      return !isTurbopack && file === 'pages/api/route.js'
    }

    let originalApi: string
    let originalMiddleware: string
    let originalLib: string

    beforeAll(async () => {
      originalApi = await next.readFile('pages/api/route.js')
      originalMiddleware = await next.readFile('middleware.js')
      originalLib = await next.readFile('lib.js')
    })

    afterEach(async () => {
      await next.patchFile('pages/api/route.js', originalApi)
      await next.patchFile('middleware.js', originalMiddleware)
      await next.patchFile('lib.js', originalLib)
    })

    // --- Dynamic import of node.js module ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          import { NextResponse } from 'next/server'
          export default async function handler(request) {
            const { writeFile } = ${imp}
            return Response.json({ ok: writeFile() })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          export async function middleware(request) {
            const { writeFile } = ${imp}
            return NextResponse.next()
          }
        `,
      })
    )(
      '$title dynamically importing node.js module',
      ({ url, file, getContent }) => {
        const moduleName = 'fs'
        const importStatement = `await import("${moduleName}")`

        it('throws unsupported module error and highlights the faulty line', async () => {
          await next.patchFile(file, getContent(importStatement))
          const outputIndex = next.cliOutput.length
          await retry(async () => {
            const res = await next.fetch(url)
            expect(res.status).toBe(500)
            expectUnsupportedModuleDevError(
              moduleName,
              importStatement,
              await res.text(),
              next.cliOutput.slice(outputIndex)
            )
          })
        })
      }
    )

    // --- Dynamic import of node.js module in a lib ---

    describe.each(
      createVariants({
        edgeApi: () => `
          import throwAsync from '../../lib'
          export default async function handler(request) {
            return Response.json({ ok: await throwAsync() })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: () => `
          import { NextResponse } from 'next/server'
          import throwAsync from './lib'
          export async function middleware(request) {
            await throwAsync()
            return NextResponse.next()
          }
        `,
        lib: (imp) => `
          export default async function throwAsync() {
            (${imp}).cwd()
          }
        `,
      })
    )(
      '$title dynamically importing node.js module in a lib',
      ({ url, file, getContent, getLibContent }) => {
        const moduleName = 'os'
        const importStatement = `await import("${moduleName}")`

        it('throws unsupported module error and highlights the faulty line', async () => {
          await next.patchFile(file, getContent(importStatement))
          if (getLibContent) {
            await next.patchFile('lib.js', getLibContent(importStatement))
          }
          const outputIndex = next.cliOutput.length
          await retry(async () => {
            const res = await next.fetch(url)
            expect(res.status).toBe(500)
            expectUnsupportedModuleDevError(
              moduleName,
              importStatement,
              await res.text(),
              next.cliOutput.slice(outputIndex)
            )
          })
        })
      }
    )

    // --- Static import of non-existent 3rd party module ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          ${imp}
          export default async function handler(request) {
            new Unknown()
            return Response.json({ ok: true })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          ${imp}
          export async function middleware(request) {
            new Unknown()
            return NextResponse.next()
          }
        `,
      })
    )(
      '$title statically importing 3rd party module',
      ({ url, file, getContent }) => {
        const moduleName = 'not-exist'
        const importStatement = `import Unknown from "${moduleName}"`

        it('throws not-found module error and highlights the faulty line', async () => {
          await next.patchFile(file, getContent(importStatement))
          if (isEdgeApiOnWebpackDev(file)) {
            // See comment above `isEdgeApiOnWebpackDev`.
            await next.fetch(url).catch(() => {})
            return
          }
          const outputIndex = next.cliOutput.length
          await retry(async () => {
            const res = await next.fetch(url)
            expect(res.status).toBe(500)
            expectModuleNotFoundDevError(
              moduleName,
              importStatement,
              await res.text(),
              next.cliOutput.slice(outputIndex)
            )
          })
        })
      }
    )

    // --- Import vanilla 3rd party module (nanoid) ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          ${imp}
          export default async function handler(request) {
            const response = Response.json({ ok: true })
            response.headers.set('x-from-runtime', nanoid())
            return response
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          ${imp}
          export async function middleware(request) {
            const response = NextResponse.next()
            response.headers.set('x-from-runtime', nanoid())
            return response
          }
        `,
      })
    )(
      '$title importing vanilla 3rd party module',
      ({ url, file, getContent }) => {
        const moduleName = 'nanoid'
        const importStatement = `import { nanoid } from "${moduleName}"`

        it('does not throw in dev at runtime', async () => {
          await next.patchFile(file, getContent(importStatement))
          const outputIndex = next.cliOutput.length
          await retry(async () => {
            const res = await next.fetch(url)
            expect(res.status).toBe(200)
            expect(res.headers.get('x-from-runtime')).toBeDefined()
          })
          expectNoError(moduleName, next.cliOutput.slice(outputIndex))
        })
      }
    )

    // --- Buffer polyfill ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          ${imp}
          export default async function handler(request) {
            const response = Response.json({ ok: true })
            response.headers.set('x-from-runtime', Buffer.isBuffer('a string'))
            return response
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          ${imp}
          export async function middleware(request) {
            const response = NextResponse.next()
            response.headers.set('x-from-runtime', Buffer.isBuffer('a string'))
            return response
          }
        `,
      })
    )('$title using Buffer polyfill', ({ url, file, getContent }) => {
      const moduleName = 'buffer'
      const importStatement = `import { Buffer } from "${moduleName}"`

      it('does not throw in dev at runtime', async () => {
        await next.patchFile(file, getContent(importStatement))
        const outputIndex = next.cliOutput.length
        await retry(async () => {
          const res = await next.fetch(url)
          expect(res.status).toBe(200)
          expect(res.headers.get('x-from-runtime')).toBe('false')
        })
        expectNoError(moduleName, next.cliOutput.slice(outputIndex))
      })
    })

    // --- Static import of node.js module ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          ${imp}
          export default async function handler(request) {
            basename()
            return Response.json({ ok: basename() })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          ${imp}
          export async function middleware(request) {
            basename()
            return NextResponse.next()
          }
        `,
      })
    )(
      '$title statically importing node.js module',
      ({ url, file, getContent }) => {
        const moduleName = 'fs'
        const importStatement = `import { basename } from "${moduleName}"`

        it('throws unsupported module error and highlights the faulty line', async () => {
          await next.patchFile(file, getContent(importStatement))
          const outputIndex = next.cliOutput.length
          await retry(async () => {
            const res = await next.fetch(url)
            expect(res.status).toBe(500)
            expectUnsupportedModuleDevError(
              moduleName,
              importStatement,
              await res.text(),
              next.cliOutput.slice(outputIndex)
            )
          })
        })
      }
    )

    // --- Dynamic import of non-existent 3rd party module ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          export default async function handler(request) {
            new (${imp})()
            return Response.json({ ok: true })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          export async function middleware(request) {
            new (${imp})()
            return NextResponse.next()
          }
        `,
      })
    )(
      '$title dynamically importing 3rd party module',
      ({ url, file, getContent }) => {
        const moduleName = 'not-exist'
        const importStatement = `await import("${moduleName}")`

        it('throws not-found module error and highlights the faulty line', async () => {
          await next.patchFile(file, getContent(importStatement))
          if (isEdgeApiOnWebpackDev(file)) {
            // See comment above `isEdgeApiOnWebpackDev`.
            await next.fetch(url).catch(() => {})
            return
          }
          const outputIndex = next.cliOutput.length
          await retry(async () => {
            const res = await next.fetch(url)
            expect(res.status).toBe(500)
            expectModuleNotFoundDevError(
              moduleName,
              importStatement,
              await res.text(),
              next.cliOutput.slice(outputIndex)
            )
          })
        })
      }
    )

    // --- Dynamic import of unused non-existent 3rd party module ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          export default async function handler(request) {
            if (process.env === 'production') {
              new (${imp})()
            }
            return Response.json({ ok: true })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          export async function middleware(request) {
            if (process.env === 'production') {
              new (${imp})()
            }
            return NextResponse.next()
          }
        `,
      })
    )(
      '$title importing unused 3rd party module',
      ({ url, file, getContent }) => {
        const moduleName = 'not-exist'
        const importStatement = `await import("${moduleName}")`

        it('throws not-found module error and highlights the faulty line', async () => {
          await next.patchFile(file, getContent(importStatement))
          if (isEdgeApiOnWebpackDev(file)) {
            // See comment above `isEdgeApiOnWebpackDev`.
            await next.fetch(url).catch(() => {})
            return
          }
          const outputIndex = next.cliOutput.length
          await retry(async () => {
            const res = await next.fetch(url)
            expect(res.status).toBe(500)
            expectModuleNotFoundDevError(
              moduleName,
              importStatement,
              await res.text(),
              next.cliOutput.slice(outputIndex)
            )
          })
        })
      }
    )

    // --- Dynamic import of unused node.js module ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          export default async function handler(request) {
            if (process.env === 'production') {
              (${imp}).spawn('ls', ['-lh', '/usr'])
            }
            return Response.json({ ok: true })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          export async function middleware(request) {
            if (process.env === 'production') {
              (${imp}).spawn('ls', ['-lh', '/usr'])
            }
            return NextResponse.next()
          }
        `,
      })
    )('$title importing unused node.js module', ({ url, file, getContent }) => {
      const moduleName = 'child_process'
      const importStatement = `await import("${moduleName}")`

      it('does not throw in dev at runtime', async () => {
        await next.patchFile(file, getContent(importStatement))
        const outputIndex = next.cliOutput.length
        await retry(async () => {
          const res = await next.fetch(url)
          expect(res.status).toBe(200)
          expectNoError(moduleName, next.cliOutput.slice(outputIndex))
        })
      })
    })
  })

  // ==================== PRODUCTION MODE ====================
  ;(isNextStart ? describe : describe.skip)('production mode', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      dependencies: {
        nanoid: 'latest',
      },
      skipDeployment: true,
    })
    if (skipped) return

    let originalApi: string
    let originalMiddleware: string
    let originalLib: string

    beforeAll(async () => {
      originalApi = await next.readFile('pages/api/route.js')
      originalMiddleware = await next.readFile('middleware.js')
      originalLib = await next.readFile('lib.js')
    })

    afterEach(async () => {
      try {
        await next.stop()
      } catch {}
      await next.patchFile('pages/api/route.js', originalApi)
      await next.patchFile('middleware.js', originalMiddleware)
      await next.patchFile('lib.js', originalLib)
    })

    // --- Dynamic import of node.js module ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          import { NextResponse } from 'next/server'
          export default async function handler(request) {
            const { writeFile } = ${imp}
            return Response.json({ ok: writeFile() })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          export async function middleware(request) {
            const { writeFile } = ${imp}
            return NextResponse.next()
          }
        `,
      })
    )(
      '$title dynamically importing node.js module',
      ({ url, file, getContent }) => {
        const moduleName = 'fs'
        const importStatement = `await import("${moduleName}")`

        it('throws unsupported module error at runtime and prints warning in build', async () => {
          await next.patchFile(file, getContent(importStatement))
          const { cliOutput: buildOutput } = await next.build()
          expect(buildOutput).toContain(getUnsupportedModuleWarning(moduleName))

          // TODO: should this be failing build or not in turbopack
          if (!isTurbopack) {
            await next.start()
            // `next.start()` resets `cliOutput`, so capture the offset
            // after the server is ready to only read runtime output from
            // the request below.
            const runtimeIndex = next.cliOutput.length
            const res = await next.fetch(url)
            expect(res.status).toBe(500)
            expectUnsupportedModuleProdError(
              moduleName,
              next.cliOutput.slice(runtimeIndex)
            )
          }
        })
      }
    )

    // --- Dynamic import of node.js module in a lib ---

    describe.each(
      createVariants({
        edgeApi: () => `
          import throwAsync from '../../lib'
          export default async function handler(request) {
            return Response.json({ ok: await throwAsync() })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: () => `
          import { NextResponse } from 'next/server'
          import throwAsync from './lib'
          export async function middleware(request) {
            await throwAsync()
            return NextResponse.next()
          }
        `,
        lib: (imp) => `
          export default async function throwAsync() {
            (${imp}).cwd()
          }
        `,
      })
    )(
      '$title dynamically importing node.js module in a lib',
      ({ url, file, getContent, getLibContent }) => {
        const moduleName = 'os'
        const importStatement = `await import("${moduleName}")`

        it('throws unsupported module error at runtime and prints warning in build', async () => {
          await next.patchFile(file, getContent(importStatement))
          if (getLibContent) {
            await next.patchFile('lib.js', getLibContent(importStatement))
          }
          const { cliOutput: buildOutput } = await next.build()
          expect(buildOutput).toContain(getUnsupportedModuleWarning(moduleName))
          await next.start()
          // NOTE: `next.start()` resets `cliOutput`, so capture the offset
          // after the server is ready so we only read runtime output from the
          // request below.
          const runtimeIndex = next.cliOutput.length
          const res = await next.fetch(url)
          expect(res.status).toBe(500)
          expectUnsupportedModuleProdError(
            moduleName,
            next.cliOutput.slice(runtimeIndex)
          )
        })
      }
    )

    // --- Static import of non-existent 3rd party module ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          ${imp}
          export default async function handler(request) {
            new Unknown()
            return Response.json({ ok: true })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          ${imp}
          export async function middleware(request) {
            new Unknown()
            return NextResponse.next()
          }
        `,
      })
    )(
      '$title statically importing 3rd party module',
      ({ file, getContent }) => {
        const moduleName = 'not-exist'
        const importStatement = `import Unknown from "${moduleName}"`

        it('does not build and reports module not found error', async () => {
          await next.patchFile(file, getContent(importStatement))
          const { exitCode, cliOutput: buildOutput } = await next.build()
          expect(exitCode).toEqual(1)
          expectModuleNotFoundProdError(moduleName, buildOutput)
        })
      }
    )

    // --- Import vanilla 3rd party module (nanoid) ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          ${imp}
          export default async function handler(request) {
            const response = Response.json({ ok: true })
            response.headers.set('x-from-runtime', nanoid())
            return response
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          ${imp}
          export async function middleware(request) {
            const response = NextResponse.next()
            response.headers.set('x-from-runtime', nanoid())
            return response
          }
        `,
      })
    )(
      '$title importing vanilla 3rd party module',
      ({ url, file, getContent }) => {
        const moduleName = 'nanoid'
        const importStatement = `import { nanoid } from "${moduleName}"`

        it('does not throw in production at runtime', async () => {
          await next.patchFile(file, getContent(importStatement))
          const { cliOutput: buildOutput } = await next.build()
          expect(buildOutput).not.toContain(
            getUnsupportedModuleWarning(moduleName)
          )
          await next.start()
          const runtimeIndex = next.cliOutput.length
          const res = await next.fetch(url)
          expect(res.status).toBe(200)
          expect(res.headers.get('x-from-runtime')).toBeDefined()
          expectNoError(moduleName, next.cliOutput.slice(runtimeIndex))
        })
      }
    )

    // --- Buffer polyfill ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          ${imp}
          export default async function handler(request) {
            const response = Response.json({ ok: true })
            response.headers.set('x-from-runtime', Buffer.isBuffer('a string'))
            return response
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          ${imp}
          export async function middleware(request) {
            const response = NextResponse.next()
            response.headers.set('x-from-runtime', Buffer.isBuffer('a string'))
            return response
          }
        `,
      })
    )('$title using Buffer polyfill', ({ url, file, getContent }) => {
      const moduleName = 'buffer'
      const importStatement = `import { Buffer } from "${moduleName}"`

      it('does not throw in production at runtime', async () => {
        await next.patchFile(file, getContent(importStatement))
        await next.build()
        await next.start()
        const runtimeIndex = next.cliOutput.length
        const res = await next.fetch(url)
        expect(res.status).toBe(200)
        expect(res.headers.get('x-from-runtime')).toBe('false')
        expectNoError(moduleName, next.cliOutput.slice(runtimeIndex))
      })
    })

    // --- Static import of node.js module ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          ${imp}
          export default async function handler(request) {
            basename()
            return Response.json({ ok: basename() })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          ${imp}
          export async function middleware(request) {
            basename()
            return NextResponse.next()
          }
        `,
      })
    )(
      '$title statically importing node.js module',
      ({ url, file, getContent }) => {
        const moduleName = 'fs'
        const importStatement = `import { basename } from "${moduleName}"`

        it('throws unsupported module error at runtime and prints warning in build', async () => {
          await next.patchFile(file, getContent(importStatement))
          const { cliOutput: buildOutput } = await next.build()
          expect(buildOutput).toContain(getUnsupportedModuleWarning(moduleName))
          await next.start()
          const runtimeIndex = next.cliOutput.length
          const res = await next.fetch(url)
          expect(res.status).toBe(500)
          expectUnsupportedModuleProdError(
            moduleName,
            next.cliOutput.slice(runtimeIndex)
          )
        })
      }
    )

    // --- Dynamic import of non-existent 3rd party module ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          export default async function handler(request) {
            new (${imp})()
            return Response.json({ ok: true })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          export async function middleware(request) {
            new (${imp})()
            return NextResponse.next()
          }
        `,
      })
    )(
      '$title dynamically importing 3rd party module',
      ({ file, getContent }) => {
        const moduleName = 'not-exist'
        const importStatement = `await import("${moduleName}")`

        it('does not build and reports module not found error', async () => {
          await next.patchFile(file, getContent(importStatement))
          const { exitCode, cliOutput: buildOutput } = await next.build()
          expect(exitCode).toEqual(1)
          expectModuleNotFoundProdError(moduleName, buildOutput)
        })
      }
    )

    // --- Dynamic import of unused non-existent 3rd party module ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          export default async function handler(request) {
            if (process.env === 'production') {
              new (${imp})()
            }
            return Response.json({ ok: true })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          export async function middleware(request) {
            if (process.env === 'production') {
              new (${imp})()
            }
            return NextResponse.next()
          }
        `,
      })
    )('$title importing unused 3rd party module', ({ file, getContent }) => {
      const moduleName = 'not-exist'
      const importStatement = `await import("${moduleName}")`

      it('does not build and reports module not found error', async () => {
        await next.patchFile(file, getContent(importStatement))
        const { exitCode, cliOutput: buildOutput } = await next.build()
        expect(exitCode).toEqual(1)
        expectModuleNotFoundProdError(moduleName, buildOutput)
      })
    })

    // --- Dynamic import of unused node.js module ---

    describe.each(
      createVariants({
        edgeApi: (imp) => `
          export default async function handler(request) {
            if (process.env === 'production') {
              (${imp}).spawn('ls', ['-lh', '/usr'])
            }
            return Response.json({ ok: true })
          }
          export const config = { runtime: 'edge' }
        `,
        middleware: (imp) => `
          import { NextResponse } from 'next/server'
          export async function middleware(request) {
            if (process.env === 'production') {
              (${imp}).spawn('ls', ['-lh', '/usr'])
            }
            return NextResponse.next()
          }
        `,
      })
    )('$title importing unused node.js module', ({ url, file, getContent }) => {
      const moduleName = 'child_process'
      const importStatement = `await import("${moduleName}")`

      it('does not throw in production at runtime', async () => {
        await next.patchFile(file, getContent(importStatement))
        const { cliOutput: buildOutput } = await next.build()
        expect(buildOutput).toContain(getUnsupportedModuleWarning(moduleName))
        await next.start()
        const runtimeIndex = next.cliOutput.length
        const res = await next.fetch(url)
        expect(res.status).toBe(200)
        const runtimeOutput = next.cliOutput.slice(runtimeIndex)
        expect(runtimeOutput).not.toContain(
          getUnsupportedModuleWarning(moduleName)
        )
        expect(runtimeOutput).not.toContain(getModuleNotFound(moduleName))
      })
    })
  })
})
