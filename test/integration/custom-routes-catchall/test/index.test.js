/* eslint-env jest */
/* global jasmine */
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

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let appDir = join(__dirname, '..')
let buildId
let appPort
let app

const runTests = () => {
  it('should rewrite to /_next/static correctly', async () => {
    // ensure the bundle is built
    await renderViaHTTP(appPort, '/hello')

    const bundlePath = await join(
      '/docs/_next/static/',
      buildId,
      'pages/hello.js'
    )
    const data = await renderViaHTTP(appPort, bundlePath)
    expect(data).toContain('hello from hello.js')
  })

  it('should rewrite and render page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/docs/hello')
    expect(html).toMatch(/hello world/)
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
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
      buildId = 'development'
    })
    afterAll(() => killApp(app))
    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(() => killApp(app))
    runTests()
  })
})
