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
  getBrowserBodyText,
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

  it('should detect the changes to typescript pages and display it', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/hello')
      await check(() => getBrowserBodyText(browser), /Hello World/)

      const pagePath = join(appDir, 'pages/hello.tsx')
      const originalContent = await fs.readFile(pagePath, 'utf8')
      const editedContent = originalContent.replace('Hello', 'COOL page')

      // change the content
      await fs.writeFile(pagePath, editedContent, 'utf8')
      await check(() => getBrowserBodyText(browser), /COOL page/)

      // add the original content
      await fs.writeFile(pagePath, originalContent, 'utf8')
      await check(() => getBrowserBodyText(browser), /Hello World/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
