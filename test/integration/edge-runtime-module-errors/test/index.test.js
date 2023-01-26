/* eslint-disable jest/no-identical-title */
/* eslint-env jest */

import stripAnsi from 'next/dist/compiled/strip-ansi'
import { remove } from 'fs-extra'
import { join } from 'path'
import {
  fetchViaHTTP,
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const context = {
  appDir: join(__dirname, '../'),
  logs: { output: '', stdout: '', stderr: '' },
  api: new File(join(__dirname, '../pages/api/route.js')),
  lib: new File(join(__dirname, '../lib.js')),
  middleware: new File(join(__dirname, '../middleware.js')),
  page: new File(join(__dirname, '../pages/index.js')),
}
const appOption = {
  env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
  onStdout(msg) {
    context.logs.output += msg
    context.logs.stdout += msg
  },
  onStderr(msg) {
    context.logs.output += msg
    context.logs.stderr += msg
  },
}
const routeUrl = '/api/route'
const middlewareUrl = '/'

describe('Edge runtime code with imports', () => {
  beforeEach(async () => {
    context.appPort = await findPort()
    context.logs = { output: '', stdout: '', stderr: '' }
    await remove(join(__dirname, '../.next'))
  })

  afterEach(() => {
    if (context.app) {
      killApp(context.app)
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
    const moduleName = 'path'
    const importStatement = `import { basename } from "${moduleName}"`

    beforeEach(() => init(importStatement))

    it('throws unsupported module error in dev at runtime and highlights the faulty line', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(500)
      expectUnsupportedModuleDevError(
        moduleName,
        importStatement,
        await res.text()
      )
    })

    it('throws unsupported module error in production at runtime and prints error on logs', async () => {
      const { stderr } = await nextBuild(context.appDir, undefined, {
        stderr: true,
      })
      expect(stderr).toContain(getUnsupportedModuleWarning(moduleName))
      context.app = await nextStart(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(500)
      expectUnsupportedModuleProdError(moduleName)
    })
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

    it('throws unsupported module error in dev at runtime and highlights the faulty line', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(500)
      expectUnsupportedModuleDevError(
        moduleName,
        importStatement,
        await res.text()
      )
    })

    it('throws unsupported module error in production at runtime and prints error on logs', async () => {
      const { stderr } = await nextBuild(context.appDir, undefined, {
        stderr: true,
      })
      expect(stderr).toContain(getUnsupportedModuleWarning(moduleName))
      context.app = await nextStart(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(500)
      expectUnsupportedModuleProdError(moduleName)
    })
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

      it('throws unsupported module error in dev at runtime and highlights the faulty line', async () => {
        context.app = await launchApp(
          context.appDir,
          context.appPort,
          appOption
        )
        const res = await fetchViaHTTP(context.appPort, url)
        expect(res.status).toBe(500)
        expectUnsupportedModuleDevError(
          moduleName,
          importStatement,
          await res.text()
        )
      })

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
      expectModuleNotFoundDevError(
        moduleName,
        importStatement,
        await res.text()
      )
    })

    it('does not build and reports', async () => {
      const { code, stderr } = await nextBuild(context.appDir, undefined, {
        ignoreFail: true,
        stdout: true,
        stderr: true,
      })
      expect(code).toEqual(1)
      expectModuleNotFoundProdError(moduleName, stderr)
    })
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
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(500)
      expectModuleNotFoundDevError(
        moduleName,
        importStatement,
        await res.text()
      )
    })

    it('does not build and reports module not found error', async () => {
      const { code, stderr } = await nextBuild(context.appDir, undefined, {
        ignoreFail: true,
        stdout: true,
        stderr: true,
      })
      expect(code).toEqual(1)
      expectModuleNotFoundProdError(moduleName, stderr)
    })
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
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(500)
      expectModuleNotFoundDevError(
        moduleName,
        importStatement,
        await res.text()
      )
    })

    it('does not build and reports module not found error', async () => {
      const { code, stderr } = await nextBuild(context.appDir, undefined, {
        ignoreFail: true,
        stdout: true,
        stderr: true,
      })
      expect(code).toEqual(1)
      expectModuleNotFoundProdError(moduleName, stderr)
    })
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
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(200)
      expectNoError(moduleName)
    })

    it('does not throw in production at runtime', async () => {
      const { stderr } = await nextBuild(context.appDir, undefined, {
        stderr: true,
      })
      expect(stderr).toContain(getUnsupportedModuleWarning(moduleName))
      context.app = await nextStart(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(200)
      expectNoError(moduleName)
    })
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

    it('does not throw in production at runtime', async () => {
      const { stderr } = await nextBuild(context.appDir, undefined, {
        stderr: true,
      })
      expect(stderr).not.toContain(getUnsupportedModuleWarning(moduleName))
      context.app = await nextStart(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-runtime')).toBeDefined()
      expectNoError(moduleName)
    })
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

    it('does not throw in production at runtime', async () => {
      await nextBuild(context.appDir, undefined, { stderr: true })
      context.app = await nextStart(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-runtime')).toBe('false')
      expectNoError(moduleName)
    })
  })
})

function getModuleNotFound(name) {
  return `Module not found: Can't resolve '${name}'`
}

function getUnsupportedModule(name) {
  return `The edge runtime does not support Node.js '${name}' module`
}

function getUnsupportedModuleWarning(name) {
  return `A Node.js module is loaded ('${name}'`
}

function escapeLF(s) {
  return s.replace(/\n/g, '\\n')
}

function expectUnsupportedModuleProdError(
  moduleName,
  output = context.logs.output
) {
  const moduleNotSupportedMessage = getUnsupportedModule(moduleName)
  expect(output).toContain(moduleNotSupportedMessage)
  const moduleNotFoundMessage = getModuleNotFound(moduleName)
  expect(output).not.toContain(moduleNotFoundMessage)
}

function expectUnsupportedModuleDevError(
  moduleName,
  importStatement,
  responseText,
  output = context.logs.output
) {
  expectUnsupportedModuleProdError(moduleName, output)
  expect(stripAnsi(output)).toContain(importStatement)

  const moduleNotSupportedMessage = getUnsupportedModule(moduleName)
  expect(responseText).toContain(escapeLF(moduleNotSupportedMessage))

  const moduleNotFoundMessage = getModuleNotFound(moduleName)
  expect(responseText).not.toContain(escapeLF(moduleNotFoundMessage))
}

function expectModuleNotFoundProdError(
  moduleName,
  output = context.logs.output
) {
  const moduleNotSupportedMessage = getUnsupportedModule(moduleName)
  expect(stripAnsi(output)).not.toContain(moduleNotSupportedMessage)
  const moduleNotFoundMessage = getModuleNotFound(moduleName)
  expect(stripAnsi(output)).toContain(moduleNotFoundMessage)
}

function expectModuleNotFoundDevError(
  moduleName,
  importStatement,
  responseText,
  output = context.logs.output
) {
  expectModuleNotFoundProdError(moduleName, output)
  expect(stripAnsi(output)).toContain(importStatement)

  const moduleNotSupportedMessage = getUnsupportedModule(moduleName)
  expect(responseText).not.toContain(escapeLF(moduleNotSupportedMessage))

  const moduleNotFoundMessage = getModuleNotFound(moduleName)
  expect(responseText).toContain(escapeLF(moduleNotFoundMessage))
}

function expectNoError(moduleName) {
  expect(context.logs.output).not.toContain(getUnsupportedModule(moduleName))
  expect(context.logs.output).not.toContain(getModuleNotFound(moduleName))
}
