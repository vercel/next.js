/* eslint-env jest */

import { remove } from 'fs-extra'
import { findPort, killApp, launchApp, waitFor, File } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

describe('Body is not hidden when unused in Development', () => {
  const appDir = __dirname

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  let appPort
  let app
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should have body visible', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      const currentDisplay = await browser.eval(
        `window.getComputedStyle(document.querySelector('body')).display`
      )
      expect(currentDisplay).toBe('block')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})

describe('Body is not hidden when broken in Development', () => {
  const appDir = __dirname

  let appPort
  let app
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should have body visible', async () => {
    const pageFile = new File(join(appDir, 'pages/index.js'))
    let browser
    try {
      pageFile.replace('<div />', '<div>')
      await waitFor(2000) // wait for recompile

      browser = await webdriver(appPort, '/')
      const currentDisplay = await browser.eval(
        `window.getComputedStyle(document.querySelector('body')).display`
      )
      expect(currentDisplay).toBe('block')
    } finally {
      pageFile.restore()
      if (browser) {
        await browser.close()
      }
    }
  })
})
