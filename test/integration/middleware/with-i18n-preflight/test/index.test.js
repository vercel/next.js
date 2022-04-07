/* eslint-env jest */

import { join } from 'path'
import webdriver, { USE_SELENIUM } from 'next-webdriver'
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

const itif = (condition) => (condition ? it : it.skip)

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
  itif(!USE_SELENIUM)(
    `should send preflight for specified locale`,
    async () => {
      const browser = await webdriver(context.appPort, '/', {
        locale: 'en-US,en',
      })
      await browser.waitForElementByCss('.en')
      await browser.elementByCss('#link-ja').click()
      await browser.waitForElementByCss('.ja')
      await browser.elementByCss('#link-en').click()
      await browser.waitForElementByCss('.en')
      await browser.elementByCss('#link-fr').click()
      await browser.waitForElementByCss('.fr')
      await browser.elementByCss('#link-ja2').click()
      await browser.waitForElementByCss('.ja')
      await browser.elementByCss('#link-en2').click()
      await browser.waitForElementByCss('.en')
    }
  )
}
