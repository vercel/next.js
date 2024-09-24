/* eslint-disable jest/no-identical-title */
/* eslint-env jest */

import { remove } from 'fs-extra'
import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  retry,
} from 'next-test-utils'
import {
  context,
  appOption,
  expectModuleNotFoundDevError,
  expectModuleNotFoundProdError,
  expectNoError,
  expectUnsupportedModuleDevError,
  expectUnsupportedModuleProdError,
  getUnsupportedModuleWarning,
  getModuleNotFound,
} from './utils'

jest.setTimeout(1000 * 60 * 2)

const routeUrl = '/api/route'
const middlewareUrl = '/'

describe('Edge runtime code with imports', () => {
  beforeEach(async () => {
    context.appPort = await findPort()
    context.logs = { output: '', stdout: '', stderr: '' }
    await remove(join(__dirname, '../.next'))
  })

  afterEach(async () => {
    if (context.app) {
      await killApp(context.app)
    }
    context.api.restore()
    context.middleware.restore()
    context.lib.restore()
    context.page.restore()
  })
  describe.each([
    {
      title: 'Edge API',
      url: routeUrl,
      init(importStatement) {
        context.api.write(`
          ${importStatement}

          export default async function handler(request) {
            basename()
            return Response.json({ ok: basename() })
          }

          export const config = { runtime: 'edge' }
        `)
      },
    },
    {
      title: 'Middleware',
      url: middlewareUrl,
      init(importStatement) {
        context.middleware.write(`
          import { NextResponse } from 'next/server'
          ${importStatement}

          export async function middleware(request) {
            basename()
            return NextResponse.next()
          }
        `)
      },
    },
  ])('$title statically importing node.js module', ({ init, url }) => {
    const moduleName = 'fs'
    const importStatement = `import { basename } from "${moduleName}"`

    beforeEach(() => init(importStatement))

    it('throws unsupported module error in dev at runtime and highlights the faulty line', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      await retry(async () => {
        const res = await fetchViaHTTP(context.appPort, url)
        expect(res.status).toBe(500)
        const text = await res.text()
        expectUnsupportedModuleDevError(moduleName, importStatement, text)
      })
    })
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        it('throws unsupported module error in production at runtime and prints error on logs', async () => {
          const { stderr } = await nextBuild(context.appDir, undefined, {
            stderr: true,
          })
          expect(stderr).toContain(getUnsupportedModuleWarning(moduleName))
          context.app = await nextStart(
            context.appDir,
            context.appPort,
            appOption
          )
          const res = await fetchViaHTTP(context.appPort, url)
          expect(res.status).toBe(500)
          expectUnsupportedModuleProdError(moduleName)
        })
      }
    )
  })

  describe.each([
    {
      title: 'Edge API',
      url: routeUrl,
      init(importStatement) {
        context.api.write(`
          export default async function handler(request) {
            new (${importStatement})()
            return Response.json({ ok: true })
          }

          export const config = { runtime: 'edge' }
        `)
      },
    },
    {
      title: 'Middleware',
      url: middlewareUrl,
      init(importStatement) {
        context.middleware.write(`
          import { NextResponse } from 'next/server'

          export async function middleware(request) {
            new (${importStatement})()
            return NextResponse.next()
          }
        `)
      },
    },
  ])('$title dynamically importing 3rd party module', ({ init, url }) => {
    const moduleName = 'not-exist'
    const importStatement = `await import("${moduleName}")`

    beforeEach(() => init(importStatement))

    it('throws not-found module error in dev at runtime and highlights the faulty line', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      await retry(async () => {
        const res = await fetchViaHTTP(context.appPort, url)
        expect(res.status).toBe(500)

        const text = await res.text()
        expectModuleNotFoundDevError(moduleName, importStatement, text)
      })
    })
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        it('does not build and reports module not found error', async () => {
          const { code, stderr } = await nextBuild(context.appDir, undefined, {
            ignoreFail: true,
            stdout: true,
            stderr: true,
          })
          expect(code).toEqual(1)
          expectModuleNotFoundProdError(moduleName, stderr)
        })
      }
    )
  })

  describe.each([
    {
      title: 'Edge API',
      url: routeUrl,
      init(importStatement) {
        context.api.write(`
          export default async function handler(request) {
            if (process.env === 'production') {
              new (${importStatement})()
            }
            return Response.json({ ok: true })
          }

          export const config = { runtime: 'edge' }
        `)
      },
    },
    {
      title: 'Middleware',
      url: middlewareUrl,
      init(importStatement) {
        context.middleware.write(`
          import { NextResponse } from 'next/server'

          export async function middleware(request) {
            if (process.env === 'production') {
              new (${importStatement})()
            }
            return NextResponse.next()
          }
        `)
      },
    },
  ])('$title importing unused 3rd party module', ({ init, url }) => {
    const moduleName = 'not-exist'
    const importStatement = `await import("${moduleName}")`

    beforeEach(() => init(importStatement))

    it('throws not-found module error in dev at runtime and highlights the faulty line', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      await retry(async () => {
        const res = await fetchViaHTTP(context.appPort, url)
        expect(res.status).toBe(500)

        const text = await res.text()
        expectModuleNotFoundDevError(moduleName, importStatement, text)
      })
    })
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        it('does not build and reports module not found error', async () => {
          const { code, stderr } = await nextBuild(context.appDir, undefined, {
            ignoreFail: true,
            stdout: true,
            stderr: true,
          })
          expect(code).toEqual(1)

          expectModuleNotFoundProdError(moduleName, stderr)
        })
      }
    )
  })

  describe.each([
    {
      title: 'Edge API',
      url: routeUrl,
      init(importStatement) {
        context.api.write(`
          export default async function handler(request) {
            if (process.env === 'production') {
              (${importStatement}).spawn('ls', ['-lh', '/usr'])
            }
            return Response.json({ ok: true })
          }

          export const config = { runtime: 'edge' }
        `)
      },
    },
    {
      title: 'Middleware',
      url: middlewareUrl,
      init(importStatement) {
        context.middleware.write(`
          import { NextResponse } from 'next/server'

          export async function middleware(request) {
            if (process.env === 'production') {
              (${importStatement}).spawn('ls', ['-lh', '/usr'])
            }
            return NextResponse.next()
          }
        `)
      },
    },
  ])('$title importing unused node.js module', ({ init, url }) => {
    const moduleName = 'child_process'
    const importStatement = `await import("${moduleName}")`

    beforeEach(() => init(importStatement))

    it('does not throw in dev at runtime', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      await retry(async () => {
        const res = await fetchViaHTTP(context.appPort, url)
        expect(res.status).toBe(200)
        expectNoError(moduleName)
      })
    })
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        it('does not throw in production at runtime', async () => {
          const { stderr } = await nextBuild(context.appDir, undefined, {
            stderr: true,
          })
          expect(stderr).toContain(getUnsupportedModuleWarning(moduleName))

          let logs = { stdout: '', stderr: '' }
          const port = await findPort()

          const options = {
            onStdout(msg) {
              logs.output += msg
              logs.stdout += msg
            },
            onStderr(msg) {
              logs.output += msg
              logs.stderr += msg
            },
          }

          await nextStart(context.appDir, port, options)
          const res = await fetchViaHTTP(port, url)
          expect(res.status).toBe(200)

          expect(logs.output).not.toContain(
            getUnsupportedModuleWarning(moduleName)
          )
          expect(logs.output).not.toContain(getModuleNotFound(moduleName))
        })
      }
    )
  })
})
