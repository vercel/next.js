/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  launchApp,
  killApp,
  nextStart,
  nextBuild,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 5)
let app
let appPort
const appDir = join(__dirname, '..')

const runTests = () => {
  it('should not have hydration mis-match for hash link', async () => {
    const browser = await webdriver(appPort, '/')
    const browserLogs = await browser.log('browser')
    let found = false
    browserLogs.forEach((log) => {
      if (log.message.includes('Warning: Prop')) {
        found = true
      }
    })
    expect(found).toEqual(false)
  })
}

describe('Link with hash href', () => {
  describe('development', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('production', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
