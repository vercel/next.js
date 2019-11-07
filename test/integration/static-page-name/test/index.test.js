/* eslint-env jest */
/* global jasmine */
import path from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = path.join(__dirname, '..')
const nextConfigPath = path.join(appDir, 'next.config.js')
let app
let appPort

const runTests = () => {
  it('should render the page via SSR correctly', async () => {
    const html = await renderViaHTTP(appPort, '/static')
    expect(html).toMatch(/hello from static page/)
  })

  it('should navigate to static page name correctly', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#to-static').click()
    await browser.waitForElementByCss('#static')
    const html = await browser.eval(`document.documentElement.innerHTML`)
    expect(html).toMatch(/hello from static page/)
  })
}

describe('Static Page Name', () => {
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
      appPort = await findPort()
      await nextBuild(appDir)
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      await fs.writeFile(
        nextConfigPath,
        'module.exports = { target: "serverless" }'
      )
      await nextBuild(appDir)
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      await fs.remove(nextConfigPath)
    })
    runTests()
  })
})
