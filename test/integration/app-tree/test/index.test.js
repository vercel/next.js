/* eslint-env jest */
/* global jasmine */
import path from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  launchApp,
  killApp,
  renderViaHTTP,
  waitFor,
  killAll
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const appDir = path.join(__dirname, '..')
const nextConfig = path.join(appDir, 'next.config.js')
let appPort
let app

const runTests = () => {
  it('should provide router context in AppTree on SSR', async () => {
    let html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/page:.*?\//)

    html = await renderViaHTTP(appPort, '/another')
    expect(html).toMatch(/page:.*?\/another/)
  })

  it('should provide router context in AppTree on CSR', async () => {
    const browser = await webdriver(appPort, '/')
    let html = await browser.eval(`document.documentElement.innerHTML`)
    expect(html).toMatch(/page:.*?\//)

    browser.elementByCss('#another').click()
    await waitFor(500)
    html = await browser.eval(`document.documentElement.innerHTML`)
    expect(html).toMatch(/page:.*?\//)

    browser.elementByCss('#home').click()
    await waitFor(500)
    html = await browser.eval(`document.documentElement.innerHTML`)
    expect(html).toMatch(/page:.*?\/another/)
  })
}

describe('Auto Export', () => {
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
      await killApp(app)
      await fs.remove(nextConfig)
    })
    runTests()
  })
})
