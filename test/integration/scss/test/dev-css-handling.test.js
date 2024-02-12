/* eslint-env jest */

import { remove } from 'fs-extra'
import { File, findPort, killApp, launchApp, waitFor } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const fixturesDir = join(__dirname, '../..', 'scss-fixtures')

describe('Has CSS in computed styles in Development', () => {
  const appDir = join(fixturesDir, 'multi-page')

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

  it('should have CSS for page', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/page2')

      const currentColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('.blue-text')).color`
      )
      expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})

describe('Body is not hidden when unused in Development', () => {
  const appDir = join(fixturesDir, 'unused')

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
  const appDir = join(fixturesDir, 'unused')

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
