/* eslint-env jest */

import stripAnsi from 'next/dist/compiled/strip-ansi'
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
  middleware: new File(join(__dirname, '../middleware.js')),
  lib: new File(join(__dirname, '../lib.js')),
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

describe('Middleware with imports', () => {
  beforeEach(async () => {
    context.appPort = await findPort()
    context.logs = { output: '', stdout: '', stderr: '' }
  })

  afterEach(() => {
    if (context.app) {
      killApp(context.app)
    }
  })

  afterEach(() => {
    context.middleware.restore()
    context.lib.restore()
    context.page.restore()
  })

  describe('Middleware statically importing node.js module', () => {
    const moduleName = 'path'
    const importStatement = `import { basename } from "${moduleName}"`

    beforeEach(() => {
      context.middleware.write(`
import { NextResponse } from 'next/server'
${importStatement}

export async function middleware(request) {
  basename()
  return NextResponse.next()
}`)
    })

    it('throws unsupported module error in dev at runtime and highlights the faulty line', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(500)
      expectUnsupportedModuleDevError(
        moduleName,
        importStatement,
        await res.text()
      )
    })

    it('throws unsupported module error in production at runtime and prints error on logs', async () => {
      await nextBuild(context.appDir)
      context.app = await nextStart(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(500)
      expectUnsupportedModuleProdError(moduleName)
    })
  })

  describe('Middleware dynamically importing node.js module', () => {
    const moduleName = 'fs'
    const importStatement = `await import("${moduleName}")`

    beforeEach(() => {
      context.middleware.write(`
import { NextResponse } from 'next/server'

export async function middleware(request) {
  const { writeFile } = ${importStatement}
  return NextResponse.next()
}`)
    })

    it('throws unsupported module error in dev at runtime and highlights the faulty line', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(500)
      expectUnsupportedModuleDevError(
        moduleName,
        importStatement,
        await res.text()
      )
    })

    it('throws unsupported module error in production at runtime and prints error on logs', async () => {
      await nextBuild(context.appDir)
      context.app = await nextStart(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(500)
      expectUnsupportedModuleProdError(moduleName)
    })
  })

  describe('Middleware dynamically importing node.js module in a lib', () => {
    const moduleName = 'os'
    const importStatement = `await import("${moduleName}")`

    beforeEach(() => {
      context.middleware.write(`
import { NextResponse } from 'next/server'
import throwAsync from './lib'

export async function middleware(request) {
  await throwAsync()
  return NextResponse.next()
}`)
      context.lib.write(`
export default async function throwAsync() {
  (${importStatement}).cwd()
}`)
    })

    it('throws unsupported module error in dev at runtime and highlights the faulty line', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(500)
      expectUnsupportedModuleDevError(
        moduleName,
        importStatement,
        await res.text()
      )
    })

    it('throws unsupported module error in production at runtime and prints error on logs', async () => {
      await nextBuild(context.appDir)
      context.app = await nextStart(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(500)
      expectUnsupportedModuleProdError(moduleName)
    })
  })

  describe('Middleware statically importing 3rd party module', () => {
    const moduleName = 'not-exist'
    const importStatement = `import Unknown from "${moduleName}"`

    beforeEach(() => {
      context.middleware.write(`
import { NextResponse } from 'next/server'
${importStatement}

export async function middleware(request) {
  new Unknown()
  return NextResponse.next()
}`)
    })

    it('throws not-found module error in dev at runtime and highlights the faulty line', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
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

  describe('Middleware dynamically importing 3rd party module', () => {
    const moduleName = 'not-exist'
    const importStatement = `await import("${moduleName}")`

    beforeEach(() => {
      context.middleware.write(`
import { NextResponse } from 'next/server'

export async function middleware(request) {
  new (${importStatement})()
  return NextResponse.next()
}`)
    })

    it('throws not-found module error in dev at runtime and highlights the faulty line', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
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

  describe('Middleware importing unused 3rd party module', () => {
    const moduleName = 'not-exist'
    const importStatement = `await import("${moduleName}")`

    beforeEach(() => {
      context.middleware.write(`
import { NextResponse } from 'next/server'

export async function middleware(request) {
  if (process.env === 'production') {
    new (${importStatement})()
  }
  return NextResponse.next()
}`)
    })

    it('does not throw in dev at runtime', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
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

  describe('Middleware importing unused node.js module', () => {
    const moduleName = 'child_process'
    const importStatement = `await import("${moduleName}")`

    beforeEach(() => {
      context.middleware.write(`
import { NextResponse } from 'next/server'

export async function middleware(request) {
  if (process.env === 'production') {
    (${importStatement}).spawn('ls', ['-lh', '/usr'])
  }
  return NextResponse.next()
}`)
    })

    it('does not throw in dev at runtime', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(200)
      expectNoError(moduleName)
    })

    it('does not throw in production at runtime', async () => {
      await nextBuild(context.appDir)
      context.app = await nextStart(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(200)
      expectNoError(moduleName)
    })
  })

  describe('Middleware importing vanilla 3rd party module', () => {
    const moduleName = 'nanoid'
    const importStatement = `import { nanoid } from "${moduleName}"`

    beforeEach(() => {
      context.middleware.write(`
import { NextResponse } from 'next/server'
${importStatement}

export async function middleware(request) {
  const response = NextResponse.next()
  response.headers.set('x-from-middleware', nanoid())
  return response
}`)
    })

    it('does not throw in dev at runtime', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBeDefined()
      expectNoError(moduleName)
    })

    it('does not throw in production at runtime', async () => {
      await nextBuild(context.appDir)
      context.app = await nextStart(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBeDefined()
      expectNoError(moduleName)
    })
  })

  describe('Page statically importing node.js module', () => {
    const moduleName = 'child_process'
    const importStatement = `import { spawn } from "${moduleName}"`

    beforeEach(() => {
      context.page.write(`
${importStatement}

export default function Page() {
  spawn('ls', ['-lh', '/usr'])
  return <div>ok</div>
}`)
    })

    it('throws native error in dev at runtime and highlights the faulty line', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      // Need to request twice since the first response succeeds and is empty
      // See: https://github.com/vercel/next.js/issues/36387
      await fetchViaHTTP(context.appPort, '/')
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(500)

      const moduleNotFoundMessage = `Module not found: Can't resolve '${moduleName}'`
      expect(context.logs.output).toContain(moduleNotFoundMessage)
      expect(stripAnsi(context.logs.output)).toContain(importStatement)
      expect(await res.text()).toContain(escapeLF(moduleNotFoundMessage))
    })

    it('fails to build', async () => {
      await expect(nextBuild(context.appDir)).rejects.toThrow(
        `Module not found: Can't resolve '${moduleName}'`
      )
    })
  })
})

function getModuleNotFound(name) {
  return `Module not found: Can't resolve '${name}'`
}

function getUnsupportedModule(name) {
  return `The edge runtime does not support Node.js '${name}' module`
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
  expect(output).not.toContain(moduleNotSupportedMessage)
  const moduleNotFoundMessage = getModuleNotFound(moduleName)
  expect(output).toContain(moduleNotFoundMessage)
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
