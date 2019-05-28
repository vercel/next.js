/* eslint-env jest */
/* global jasmine */
import fs from 'fs'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { findPort, launchApp, killApp, waitFor } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
const appDir = join(__dirname, '..')
let appPort
let app

const installCheckVisible = browser => {
  return browser.eval(`(function() {
    window.checkInterval = setInterval(function() {
      let watcherDiv = document.querySelector('#__next-build-watcher')
      watcherDiv = watcherDiv.shadowRoot || watcherDiv
      window.showedBuilder = window.showedBuilder || (
        watcherDiv.querySelector('div').className.indexOf('visible') > -1
      )
      if (window.showedBuilder) clearInterval(window.checkInterval)
    }, 50)
  })()`)
}

describe('Build Activity Indicator', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('Adds the build indicator container', async () => {
    const browser = await webdriver(appPort, '/')
    const html = await browser.eval('document.body.innerHTML')
    expect(html).toMatch(/__next-build-watcher/)
    await browser.close()
  })

  it('Shows the build indicator when a page is built during navigation', async () => {
    const browser = await webdriver(appPort, '/')
    await installCheckVisible(browser)
    await browser.elementByCss('#to-a').click()
    await waitFor(500)
    const wasVisible = await browser.eval('window.showedBuilder')
    expect(wasVisible).toBe(true)
    await browser.close()
  })

  it('Shows build indicator when page is built from modifying', async () => {
    const browser = await webdriver(appPort, '/b')
    await installCheckVisible(browser)
    const pagePath = join(appDir, 'pages/b.js')
    const origContent = fs.readFileSync(pagePath, 'utf8')
    const newContent = origContent.replace('b', 'c')

    fs.writeFileSync(pagePath, newContent, 'utf8')
    await waitFor(500)
    const wasVisible = await browser.eval('window.showedBuilder')

    expect(wasVisible).toBe(true)
    fs.writeFileSync(pagePath, origContent, 'utf8')
    await browser.close()
  })
})
