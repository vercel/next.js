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

    const prerender = [
      '/with-h1',
      '/with-h1-and-tab-index',
      '/with-main',
      '/without-main',
    ]

    await Promise.all(
      prerender.map((route) => renderViaHTTP(context.appPort, route))
    )
  })

  afterAll(() => killApp(context.server))

  describe('the next route has an h1 element', () => {
    it('brings focus to the h1 element', async () => {
      const browser = await webdriver(context.appPort, '/')
      await browser
        .waitForElementByCss('#with-h1-link')
        .click()
        .waitForElementByCss('#navigation-result-container')

      const isH1Focused = await browser.eval(
        'document.activeElement === document.querySelector("h1")'
      )
      expect(isH1Focused).toBe(true)

      await browser.close()
    })
  })

  describe('the next route has a main element', () => {
    it('brings focus to the main element', async () => {
      const browser = await webdriver(context.appPort, '/')
      await browser
        .waitForElementByCss('#with-main-link')
        .click()
        .waitForElementByCss('#navigation-result-container')

      const isMainFocused = await browser.eval(
        'document.activeElement === document.querySelector("main")'
      )
      expect(isMainFocused).toBe(true)

      await browser.close()
    })
  })

  describe('the next route has neither a main nor h1 element', () => {
    it('brings focus to the body', async () => {
      const browser = await webdriver(context.appPort, '/')
      await browser
        .waitForElementByCss('#without-main-link')
        .click()
        .waitForElementByCss('#navigation-result-container')

      const isBodyFocused = await browser.eval(
        'document.activeElement === document.body'
      )
      expect(isBodyFocused).toBe(true)
    })
  })

  describe('tabIndex of focused element does not exist', () => {
    it('is set to -1', async () => {
      const browser = await webdriver(context.appPort, '/')
      const tabIndex = await browser
        .waitForElementByCss('#with-h1-link')
        .click()
        .waitForElementByCss('#navigation-result-container')
        .elementByCss('h1')
        .getAttribute('tabIndex')

      expect(tabIndex).toBe('-1')
      await browser.close()
    })
  })

  describe('tabIndex of focused element exists', () => {
    it('does not change', async () => {
      const browser = await webdriver(context.appPort, '/')
      const tabIndex = await browser
        .waitForElementByCss('#with-h1-and-tab-index-link')
        .click()
        .waitForElementByCss('#navigation-result-container')
        .elementByCss('h1')
        .getAttribute('tabIndex')

      expect(tabIndex).toBe('2')

      await browser.close()
    })
  })
})
