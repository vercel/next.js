/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { findPort, launchApp, killApp, waitFor } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 5)
const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app

const installCheckVisible = (browser) => {
  return browser.eval(`(function() {
    window.checkInterval = setInterval(function() {
      let watcherDiv = document.querySelector('#__next-dev-server-watcher')
      watcherDiv = watcherDiv.shadowRoot || watcherDiv
      window.showedBanner = window.showedBanner || (
        watcherDiv.querySelector('div').className.indexOf('visible') > -1
      )
      if (window.showedBanner) clearInterval(window.checkInterval)
    }, 50)
  })()`)
}

describe('Dev Server Watcher Banner', () => {
  describe('Enabled', () => {
    beforeAll(async () => {
      await fs.remove(nextConfig)
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })

    it('Adds the dev server watcher container', async () => {
      const browser = await webdriver(appPort, '/')
      const html = await browser.eval('document.body.innerHTML')
      expect(html).toMatch(/__next-dev-server-watcher/)
      await browser.close()
    })

    it('Shows the dev server disconnected banner when the dev server is not connected', async () => {
      const browser = await webdriver(appPort, '/')
      killApp(app)
      await installCheckVisible(browser)
      await waitFor(500)
      const wasVisible = await browser.eval('window.showedBanner')
      expect(wasVisible).toBe(true)
      await browser.close()
    })
  })

  describe('Disabled with next.config.js', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        'module.exports = { devIndicators: { devServerBanner: false } }',
        'utf8'
      )
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await fs.remove(nextConfig)
    })

    it('Does not add the banner container', async () => {
      const browser = await webdriver(appPort, '/')
      const html = await browser.eval('document.body.innerHTML')
      await killApp(app)
      await waitFor(500)
      expect(html).not.toMatch(/__next-dev-server-watcher/)
      await browser.close()
    })
  })
})
