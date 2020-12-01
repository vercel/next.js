/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 5)

let app
let appPort
const appDir = join(__dirname, '../')

function runTests(dev) {
  it('should render from pages', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/PAGES/)
  })

  it('should render not render from src/pages', async () => {
    const html = await renderViaHTTP(appPort, '/hello')
    expect(html).toMatch(/404/)
  })
}

const nextConfig = join(appDir, 'next.config.js')

describe('Dynamic Routing', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      const curConfig = await fs.readFile(nextConfig, 'utf8')

      if (curConfig.includes('target')) {
        await fs.remove(nextConfig)
      }
      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('serverless production mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless' }`
      )

      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })
})
