/* eslint-env jest */

import { join } from 'path'
import { promises as fs } from 'fs-extra'
import {
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '../')

function runTests() {
  it('should render from pages', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/PAGES/)
  })

  it('should render not render from src/pages', async () => {
    const html = await renderViaHTTP(appPort, '/hello')
    expect(html).toMatch(/404/)
  })

  it('should invoke root middleware only', async () => {
    const response = await fetchViaHTTP(appPort, '/hello')
    expect(response.headers.has('X-From-Src-Middleware')).toBe(false)
    expect(response.headers.has('X-From-Src-Middleware-TS')).toBe(false)
    expect(response.headers.has('X-From-Root-Middleware')).toBe(false)
    expect(response.headers.has('X-From-Root-Middleware-TS')).toBe(true)
  })
}

describe('Dynamic Routing', () => {
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
    afterAll(() => killApp(app))

    runTests()
  })

  describe.skip('serverless production mode', () => {
    const nextConfig = join(appDir, 'next.config.js')

    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless' }`
      )

      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })

    afterAll(async () => {
      await fs.rm(nextConfig, { force: true })
      await killApp(app)
    })

    runTests()
  })
})
