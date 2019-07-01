/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  launchApp,
  renderViaHTTP
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '../app')
let appPort
let app

function runTests () {
  it('should render styles during CSR', async () => {
    const browser = await webdriver(appPort, '/')
    const color = await browser.eval(
      `getComputedStyle(document.querySelector('button')).color`
    )

    expect(color).toMatch('0, 255, 255')
  })

  it('should render styles during CSR (AMP)', async () => {
    const browser = await webdriver(appPort, '/amp')
    const color = await browser.eval(
      `getComputedStyle(document.querySelector('button')).color`
    )

    expect(color).toMatch('0, 255, 255')
  })

  it('should render styles during SSR', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/color:.*?cyan/)
  })

  it('should render styles during SSR (AMP)', async () => {
    const html = await renderViaHTTP(appPort, '/amp')
    expect(html).toMatch(/color:.*?cyan/)
  })
}

describe('styled-jsx using in node_modules', () => {
  describe('Production', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('Development', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
