/* eslint-env jest */

import {
  findPort,
  killApp,
  launchApp,
  renderViaHTTP,
} from '../../../lib/next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const context = {}
jest.setTimeout(1000 * 60 * 5)

describe('Client Navigation accessibility', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort, {
      env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
    })

    const prerender = ['/another-page']

    await Promise.all(
      prerender.map((route) => renderViaHTTP(context.appPort, route))
    )
  })

  afterAll(() => killApp(context.server))

  it('brings focus to the body', async () => {
    const browser = await webdriver(context.appPort, '/')
    await browser
      .waitForElementByCss('#another-page-link')
      .click()
      .waitForElementByCss('#another-page-container')

    const isBodyFocused = await browser.eval(
      'document.activeElement === document.body'
    )
    expect(isBodyFocused).toBe(true)
    await browser.close()
  })

  describe('tabIndex of focused element does not exist', () => {
    it('is set to -1', async () => {
      const browser = await webdriver(context.appPort, '/')
      await browser
        .waitForElementByCss('#another-page-link')
        .click()
        .waitForElementByCss('#another-page-container')

      const tabIndex = await browser.eval(
        'document.body.getAttribute("tabIndex")'
      )

      expect(tabIndex).toBe('-1')
      await browser.close()
    })
  })

  describe('tabIndex of focused element exists', () => {
    it('does not change', async () => {
      const browser = await webdriver(context.appPort, '/')
      await browser.eval('document.body.setAttribute("tabIndex", 2)')
      await browser
        .waitForElementByCss('#another-page-link')
        .click()
        .waitForElementByCss('#another-page-container')

      const tabIndex = await browser.eval(
        'document.body.getAttribute("tabIndex")'
      )

      expect(tabIndex).toBe('2')
      await browser.close()
    })
  })
})
