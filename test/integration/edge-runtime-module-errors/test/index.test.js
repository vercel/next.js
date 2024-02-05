/* eslint-disable jest/no-identical-title */
/* eslint-env jest */

import { remove } from 'fs-extra'
import { join } from 'path'
import {
  check,
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  retry,
} from 'next-test-utils'
import {
  appOption,
  context,
  expectModuleNotFoundDevError,
  expectModuleNotFoundProdError,
  expectNoError,
  expectUnsupportedModuleDevError,
  expectUnsupportedModuleProdError,
  getUnsupportedModuleWarning,
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
          import { NextResponse } from 'next/server'
  
          export default async function handler(request) {
            const { writeFile } = ${importStatement}
            return Response.json({ ok: writeFile() })
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
            const { writeFile } = ${importStatement}
            return NextResponse.next()
          }
        `)
      },
    },
  ])('$title dynamically importing node.js module', ({ init, url }) => {
    const moduleName = 'fs'
    const importStatement = `await import("${moduleName}")`

    beforeEach(() => init(importStatement))

    describe('development mode', () => {
      it('throws unsupported module error in dev at runtime and highlights the faulty line', async () => {
        context.app = await launchApp(
          context.appDir,
          context.appPort,
          appOption
        )
        await retry(async () => {
          const res = await fetchViaHTTP(context.appPort, url)
          expect(res.status).toBe(500)
          expectUnsupportedModuleDevError(
            moduleName,
            importStatement,
            await res.text()
          )
        })
      })
    })
    ;(process.env.TURBOPACK ? describe.skip : describe)(
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
          import throwAsync from '../../lib'
  
          export default async function handler(request) {
            return Response.json({ ok: await throwAsync() })
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
          import throwAsync from './lib'
  
          export async function middleware(request) {
            await throwAsync()
            return NextResponse.next()
          }
        `)
      },
    },
  ])(
    '$title dynamically importing node.js module in a lib',
    ({ init, url }) => {
      const moduleName = 'os'
      const importStatement = `await import("${moduleName}")`

      beforeEach(() => {
        init(importStatement)
        context.lib.write(`
        export default async function throwAsync() {
          (${importStatement}).cwd()
        }
      `)
      })

      describe('development mode', () => {
        it('throws unsupported module error in dev at runtime and highlights the faulty line', async () => {
          context.app = await launchApp(
            context.appDir,
            context.appPort,
            appOption
          )
          const res = await fetchViaHTTP(context.appPort, url)
          expect(res.status).toBe(500)
          await check(async () => {
            expectUnsupportedModuleDevError(
              moduleName,
              importStatement,
              await res.text()
            )
            return 'success'
          }, 'success')
        })
      })
      ;(process.env.TURBOPACK ? describe.skip : describe)(
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
    }
  )

  describe.each([
    {
      title: 'Edge API',
      url: routeUrl,
      init(importStatement) {
        context.api.write(`
          ${importStatement}
  
          export default async function handler(request) {
            new Unknown()
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
          ${importStatement}
  
          export async function middleware(request) {
            new Unknown()
            return NextResponse.next()
          }
        `)
      },
    },
  ])('$title statically importing 3rd party module', ({ init, url }) => {
    const moduleName = 'not-exist'
    const importStatement = `import Unknown from "${moduleName}"`

    beforeEach(() => init(importStatement))

    it('throws not-found module error in dev at runtime and highlights the faulty line', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(500)

      await check(async () => {
        expectModuleNotFoundDevError(
          moduleName,
          importStatement,
          await res.text()
        )
        return 'success'
      }, 'success')
    })
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        it('does not build and reports', async () => {
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
          ${importStatement}
          export default async function handler(request) {
            const response = Response.json({ ok: true })
            response.headers.set('x-from-runtime', nanoid())
            return response
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
            const response = NextResponse.next()
            response.headers.set('x-from-runtime', nanoid())
            return response
          }
        `)
      },
    },
  ])('$title importing vanilla 3rd party module', ({ init, url }) => {
    const moduleName = 'nanoid'
    const importStatement = `import { nanoid } from "${moduleName}"`

    beforeEach(() => init(importStatement))

    it('does not throw in dev at runtime', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-runtime')).toBeDefined()
      expectNoError(moduleName)
    })
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        it('does not throw in production at runtime', async () => {
          const { stderr } = await nextBuild(context.appDir, undefined, {
            stderr: true,
          })
          expect(stderr).not.toContain(getUnsupportedModuleWarning(moduleName))
          context.app = await nextStart(
            context.appDir,
            context.appPort,
            appOption
          )
          const res = await fetchViaHTTP(context.appPort, url)
          expect(res.status).toBe(200)
          expect(res.headers.get('x-from-runtime')).toBeDefined()
          expectNoError(moduleName)
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
          ${importStatement}

          export default async function handler(request) {
            const response = Response.json({ ok: true })
            response.headers.set('x-from-runtime', Buffer.isBuffer('a string'))
            return response
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
            const response = NextResponse.next()
            response.headers.set('x-from-runtime', Buffer.isBuffer('a string'))
            return response
          }
        `)
      },
    },
  ])('$title using Buffer polyfill', ({ init, url }) => {
    const moduleName = 'buffer'
    const importStatement = `import { Buffer } from "${moduleName}"`

    beforeEach(() => init(importStatement))

    it('does not throw in dev at runtime', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-runtime')).toBe('false')
      expectNoError(moduleName)
    })
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        it('does not throw in production at runtime', async () => {
          await nextBuild(context.appDir, undefined, { stderr: true })
          context.app = await nextStart(
            context.appDir,
            context.appPort,
            appOption
          )
          const res = await fetchViaHTTP(context.appPort, url)
          expect(res.status).toBe(200)
          expect(res.headers.get('x-from-runtime')).toBe('false')
          expectNoError(moduleName)
        })
      }
    )
  })
})
