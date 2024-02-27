/* eslint-env jest */

import { remove } from 'fs-extra'
import { findPort, killApp, launchApp } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

describe('Has CSS Module in computed styles in Development', () => {
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

  it('should have CSS for page', async () => {
    const browser = await webdriver(appPort, '/')

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('#verify-red')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
  })
})
