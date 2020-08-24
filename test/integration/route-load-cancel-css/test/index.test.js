/* eslint-env jest */

import fs from 'fs-extra'
import {
  findPort,
  initNextServerScript,
  killApp,
  nextBuild,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 5)

let app
let appPort
const appDir = join(__dirname, '../')

function runTests() {
  it('should cancel slow page loads on re-navigation', async () => {
    const browser = await webdriver(appPort, '/')
    await waitFor(5000)

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
    const startServerlessEmulator = async (dir, port, buildId) => {
      const scriptPath = join(dir, 'server.js')
      const env = Object.assign(
        {},
        { ...process.env },
        { PORT: port, BUILD_ID: buildId }
      )
      return initNextServerScript(scriptPath, /ready on/i, env, false, {})
    }

    await fs.remove(join(appDir, '.next'))
    await nextBuild(appDir)

    const buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    appPort = await findPort()
    app = await startServerlessEmulator(appDir, appPort, buildId)
  })

  afterAll(async () => {
    await killApp(app)
  })

  runTests()
})
