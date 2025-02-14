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

// TODO(new-dev-overlay): Remove this once old dev overlay fork is removed
const isNewDevOverlay =
  process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY === 'true'

const installCheckVisible = (browser) => {
  if (isNewDevOverlay) {
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
  } else {
    return browser.eval(`(function() {
      window.checkInterval = setInterval(function() {
      let watcherDiv = document.querySelector('#__next-build-indicator')
      watcherDiv = watcherDiv.shadowRoot || watcherDiv
      window.showedBuilder = window.showedBuilder || (
        watcherDiv.querySelector('div').className.indexOf('visible') > -1
      )
      if (window.showedBuilder) clearInterval(window.checkInterval)
    }, 5)
  })()`)
  }
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
        `Invalid "devIndicator.buildActivityPosition" provided, expected one of top-left, top-right, bottom-left, bottom-right, received ttop-leff`
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

    // The indicator has no special container in the new dev overlay -
    // it's rendered as part of the indicator logo
    if (!isNewDevOverlay) {
      it('Adds the build indicator container', async () => {
        const browser = await webdriver(
          appPort,
          pagesOrApp === 'pages' ? '/' : '/app'
        )
        const html = await browser.eval('document.body.innerHTML')
        expect(html).toMatch(/__next-build-indicator/)
        await browser.close()
      })
    }

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

  describe.each(['pages', 'app'])(
    'Disabled with next.config.js - (%s)',
    (pagesOrApp) => {
      beforeAll(async () => {
        await fs.writeFile(
          nextConfig,
          'module.exports = { devIndicators: { buildActivity: false } }',
          'utf8'
        )
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })

      afterAll(async () => {
        await killApp(app)
        await fs.remove(nextConfig)
      })

      it('Does not add the build indicator container', async () => {
        const browser = await webdriver(
          appPort,
          pagesOrApp === 'pages' ? '/' : '/app'
        )
        const html = await browser.eval('document.body.innerHTML')
        expect(html).not.toMatch(/__next-build-indicator/)
        await browser.close()
      })
    }
  )
})
