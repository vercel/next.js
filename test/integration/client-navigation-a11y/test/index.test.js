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
const appDir = join(__dirname, '../')

const navigateTo = async (browser, selector) =>
  await browser
    .waitForElementByCss('#' + selector + '-link')
    .click()
    .waitForElementByCss('#' + selector)

const getAnnouncedTitle = async (browser) =>
  await browser.waitForElementByCss('#__next-route-announcer__').text()

const getDocumentTitle = async (browser) => await browser.eval('document.title')

const getMainHeadingTitle = async (browser) =>
  await browser.elementByCss('h1').text()

describe('Client Navigation accessibility', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(appDir, context.appPort)

    const prerender = [
      '/page-with-h1-and-title, /page-with-h1, /page-with-title, /page-without-h1-or-title',
    ]

    await Promise.all(
      prerender.map((route) => renderViaHTTP(context.appPort, route))
    )
  })

  afterAll(() => killApp(context.server))

  describe('<RouteAnnouncer />', () => {
    it('should not have the initial route announced', async () => {
      const browser = await webdriver(context.appPort, '/')
      const title = await getAnnouncedTitle(browser)
      expect(title).toBe('')
    })

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

    describe('There is a title but no h1 tag', () => {
      it('has the innerText equal to the value of document.title', async () => {
        const browser = await webdriver(context.appPort, '/')
        await navigateTo(browser, 'page-with-title')

        const routeAnnouncerValue = await getAnnouncedTitle(browser)
        const title = await getDocumentTitle(browser)

        expect(routeAnnouncerValue).toBe(title)
        await browser.close()
      })
    })

    describe('There is no title but a h1 tag', () => {
      it('has the innerText equal to the value of h1', async () => {
        const browser = await webdriver(context.appPort, '/')
        await navigateTo(browser, 'page-with-h1')

        const routeAnnouncerValue = await getAnnouncedTitle(browser)
        const h1Value = await getMainHeadingTitle(browser)

        expect(routeAnnouncerValue).toBe(h1Value)
        await browser.close()
      })
    })

    describe('There is a title and a h1 tag', () => {
      it('has the innerText equal to the value of h1', async () => {
        const browser = await webdriver(context.appPort, '/')
        await navigateTo(browser, 'page-with-h1-and-title')

        const routeAnnouncerValue = await getAnnouncedTitle(browser)
        const title = await getDocumentTitle(browser)

        expect(routeAnnouncerValue).toBe(title)
        await browser.close()
      })
    })

    describe('There is no title and no h1 tag', () => {
      it('has the innerText equal to the value of the pathname', async () => {
        const browser = await webdriver(context.appPort, '/')
        await navigateTo(browser, 'page-without-h1-or-title')

        const routeAnnouncerValue = await getAnnouncedTitle(browser)
        const pathname = '/page-without-h1-or-title'

        expect(routeAnnouncerValue).toBe(pathname)
        await browser.close()
      })
    })
  })
})
