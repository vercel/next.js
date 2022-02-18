/* eslint-env jest */

import fs from 'fs-extra'
import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

let app
let appPort
const appDir = join(__dirname, '../')

function runTests() {
  it('should cancel slow page loads on re-navigation', async () => {
    const browser = await webdriver(appPort, '/')

    await browser.elementByCss('#link-1').click()
    await waitFor(3000)
    expect(await browser.hasElementByCssSelector('#page-text')).toBeFalsy()

    await browser.elementByCss('#link-2').click()
    await waitFor(3000)

    const text2 = await browser.elementByCss('#page-text').text()
    expect(text2).toMatch(/2/)
    expect(await browser.eval('window.routeCancelled')).toBe('yes')
  })
}

describe('route cancel via CSS', () => {
  beforeAll(async () => {
    await fs.remove(join(appDir, '.next'))
    await nextBuild(appDir)

    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })

  afterAll(async () => {
    await killApp(app)
  })

  runTests()
})
