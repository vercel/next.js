/* eslint-env jest */

import { join } from 'path'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')

let appPort
let app

const runTests = () => {
  it('should not trigger unncessary rerenders with rewrites', async () => {
    const browser = await webdriver(appPort, '/')
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(await browser.eval('window.__renders')).toEqual([undefined])
  })

  it('should rerender with the correct query parameter if present with rewrites', async () => {
    const browser = await webdriver(appPort, '/rewrite')
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(await browser.eval('window.__renders')).toEqual([undefined, 'bar'])
  })
}

describe('router rerender', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
