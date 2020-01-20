/* eslint-env jest */
/* global jasmine */
import path from 'path'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  launchApp,
  findPort,
  waitFor,
  killApp,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1
const appDir = path.join(__dirname, '..')
let app
let appPort

const runTest = () => {
  it('Has correct initial ref values', async () => {
    const browser = await webdriver(appPort, '/')
    await waitFor(2000)
    expect(await browser.elementByCss('#ref-val').text()).toContain('76px')
  })
}

describe('Hydration', () => {
  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTest()
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTest()
  })
})
