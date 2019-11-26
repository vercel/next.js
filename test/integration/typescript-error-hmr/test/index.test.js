/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  launchApp,
  killApp,
  check,
  getReactErrorOverlayContent,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1
const appDir = join(__dirname, '..')
let appPort
let app

describe('TypeScript HMR', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should recover from a type error', async () => {
    let browser
    const pagePath = join(appDir, 'pages/type-error-recover.tsx')
    const origContent = await fs.readFile(pagePath, 'utf8')
    try {
      browser = await webdriver(appPort, '/type-error-recover')
      const errContent = origContent.replace('() =>', '(): boolean =>')

      await fs.writeFile(pagePath, errContent)
      await check(
        () => getReactErrorOverlayContent(browser),
        /Type 'Element' is not assignable to type 'boolean'/
      )

      await fs.writeFile(pagePath, origContent)
      await check(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        return html.match(/iframe/) ? 'fail' : 'success'
      }, /success/)
    } finally {
      if (browser) browser.close()
      await fs.writeFile(pagePath, origContent)
    }
  })
})
