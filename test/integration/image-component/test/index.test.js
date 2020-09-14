/* eslint-env jest */

import { join } from 'path'
import { killApp, findPort, nextStart, nextBuild } from 'next-test-utils'
import webdriver from 'next-webdriver'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
let appPort
let app

describe('SSR Images', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))
  it('should import successfully SSR', async () => {
    const browser = await webdriver(appPort, '/')
    const text = await browser.elementByCss('#stubtext').text()

    expect(text).toBe('This is the index page')
  })
  it('should import successfully client side', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.waitForElementByCss('#clientlink').click()
    const text = await browser.waitForElementByCss('#stubtext').text()

    expect(text).toBe('This is a client side page')
  })
})
