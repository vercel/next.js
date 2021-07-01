/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { nextBuild, nextStart, findPort, killApp } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)

const appDir = join(__dirname, '..')
const navSel = '#nav'
const errorMessage = 'Application error: a client-side exception has occurred'

describe('Custom error page exception', () => {
  it('should handle errors from _error render', async () => {
    const { code } = await nextBuild(appDir)
    const appPort = await findPort()
    const app = await nextStart(appDir, appPort)
    const browser = await webdriver(appPort, '/')
    await browser.waitForElementByCss(navSel).elementByCss(navSel).click()
    const text = await (await browser.elementByCss('#__next')).text()
    killApp(app)

    expect(code).toBe(0)
    expect(text).toMatch(errorMessage)
  })
})
