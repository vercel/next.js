/* eslint-env jest */

import fsp from 'fs/promises'
import { join } from 'path'
import {
  fetchViaHTTP,
  File,
  findPort,
  launchApp,
  killApp,
  nextBuild,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))
const srcHeader = 'X-From-Src-Middleware'
const rootHeader = 'X-From-Root-Middleware'
const rootMiddlewareJSFile = join(appDir, 'middleware.js')
const rootMiddlewareTSFile = join(appDir, 'middleware.ts')

function runSingleMiddlewareTests() {
  it('loads an runs src middleware', async () => {
    const response = await fetchViaHTTP(appPort, '/post-1')
    expect(response.headers.has(srcHeader)).toBe(false)
    expect(response.headers.has(`${srcHeader}-TS`)).toBe(true)
  })
}

function runDoubleMiddlewareTests() {
  it('loads and runs only root middleware', async () => {
    const response = await fetchViaHTTP(appPort, '/post-1')
    expect(response.headers.has(srcHeader)).toBe(false)
    expect(response.headers.has(`${srcHeader}-TS`)).toBe(false)
    expect(response.headers.has(rootHeader)).toBe(false)
    expect(response.headers.has(`${rootHeader}-TS`)).toBe(true)
  })
}

async function writeRootMiddleware() {
  await fsp.cp(join(appDir, 'src/pages'), join(appDir, 'pages'), {
    force: true,
    recursive: true,
  })
  await fsp.writeFile(
    rootMiddlewareJSFile,
    `
import { NextResponse } from 'next/server'

export default function () {
const response = NextResponse.next()
response.headers.set('${rootHeader}', 'true')
return response
}`
  )
  await fsp.writeFile(
    rootMiddlewareTSFile,
    `
import { NextResponse } from 'next/server'

export default function () {
const response = NextResponse.next()
response.headers.set('${rootHeader}-TS', 'true')
return response
}`
  )
}

async function removeRootMiddleware() {
  await fsp.rm(
    rootMiddlewareJSFile,
    { force: true },
    { recursive: true, force: true }
  )
  await fsp.rm(
    rootMiddlewareTSFile,
    { force: true },
    { recursive: true, force: true }
  )
  await fsp.rm(
    join(appDir, 'pages'),
    { force: true, recursive: true },
    { recursive: true, force: true }
  )
}

describe.each([
  {
    title: 'Middleware in src/ folder',
    setup() {},
    teardown() {},
    runTest: runSingleMiddlewareTests,
  },
  {
    title: 'Middleware in src/ and / folders',
    setup: writeRootMiddleware,
    teardown: removeRootMiddleware,
    runTest: runDoubleMiddlewareTests,
  },
])('$title', ({ setup, teardown, runTest }) => {
  beforeAll(() => setup())
  afterAll(() => teardown())

  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTest()
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    let exportOutput = ''

    beforeAll(async () => {
      nextConfig.write(`module.exports = { output: 'export' }`)
      const result = await nextBuild(appDir, [], {
        stderr: true,
        stdout: true,
      })

      const outdir = join(__dirname, '..', 'out')
      await fsp.rm(outdir).catch(() => {}, { recursive: true, force: true })

      exportOutput = result.stderr + result.stdout
    })
    afterAll(() => nextConfig.delete())

    it('should warn about middleware on export', async () => {
      expect(exportOutput).toContain(
        'Statically exporting a Next.js application via `next export` disables API routes and middleware.'
      )
    })
  })
})
