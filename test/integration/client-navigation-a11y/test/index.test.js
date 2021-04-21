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
      '/page-with-h1, /page-with-title, /page-without-h1-or-title',
    ]

    await Promise.all(
      prerender.map((route) => renderViaHTTP(context.appPort, route))
    )
  })

  afterAll(() => killApp(context.server))

  describe('<RouteAnnouncer />', () => {
    it('has aria-live="assertive" and role="alert"', async () => {
      const browser = await webdriver(context.appPort, '/')
      const routeAnnouncer = await browser.waitForElementByCss(
        '#__next-route-announcer__'
      )
      const ariaLiveValue = await routeAnnouncer.getAttribute('aria-live')
      const roleValue = await routeAnnouncer.getAttribute('role')

      expect(ariaLiveValue).toBe('assertive')
      expect(roleValue).toBe('alert')
      await browser.close()
    })
    describe('There is an h1 tag', () => {
      it('has the same innerText value as the h1 tag', async () => {
        const browser = await webdriver(context.appPort, '/')
        const h1Value = await browser
          .waitForElementByCss('#page-with-h1-link')
          .click()
          .waitForElementByCss('#page-with-h1')
          .elementByCss('h1')
          .text()

        const routeAnnouncerValue = await browser
          .waitForElementByCss('#__next-route-announcer__')
          .text()

        expect(h1Value).toBe(routeAnnouncerValue)
        await browser.close()
      })
    })
    describe('There is a document.title, but no h1 tag', () => {
      it('has the innerText equal to the value of document.title', async () => {
        const browser = await webdriver(context.appPort, '/')
        await browser
          .waitForElementByCss('#page-with-title-link')
          .click()
          .waitForElementByCss('#page-with-title')

        const title = await browser.eval('document.title')

        const routeAnnouncerValue = await browser
          .waitForElementByCss('#__next-route-announcer__')
          .text()

        expect(title).toBe(routeAnnouncerValue)
        await browser.close()
      })
    })
    describe('There is neither an h1 or a title tag', () => {
      it('has the innerText equal to the value of the pathname', async () => {
        const browser = await webdriver(context.appPort, '/')
        await browser
          .waitForElementByCss('#page-without-h1-or-title-link')
          .click()
          .waitForElementByCss('#page-without-h1-or-title')

        const pathname = '/page-without-h1-or-title'

        const routeAnnouncerValue = await browser
          .waitForElementByCss('#__next-route-announcer__')
          .text()

        expect(pathname).toBe(routeAnnouncerValue)
        await browser.close()
      })
    })
  })
})
