/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'

let appDir = join(__dirname, '..')
let buildId
let appPort
let app

const runTests = () => {
  it('should rewrite and render page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/docs/hello')
    expect(html).toMatch(/hello world/)
  })

  it('should rewrite to /_next/static correctly', async () => {
    const bundlePath = await join(
      '/docs/_next/static/',
      buildId,
      '_buildManifest.js'
    )
    const data = await renderViaHTTP(appPort, bundlePath)
    expect(data).toContain('/hello')
  })

  it('should rewrite to public/static correctly', async () => {
    const data = await renderViaHTTP(appPort, '/docs/static/data.json')
    expect(data).toContain('some data...')
  })

  it('should rewrite to public file correctly', async () => {
    const data = await renderViaHTTP(appPort, '/docs/another.txt')
    expect(data).toContain('some text')
  })
}

describe('Custom routes', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
        buildId = 'development'
      })
      afterAll(() => killApp(app))
      runTests(true)
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
        buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
      })
      afterAll(() => killApp(app))
      runTests()
    }
  )
})
