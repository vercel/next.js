/* eslint-env jest */
/* global jasmine */
import path from 'path'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  waitFor,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1
const appDir = path.join(__dirname, '..')

describe('Failing to load _error', () => {
  it('handles failing to load _error correctly', async () => {
    await nextBuild(appDir)
    const appPort = await findPort()
    const app = await nextStart(appDir, appPort)

    const browser = await webdriver(appPort, '/')
    await browser.eval(`window.beforeNavigate = true`)

    await browser.elementByCss('#to-broken').moveTo()
    await browser.waitForElementByCss('script[src*="broken.js"')

    // stop app so that _error can't be loaded
    await killApp(app)

    await browser.elementByCss('#to-broken').click()
    await waitFor(2000)

    expect(await browser.eval('window.beforeNavigate')).toBeFalsy()
  })
})
