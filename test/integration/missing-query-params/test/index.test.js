/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  nextBuild,
  nextStart,
  launchApp,
  killApp
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '..')
let appPort
let app

describe('Missing query params', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {})
  })
  afterAll(() => killApp(app))

  it('should not warn for same query params', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#same').click()
    const warn = await browser.eval(`window.displayedWarn`)
    await browser.close()
    expect(warn).not.toContain(
      'https://err.sh/zeit/next.js/missing-query-params'
    )
  })

  it('should not warn for different href then as', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#href').click()
    const warn = await browser.eval(`window.displayedWarn`)
    await browser.close()
    expect(warn).not.toContain(
      'https://err.sh/zeit/next.js/missing-query-params'
    )
  })

  it('should warn for different as then href', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#as').click()
    const warn = await browser.eval(`window.displayedWarn`)
    await browser.close()
    expect(warn).toContain('https://err.sh/zeit/next.js/missing-query-params')
  })

  it('should warn during dev and router transition', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#router').click()
    const warn = await browser.eval(`window.displayedWarn`)
    await browser.close()
    expect(warn).toContain('https://err.sh/zeit/next.js/missing-query-params')
  })

  describe('Production', () => {
    let prodApp
    beforeAll(async () => {
      appPort = await findPort()
      await nextBuild(appDir)
      prodApp = await nextStart(appDir, appPort, {})
    })
    afterAll(() => killApp(prodApp))
    it('should not warn during link transition', async () => {
      const browser = await webdriver(appPort, '/')
      await browser.elementByCss('#as').click()
      const warn = await browser.eval(`window.displayedWarn`)
      await browser.close()
      expect(warn).toBe(false)
    })

    it('should not warn during router transition', async () => {
      const browser = await webdriver(appPort, '/')
      await browser.elementByCss('#router').click()
      const warn = await browser.eval(`window.displayedWarn`)
      await browser.close()
      expect(warn).toBe(false)
    })
  })
})
