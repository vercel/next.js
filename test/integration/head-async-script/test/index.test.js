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
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)

const appDir = path.join(__dirname, '..')
let app
let appPort

const runTests = () => {
  it('loads the async script once', async () => {
    const browser = await webdriver(appPort, '/')

    expect(await browser.eval('window.scriptLoaded')).toBe(1)
  })
}

describe('Head Async Script', () => {
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
