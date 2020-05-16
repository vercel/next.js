/* eslint-env jest */

import path from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  launchApp,
  check,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)
const appDir = path.join(__dirname, '..')
let app
let appPort

const runTests = () => {
  it('hydrates correctly for normal page', async () => {
    const browser = await webdriver(appPort, '/')
    expect(await browser.eval('window.didHydrate')).toBe(true)
  })

  it('hydrates correctly for //', async () => {
    const browser = await webdriver(appPort, '//')
    expect(await browser.eval('window.didHydrate')).toBe(true)
  })

  it('should be able to navigate after loading //', async () => {
    const browser = await webdriver(appPort, '//')
    await browser.eval('window.beforeNav = true')
    await browser.eval('window.next.router.push("/details")')
    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /details/
    )
    expect(await browser.eval('window.beforeNav')).toBe(true)
  })
}

describe('Hydration', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      await fs.remove(path.join(appDir, '.next'))
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await fs.remove(path.join(appDir, '.next'))
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
