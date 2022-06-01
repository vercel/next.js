/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const context = {}
context.appDir = join(__dirname, '../')

describe('Middleware base tests', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort)
    })

    afterAll(() => killApp(context.app))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(context.appDir, undefined, {
        stderr: true,
        stdout: true,
      })

      context.appPort = await findPort()
      context.app = await nextStart(context.appDir, context.appPort)
    })

    afterAll(() => killApp(context.app))

    runTests()
  })
})

function runTests() {
  it(`hard-navigates when preflight request failed`, async () => {
    const browser = await webdriver(context.appPort, `/error`)
    await browser.eval('window.__SAME_PAGE = true')
    await browser.elementByCss('#throw-on-preflight').click()
    await browser.waitForElementByCss('.refreshed')
    expect(await browser.eval('window.__SAME_PAGE')).toBeUndefined()
  })
}
