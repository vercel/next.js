/* eslint-env jest */

import path from 'path'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  launchApp,
  findPort,
  killApp,
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')
let app
let appPort

const runTest = () => {
  it('Has correct initial ref values', async () => {
    const browser = await webdriver(appPort, '/')
    expect(await browser.elementByCss('#ref-val').text()).toContain('76px')
  })
}

describe('Initial Refs', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTest()
    }
  )
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTest()
    }
  )
})
