/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  nextBuild,
  nextStart,
  findPort,
  launchApp,
  killApp,
  renderViaHTTP,
  killAll,
  File
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const appDir = join(__dirname, '..')
let appPort
let app

const runTests = () => {
  it('should work with normal page', async () => {
    const html = await renderViaHTTP(appPort, '/blog')
    expect(html).toContain('Blog - CPE')
  })

  it('should work dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/blog/nextjs')
    expect(html).toContain('Post - nextjs')
  })
}

describe('Custom page extension', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killAll(app))
    runTests()
  })

  describe('serverless mode', () => {
    const nextConfig = new File(join(appDir, 'next.config.js'))
    beforeAll(async () => {
      nextConfig.replace('server', 'serverless')
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
    })
    runTests()
  })
})
