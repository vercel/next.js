/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { findPort, launchApp, killApp, waitFor, check } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app

const installCheckVisible = (browser) => {
  return browser.eval(`(function() {
      window.checkInterval = setInterval(function() {
      const root = document.querySelector('nextjs-portal').shadowRoot;
      const indicator = root.querySelector('[data-next-mark]')
      window.showedBuilder = window.showedBuilder || (
        indicator.getAttribute('data-next-mark-loading') === 'true'
      )
      if (window.showedBuilder) clearInterval(window.checkInterval)
    }, 5)
  })()`)
}

describe('Build Activity Indicator', () => {
  it('should validate buildActivityPosition config', async () => {
    let stderr = ''
    const configPath = join(appDir, 'next.config.js')
    await fs.writeFile(
      configPath,
      `
      module.exports = {
        devIndicators: {
          buildActivityPosition: 'ttop-leff'
        }
      }
    `
    )
    const app = await launchApp(appDir, await findPort(), {
      onStderr(msg) {
        stderr += msg
      },
    }).catch((err) => {
      console.error('got err', err)
    })
    await fs.remove(configPath)

    await check(
      () => stripAnsi(stderr),
      new RegExp(
        `Invalid "devIndicator.position" provided, expected one of top-left, top-right, bottom-left, bottom-right, received ttop-leff`
      )
    )

    if (app) {
      await killApp(app)
    }
  })

  describe.each(['pages', 'app'])('Enabled - (%s)', (pagesOrApp) => {
    beforeAll(async () => {
      await fs.remove(nextConfig)
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    ;(process.env.TURBOPACK ? describe.skip : describe)('webpack only', () => {
      it('Shows the build indicator when a page is built during navigation', async () => {
        const browser = await webdriver(
          appPort,
          pagesOrApp === 'pages' ? '/' : '/app'
        )
        await installCheckVisible(browser)
        await browser.elementByCss('#to-a').click()
        await waitFor(500)
        const wasVisible = await browser.eval('window.showedBuilder')
        expect(wasVisible).toBe(true)
        await browser.close()
      })
    })

    it('Shows build indicator when page is built from modifying', async () => {
      const browser = await webdriver(
        appPort,
        pagesOrApp === 'pages' ? '/b' : '/app/b'
      )
      await installCheckVisible(browser)
      const pagePath = join(
        appDir,
        pagesOrApp === 'pages' ? 'pages/b.js' : 'app/app/b/page.js'
      )
      const origContent = await fs.readFile(pagePath, 'utf8')
      const newContent = origContent.replace('b', 'c')

      await fs.writeFile(pagePath, newContent, 'utf8')
      await waitFor(500)
      const wasVisible = await browser.eval('window.showedBuilder')

      expect(wasVisible).toBe(true)
      await fs.writeFile(pagePath, origContent, 'utf8')
      await browser.close()
    })
  })
})
