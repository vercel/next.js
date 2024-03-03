/* eslint-env jest */

import { remove } from 'fs-extra'
import { findPort, killApp, nextBuild, nextStart } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

describe('Has CSS Module in computed styles in Production', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = __dirname

    let appPort
    let app
    let stdout
    let code
    beforeAll(async () => {
      await remove(join(appDir, '.next'))
      ;({ code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      }))
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    it('should have compiled successfully', () => {
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it('should have CSS for page', async () => {
      const browser = await webdriver(appPort, '/')

      const currentColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-red')).color`
      )
      expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
    })
  })
})
