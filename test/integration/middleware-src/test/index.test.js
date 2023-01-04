/* eslint-env jest */

import { promises as fs } from 'fs'
import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '../')
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
  await fs.cp(join(appDir, 'src/pages'), join(appDir, 'pages'), {
    force: true,
    recursive: true,
  })
  await fs.writeFile(
    rootMiddlewareJSFile,
    `
import { NextResponse } from 'next/server'

export default function () {
const response = NextResponse.next()
response.headers.set('${rootHeader}', 'true')
return response
}`
  )
  await fs.writeFile(
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
  await fs.rm(rootMiddlewareJSFile, { force: true })
  await fs.rm(rootMiddlewareTSFile, { force: true })
  await fs.rm(join(appDir, 'pages'), { force: true, recursive: true })
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

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTest()
  })
})
